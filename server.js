// =========================================
// SERVER for MIE + Planetary Vessel + SOVEREIGN CLOUD + SSA + P2P
// Root: C:\tup.org\vessel\server.js
// =========================================

"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const crypto = require("crypto");
const http = require("http");
const WebSocket = require("ws");

const app = express();

// ---------------------------------------------
// CORS: allow vessels from LAN / any origin to connect
// ---------------------------------------------
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

const port = 8080;
app.use(express.json());
// -----------------------------------------
// PATHS & CONSTANTS
// -----------------------------------------
const ROOT = __dirname;
const MIE_ROOT = path.join(ROOT, "mie");
const RUNTIME_DIR = path.join(MIE_ROOT, "runtime");
const LEDGER_FILE = path.join(MIE_ROOT, "ledger", "capsules.jsonl");
const SCAN_CACHE_FILE = path.join(RUNTIME_DIR, "last-scan.json");
const VESSEL_ID_FILE = path.join(RUNTIME_DIR, "vessel-id.json");
const SSA_KEY_FILE = path.join(RUNTIME_DIR, "ssa-key.json");
const CLOUD_ROOT = path.join(ROOT, "cloud");
const CLOUD_MIRRORS = path.join(CLOUD_ROOT, "mirrors");

// -----------------------------------------
// LEDGER WRITE QUEUE (atomic JSONL writer)
// -----------------------------------------
let ledgerQueue = Promise.resolve();

function appendLedgerLine(line) {
  // Always ensure newline termination
  if (!line.endsWith("\n")) line = line + "\n";

  ledgerQueue = ledgerQueue.then(() =>
    new Promise((resolve, reject) => {
      fs.appendFile(LEDGER_FILE, line, (err) => {
        if (err) reject(err);
        else resolve();
      });
    })
  );

  return ledgerQueue;
}

function appendCapsule(capsule) {
  const line = JSON.stringify(capsule) + "\n";
  return appendLedgerLine(line);
}

// -----------------------------------------
// HELPERS
// -----------------------------------------
// -------------------------------------------------------------
// Global broadcast helper (sends to all mesh websocket clients)
// -------------------------------------------------------------
function broadcast(obj) {
  const json = JSON.stringify(obj);
  // NOTE: wss is the mesh WebSocket server declared later in this file.
  // wssMesh was an old reference name — wss is the live declaration.
  // Safe to call here because broadcast() is only invoked from route
  // handlers and mesh message handlers, never at module parse time.
  if (typeof wss === "undefined") return;
  for (const ws of wss.clients) {
    if (ws.readyState === 1) {
      try { ws.send(json); } catch {}
    }
  }
}

// -----------------------------------------
// PLANETARY STATE BUILDER (UBSP semantics)
// -----------------------------------------

function deriveTopicFromIntent(intentStr) {
  const text = (intentStr || "").toLowerCase();
  if (text.includes('"topic":"food"')) return "food";
  if (text.includes('"topic":"shelter"')) return "shelter";
  if (text.includes('"topic":"comms"')) return "comms";
  if (text.includes('"topic":"ride"')) return "ride";
  if (text.includes('"topic":"skill"')) return "skill";
  return "other";
}

function deriveModeFromIntent(intentStr) {
  const text = (intentStr || "").toLowerCase();
  if (text.includes('"mode":"need"')) return "need";
  return "offer";
}

function deriveBodyFromIntent(intentStr) {
  // Very light-touch: grab "body":"..." if present,
  // otherwise fall back to the whole intent.
  try {
    const match = /"body"\s*:\s*"([^"]+)"/.exec(intentStr);
    if (match && match[1]) {
      return match[1];
    }
  } catch (e) {}
  return intentStr || "";
}

function deriveAuthorFromIntent(intentStr) {
  try {
    const match = /"author_handle"\s*:\s*"([^"]+)"/.exec(intentStr);
    if (match && match[1]) {
      return match[1];
    }
  } catch (e) {}
  return "unknown";
}

function buildPlanetaryState() {
  let thc = 0, cohesion = 0, risk = 0;

  try {
    if (fs.existsSync(SCAN_CACHE_FILE)) {
      const raw = fs.readFileSync(SCAN_CACHE_FILE, "utf8");
      const cache = JSON.parse(raw);

      thc = Number(cache.thc) || 0;
      cohesion = Number(cache.cohesion) || 0;
      risk = Number(cache.risk) || 0;
    }
  } catch (e) {
    console.warn("planetary-state-error", e);
  }

  return {
    thc: Number(thc) || 0,
    cohesion: Number(cohesion) || 0,
    risk: Number(risk) || 0,
    policy: {
      metrics: {
        thc_max: 0.28,
        drift_min: 0.4,
        risk_max: 0.35,
        cohesion_target: 0.5
      },
      weights: {
        thc_weight: 0.7,
        cohesion_weight: 1.5,
        risk_weight: 1.0,
        stability_weight: 1.2
      }
    }
  };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(RUNTIME_DIR);
ensureDir(path.dirname(LEDGER_FILE));

function readJSONSafe(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.warn("Could not read JSON at", p, ":", e.message);
    return fallback;
  }
}

// Read last capsule (for fallback state)
function readLastCapsule() {
  if (!fs.existsSync(LEDGER_FILE)) return null;
  const lines = fs.readFileSync(LEDGER_FILE, "utf8")
    .split(/\r?\n/)
    .filter(l => l.trim().length > 0);
  if (!lines.length) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

function readAllCapsules() {
  if (!fs.existsSync(LEDGER_FILE)) return [];
  const lines = fs.readFileSync(LEDGER_FILE, "utf8")
    .split(/\r?\n/)
    .filter(l => l.trim().length > 0);
  const arr = [];
  for (const l of lines) {
    try { arr.push(JSON.parse(l)); } catch {}
  }
  return arr;
}

function buildTopology() {
  const vesselInfo = ensureVesselId();
  const localState = getCurrentPlanetaryState();
  const capsules = readAllCapsules();

  const nodes = {};
  const edges = [];

  // Local node
  nodes[vesselInfo.id] = {
    vessel_id: vesselInfo.id,
    created: vesselInfo.created,
    role: "local",
    planetary_state: localState
  };

  // SPS handshake capsules → edges + remote nodes
  for (const cap of capsules) {
    if (cap?.payload?.intent !== "SPS handshake event") continue;
    const h = cap.payload.handshake || {};
    const local = h.local || {};
    const remote = h.remote || {};

    const localId = local.vessel_id || vesselInfo.id;
    const remoteId = remote.vessel_id || "remote:unknown";

    if (!nodes[localId]) {
      nodes[localId] = {
        vessel_id: localId,
        role: "peer",
        planetary_state: local.planetary_state || null
      };
    }
    if (!nodes[remoteId]) {
      nodes[remoteId] = {
        vessel_id: remoteId,
        role: "remote",
        planetary_state: remote.planetary_state || null
      };
    }

    edges.push({
      type: "sps-handshake",
      from: localId,
      to: remoteId,
      mode: h.mode,
      contexts: h.contexts,
      resonance: h.resonance,
      ts: h.ts
    });
  }

  return {
    local_vessel_id: vesselInfo.id,
    nodes: Object.values(nodes),
    edges
  };
}

// -----------------------------------------
// VESSEL ID
// -----------------------------------------
function ensureVesselId() {
  let obj = readJSONSafe(VESSEL_ID_FILE, null);
  if (!obj || !obj.id) {
    obj = {
      id: `urn:vessel:${crypto.randomBytes(4).toString("hex")}`,
      created: new Date().toISOString()
    };
    ensureDir(path.dirname(VESSEL_ID_FILE));
    fs.writeFileSync(VESSEL_ID_FILE, JSON.stringify(obj, null, 2));
  }
  return obj;
}

// -----------------------------------------
// SSA (SOVEREIGN SIGNING AGENT) KEY MGMT
// -----------------------------------------
let ssaKey = null;

function ensureSSAKey() {
  if (ssaKey) return ssaKey;

  const existing = readJSONSafe(SSA_KEY_FILE, null);
  if (existing && existing.publicKey && existing.privateKey) {
    ssaKey = existing;
    console.log("🔐 SSA keypair loaded.");
    return ssaKey;
  }

  console.log("🔐 Generating new SSA Ed25519 keypair...");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  ssaKey = { publicKey, privateKey };
  ensureDir(path.dirname(SSA_KEY_FILE));
  fs.writeFileSync(SSA_KEY_FILE, JSON.stringify(ssaKey, null, 2));
  console.log("🔐 SSA keypair generated and stored.");
  return ssaKey;
}

function signCapsule(capsule) {
  const key = ensureSSAKey();
  if (!key) return;

  const data = JSON.stringify({
    id: capsule.id,
    ts: capsule.ts,
    payload: capsule.payload,
    vessel_id: capsule.meta.vessel_id,
    scan_state: capsule.meta.scan_state
  });

  const sig = crypto.sign(null, Buffer.from(data), key.privateKey).toString("base64");

  capsule.meta.ssa = {
    present: true,
    alg: "ed25519",
    publicKey: key.publicKey,
    signature: sig
  };
}

// -----------------------------------------
// SCAN STATE
// -----------------------------------------
function getCurrentPlanetaryState() {
  // 1. Try scan cache
  if (fs.existsSync(SCAN_CACHE_FILE)) {
    try {
      const s = JSON.parse(fs.readFileSync(SCAN_CACHE_FILE, "utf8"));
      // Normalize format: expect thc.score, drift.cohesion, unified.risk
      const baseTHC = s.thc?.score ?? s.thc ?? 0.28;
      const baseCoh = s.drift?.cohesion ?? s.cohesion ?? 0.375;
      const baseRisk = s.unified?.risk ?? s.risk ?? 0.418;
      return {
        thc: baseTHC,
        cohesion: baseCoh,
        risk: baseRisk,
        policy: s.policy || {}
      };
    } catch (e) {
      console.warn("⚠️ Could not read scan cache:", e.message);
    }
  }

  // 2. Try last capsule
  const last = readLastCapsule();
  if (last?.meta?.scan_state) return last.meta.scan_state;

  // 3. Default baseline
  return {
    thc: 0.28,
    cohesion: 0.375,
    risk: 0.418,
    policy: {
      metrics: {
        thc_max: 0.28,
        drift_min: 0.4,
        risk_max: 0.35,
        cohesion_target: 0.5
      },
      weights: {
        thc_weight: 0.7,
        cohesion_weight: 1.5,
        risk_weight: 1.0,
        stability_weight: 1.2
      }
    }
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// -----------------------------------------
// SEMANTIC DRIFT ENGINE
// -----------------------------------------
function deriveSemanticDrift(intent) {
  const text = (intent || "").toLowerCase();
  let dTHC = 0;
  let dCoh = 0;
  let dRisk = 0;

if (intent.includes("field_presence") || intent.includes("field_ack")) {
  return { dTHC: 0, dCoh: 0, dRisk: 0 };
}

  // Ubuntu / harmony / regeneration
  if (text.match(/\b(ubuntu|harmony|together|collective|regeneration|healing|cooperate|cooperation|trust)\b/)) {
    dCoh += 0.05;
    dRisk -= 0.04;
  }

  // Threshold / sensitivity / critical
  if (text.match(/\b(threshold|sensitivity|critical|edge|tipping)\b/)) {
    dTHC += 0.06;
    dRisk += 0.02;
  }

  // Crisis / collapse / conflict
  if (text.match(/\b(crisis|collapse|conflict|unstable|fragile|chaos)\b/)) {
    dRisk += 0.07;
    dCoh -= 0.05;
  }

  // Growth / build / opportunity
  if (text.match(/\b(growth|build|opportunity|emerge|emerging|create|creation)\b/)) {
    dTHC += 0.03;
    dCoh += 0.04;
    dRisk -= 0.02;
  }

  // Diaspora / SIDS
  if (text.match(/\b(diaspora|sids|small island|marginalized|periphery)\b/)) {
    dTHC += 0.02;
    dCoh += 0.02;
  }

  return { dTHC, dCoh, dRisk };
}

function applySemanticDrift(raw, index) {
  const n = Math.max(index, 1);            // capsule index (1-based)

  // Nonlinear part: diminishing as n grows (logistic-ish)
  const logisticFactor = 1 / (1 + 0.08 * n);   // early capsules have more effect

  // Harmonic part: gentle wave over time
  const omega = Math.PI / 12;                 // ~24 capsules per full cycle
  const phase = 0;
  const harmonic = Math.sin(phase + omega * n);

  // Blend:
  // - semantic raw vector scaled by logistic
  // - plus small harmonic oscillation so the planet “breathes”
  const baseAmp = logisticFactor;
  const harmonicAmp = 0.5 * logisticFactor;   // harmonic shrinks as system matures

  return {
    dTHC:
      (raw.dTHC * baseAmp) +
      (harmonic * harmonicAmp * 0.02),

    dCoh:
      (raw.dCoh * baseAmp) +
      (harmonic * harmonicAmp * -0.015),

    dRisk:
      (raw.dRisk * baseAmp) +
      (harmonic * harmonicAmp * 0.018),
  };
}

function getCapsuleCount() {
  if (!fs.existsSync(LEDGER_FILE)) return 0;
  const lines = fs.readFileSync(LEDGER_FILE, "utf8")
    .split(/\r?\n/)
    .filter(l => l.trim().length > 0);
  return lines.length;
}

function buildCapsuleState(intent) {
  const base = getCurrentPlanetaryState();
  const raw = deriveSemanticDrift(intent);
  const index = getCapsuleCount() + 1;   // this will be the Nth capsule

  // Apply hybrid drift
  const blended = applySemanticDrift(raw, index);

  const baseTHC = base.thc ?? base.thc?.score ?? 0.28;
  const baseCoh = base.cohesion ?? base.drift?.cohesion ?? 0.375;
  const baseRisk = base.risk ?? base.unified?.risk ?? 0.418;

  const thc = clamp(baseTHC + blended.dTHC, 0, 1);
  const cohesion = clamp(baseCoh + blended.dCoh, 0, 1);
  const risk = clamp(baseRisk + blended.dRisk, 0, 1);

  return {
    thc,
    cohesion,
    risk,
    policy: base.policy || {}
  };
}

function computeAlignment(protocol) {
  const topo = buildTopology();
  const localId = topo.local_vessel_id;
  const nodes = topo.nodes || [];

  const localNode = nodes.find(n => n.vessel_id === localId);
  const localState = localNode?.planetary_state || getCurrentPlanetaryState();

  // Collect all nodes that have planetary_state
  const withState = nodes.filter(n => n.planetary_state &&
    typeof n.planetary_state.thc === "number" &&
    typeof n.planetary_state.cohesion === "number" &&
    typeof n.planetary_state.risk === "number"
  );

  // If no other planetary nodes, centroid = local
  if (!withState.length) {
    return {
      protocol,
      local: localState,
      centroid: localState,
      deltas: { thc_delta: 0, cohesion_delta: 0, risk_delta: 0 },
      suggestion: localState,
      notes: ["No other planetary nodes available; alignment is trivially centered on local vessel."]
    };
  }

  // Compute centroid across all nodes with state
  let sumTHC = 0, sumCoh = 0, sumRisk = 0;
  withState.forEach(n => {
    sumTHC += n.planetary_state.thc;
    sumCoh += n.planetary_state.cohesion;
    sumRisk += n.planetary_state.risk;
  });

  const centroid = {
    thc: sumTHC / withState.length,
    cohesion: sumCoh / withState.length,
    risk: sumRisk / withState.length
  };

  const deltas = {
    thc_delta: centroid.thc - localState.thc,
    cohesion_delta: centroid.cohesion - localState.cohesion,
    risk_delta: centroid.risk - localState.risk
  };

  // Simple distance measure for intuition
  const dist = Math.sqrt(
    Math.pow(deltas.thc_delta, 2) +
    Math.pow(deltas.cohesion_delta, 2) +
    Math.pow(deltas.risk_delta, 2)
  );

  // Protocol-specific interpretation (advisory only)
  const notes = [];
  const suggestion = { ...localState };

  const p = (protocol || "ubuntu").toLowerCase();

  if (p === "ubuntu") {
    // Aim: tighten cohesion, ease risk, modest THC adjustment
    notes.push("Ubuntu: prioritize mutual cohesion and gentle risk easing.");
    suggestion.cohesion = (localState.cohesion * 0.6) + (centroid.cohesion * 0.4);
    suggestion.risk = (localState.risk * 0.7) + (centroid.risk * 0.3);
    suggestion.thc = (localState.thc * 0.8) + (centroid.thc * 0.2);
  } else if (p === "diaspora") {
    // Aim: accept some distance, avoid fragmentation
    notes.push("Diaspora: distance is not failure; alignment seeks bridges, not sameness.");
    if (dist > 0.15) {
      notes.push("Local vessel is significantly offset from centroid; emphasize bridge-building contexts.");
    }
    suggestion.cohesion = (localState.cohesion * 0.8) + (centroid.cohesion * 0.2);
    suggestion.risk = (localState.risk * 0.85) + (centroid.risk * 0.15);
    suggestion.thc = localState.thc; // preserve local intensity
  } else if (p === "regeneration") {
    // Aim: move from scarcity/high-risk toward abundance/lower-risk
    notes.push("Regeneration: transform risk/fragility into resilient abundance.");
    suggestion.risk = (localState.risk * 0.5) + (centroid.risk * 0.5);
    suggestion.cohesion = (localState.cohesion * 0.5) + (centroid.cohesion * 0.5);
    suggestion.thc = (localState.thc * 0.6) + (centroid.thc * 0.4);
  } else {
    notes.push(`Unknown protocol '${protocol}', using neutral interpretation.`);
  }

  notes.push(`Planetary distance (THC/Cohesion/Risk) ≈ ${dist.toFixed(3)}`);

  return {
    protocol: p,
    local: localState,
    centroid,
    deltas,
    suggestion,
    nodes: nodes.length,
    notes
  };
}

// -----------------------------------------
// API: VESSEL ID + SSA STATUS
// -----------------------------------------
app.get("/api/mie/vessel-id", (req, res) => {
  const v = ensureVesselId();
  const ssa = ensureSSAKey();
  res.json({
    id: v.id,
    created: v.created,
    ssa_present: !!ssa,
    ssa_alg: "ed25519"
  });
});

app.get("/api/mie/live", (req, res) => {
  try {
    const since = Number(req.query.since || 0);

    if (!fs.existsSync(LEDGER_FILE)) {
      // No ledger yet → empty items, but still surface hybrid metrics
      const state = getCurrentPlanetaryState();
      const hybridMetrics = {
        metrics: {
          thc: state.thc || state.thc?.score || 0,
          cohesion: state.cohesion || state.drift?.cohesion || 0,
          risk: state.risk || state.unified?.risk || 0,
          drift: state.drift || 0,
          thmc: state.thmc || 0.75,
          sgf: state.sgf || 0.22
        }
      };
      return res.json({
        items: [],
        hybrid: hybridMetrics
      });
    }

    const linesRaw = fs.readFileSync(LEDGER_FILE, "utf8")
      .trim()
      .split("\n")
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((c) => c && c.ts && (!since || c.ts > since));

    const state = getCurrentPlanetaryState();
    const hybridMetrics = {
      metrics: {
        thc: state.thc || state.thc?.score || 0,
        cohesion: state.cohesion || state.drift?.cohesion || 0,
        risk: state.risk || state.unified?.risk || 0,
        drift: state.drift || 0,
        thmc: state.thmc || 0.75,
        sgf: state.sgf || 0.22
      }
    };

    const existingPayload = { items: linesRaw };

    return res.json({
      ...existingPayload,
      hybrid: hybridMetrics
    });
  } catch (e) {
    console.error("live-feed-error", e);
    // Fail soft: still send something the vessel UI can handle
    const fallbackState = getCurrentPlanetaryState();
    return res.status(200).json({
      items: [],
      hybrid: {
        metrics: {
          thc: fallbackState.thc || fallbackState.thc?.score || 0,
          cohesion: fallbackState.cohesion || fallbackState.drift?.cohesion || 0,
          risk: fallbackState.risk || fallbackState.unified?.risk || 0,
          drift: fallbackState.drift || 0,
          thmc: fallbackState.thmc || 0.75,
          sgf: fallbackState.sgf || 0.22
        }
      }
    });
  }
});

// -----------------------------------------
// API: SCAN (MIE)
// -----------------------------------------

// -----------------------------------------
// UNIFIED UBUNTU FIELD FEED
// -----------------------------------------
app.get("/api/field/feed", (req, res) => {
  const since = Number(req.query.since || 0);   // epoch timestamp
  const channel = req.query.channel || null;
  const scope = req.query.scope || null;

  if (!fs.existsSync(LEDGER_FILE)) {
    return res.json({ items: [] });
  }

  const lines = fs.readFileSync(LEDGER_FILE, "utf8")
    .trim()
    .split("\n")
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter((c) => c && c.payload && c.payload.intent)
    .map((c) => {
      const intent = c.payload.intent;
      const idx = intent.indexOf("obj=");
      if (idx === -1) return null;

      try {
        const obj = JSON.parse(intent.slice(idx + 4));
        return { capsule: c, obj };
      } catch {
        return null;
      }
    })
    .filter(x => x && x.obj.type === "field_post")
    .filter(({ obj }) => {
      if (!obj.ts) return false;
      if (since && obj.ts <= since) return false;
      if (channel && obj.channel !== channel) return false;
      if (scope && obj.scope !== scope) return false;
      return true;
    })
    .map(({ capsule, obj }) => {
      return {
        capsule_id: capsule.id || capsule.ts || obj.ts,
        intent: capsule.payload.intent,
        ts: obj.ts
      };
    });

  res.json({ items: lines });
});

// -----------------------------------------
// UBUNTU FIELD ACKS PROJECTION
// -----------------------------------------
app.get("/api/field/acks", (req, res) => {
  const target = req.query.target;
  if (!target) {
    return res.json({ items: [] });
  }

  if (!fs.existsSync(LEDGER_FILE)) {
    return res.json({ items: [] });
  }

  const lines = fs.readFileSync(LEDGER_FILE, "utf8")
    .trim()
    .split("\n")
    .map(l => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(c => c && c.payload && c.payload.intent)
    .map(c => {
      const intent = c.payload.intent;
      const idx = intent.indexOf("obj=");
      if (idx === -1) return null;
      try {
        const obj = JSON.parse(intent.slice(idx + 4));
        return { capsule: c, obj };
      } catch {
        return null;
      }
    })
    .filter(x => x && x.obj.type === "field_ack")
    .filter(({ obj }) => {
      const tid = obj.target_id || obj.target_capsule_id || "";
      return tid === target;
    })
    .map(({ capsule, obj }) => ({
      capsule_id: capsule.id || capsule.ts || obj.ts,
      intent: capsule.payload.intent,
      ts: obj.ts || capsule.ts
    }));

  res.json({ items: lines });
});

app.get("/api/mie/scan", (req, res) => {
  const mieJS = path.join(ROOT, "mie.js");
  execFile("node", [mieJS, "--scan", "--json"], (err, stdout) => {
    if (err) {
      console.error("MIE scan error:", err.message);
      // Fallback to last cached state
      const fallback = getCurrentPlanetaryState();
      return res.json({
        thc: { score: fallback.thc },
        drift: { cohesion: fallback.cohesion },
        unified: { risk: fallback.risk },
        policy: fallback.policy
      });
    }
    try {
      const scanObj = JSON.parse(stdout);
      fs.writeFileSync(SCAN_CACHE_FILE, JSON.stringify(scanObj, null, 2));
      return res.json(scanObj);
    } catch (e) {
      console.error("MIE scan parse error:", e.message);
      const fallback = getCurrentPlanetaryState();
      return res.json({
        thc: { score: fallback.thc },
        drift: { cohesion: fallback.cohesion },
        unified: { risk: fallback.risk },
        policy: fallback.policy
      });
    }
  });
});

// -----------------------------------------
// API: CAPSULES (GET/POST)
// -----------------------------------------
app.get("/api/mie/capsules", (req, res) => {
  if (!fs.existsSync(LEDGER_FILE)) return res.json([]);
  const lines = fs.readFileSync(LEDGER_FILE, "utf8")
    .split(/\r?\n/)
    .filter(l => l.trim().length > 0);
  const arr = [];
  for (const l of lines) {
    try { arr.push(JSON.parse(l)); } catch {/*skip*/ }
  }
  res.json(arr);
});

app.post("/api/mie/capsules", (req, res) => {
  try {
    const capsule = req.body || {};

    // Optional: debug log
    // console.log("[MIE] Capsule received:", capsule);

    // Always acknowledge as OK
    res.json({ ok: true });
  } catch (err) {
    console.error("MIE capsule error:", err);
    // Never fail the vessel – still respond 200
    res.status(200).json({ ok: true });
  }
});

// -----------------------------------------
// SOVEREIGN CLOUD: CONTEXTS & VESSELS
// -----------------------------------------
app.get("/api/cloud/contexts", (req, res) => {
  if (!fs.existsSync(CLOUD_MIRRORS)) {
    return res.json({ contexts: [] });
  }
  const contexts = fs.readdirSync(CLOUD_MIRRORS)
    .filter(name => fs.statSync(path.join(CLOUD_MIRRORS, name)).isDirectory())
    .map(name => ({ name }));
  res.json({ contexts });
});

app.get("/api/cloud/contexts/:ctx/vessels", (req, res) => {
  const ctx = req.params.ctx;
  const ctxDir = path.join(CLOUD_MIRRORS, ctx, "vessels");
  if (!fs.existsSync(ctxDir)) return res.json({ vessels: [] });

  const vessels = fs.readdirSync(ctxDir)
    .filter(name => fs.statSync(path.join(ctxDir, name)).isDirectory())
    .map(name => {
      const meta = readJSONSafe(path.join(ctxDir, name, "meta.json"), {});
      return {
        dir: name,
        vessel_id: meta.vessel_id || name,
        created: meta.created || null
      };
    });

  res.json({ vessels });
});

app.get("/api/cloud/contexts/:ctx/vessels/:vdir/capsules", (req, res) => {
  const { ctx, vdir } = req.params;
  const ledger = path.join(CLOUD_MIRRORS, ctx, "vessels", vdir, "capsules.jsonl");
  if (!fs.existsSync(ledger)) return res.json({ capsules: [] });

  const lines = fs.readFileSync(ledger, "utf8")
    .split(/\r?\n/)
    .filter(l => l.trim().length > 0);
  const arr = [];
  for (const l of lines) {
    try { arr.push(JSON.parse(l)); } catch {/*skip*/ }
  }
  res.json({ capsules: arr });
});

// -----------------------------------------
// P2P / SPS: HELLO + HANDSHAKE (WITH SSA)
// -----------------------------------------
app.get("/api/sps/hello", (req, res) => {
  const vessel = ensureVesselId();
  const state = getCurrentPlanetaryState();
  const ssa = ensureSSAKey();

  res.json({
    vessel_id: vessel.id,
    created: vessel.created,
    contexts: ["ubsp-lab", "ubuntu", "diaspora"],   // FIXED
    modes: ["local", "lan", "wan"],
    status: "online",
    ts: new Date().toISOString(),
    planetary_state: state,
    ssa: {
      present: true,
      alg: "ed25519",
      publicKey: ssa.publicKey
    }
  });
});


// Store handshake capsule
function appendHandshakeCapsule(handshake) {
  const vesselInfo = ensureVesselId();
  const state = getCurrentPlanetaryState();

  const capsule = {
    id: `urn:capsule:${crypto.randomBytes(4).toString("hex")}`,
    ts: new Date().toISOString(),
    payload: {
      intent: "SPS handshake event",
      handshake
    },
    meta: {
      vessel_id: vesselInfo.id,
      ssa_present: true,
      scan_state: state
    }
  };
capsule.capsule_id = capsule.id;

  signCapsule(capsule);
  appendCapsule(capsule);
}

// -----------------------------------------
// UMOJA FIELD SNAPSHOT (EFI overlay)
// -----------------------------------------
let lastFieldPulse = null;

function getFieldSnapshot() {
  const now = Date.now();

  let planetary = {};
  try {
    planetary = buildPlanetaryState() || {};
  } catch (e) {
    console.error("planetary-state-error", e);
    planetary = { thc: 0, cohesion: 0, risk: 0 };
  }

  let vessel;
  try {
    vessel = ensureVesselId();
  } catch (e) {
    console.error("vessel-id-error", e);
    vessel = { id: "unknown" };
  }

  let bowlsTotal = 0;
  let bowlsOpen = 0;
  let bowlsResolved = 0;
  let lastActivityTs = null;

  try {
    const lines = fs.existsSync(LEDGER_FILE)
      ? fs.readFileSync(LEDGER_FILE, "utf8").trim().split(/\r?\n/)
      : [];

    const recent = lines.slice(-500);

    for (const l of recent) {
      let c;
      try {
        c = JSON.parse(l);
      } catch {
        continue;
      }

      if (!c || !c.payload) continue;
      const p = c.payload;

 // SEMANTIC BOWLS — any activity in the Ubuntu Field counts
if (p.channel === "umoja_field") {
  bowlsTotal++;

  // status may be: "open" | "resolved" | undefined
  if (p.status === "open" || !p.status) {
    // If no status: treat as open (offer/request/message-anchor)
    bowlsOpen++;
  }

  if (p.status === "resolved") {
    bowlsResolved++;
  }
}

      if (c.ts) {
        const t = Date.parse(c.ts);
        if (!Number.isNaN(t) && (!lastActivityTs || t > lastActivityTs)) {
          lastActivityTs = t;
        }
      }
    }
  } catch (e) {
    console.error("ledger-scan-error", e);
  }

  return {
    ts: new Date(now).toISOString(),
    vessel_id: vessel.id,
    scope: "ubuntu",
    bowls: {
      total: bowlsTotal,
      open: bowlsOpen,
      resolved: bowlsResolved
    },
    activity: {
      last_capsule_ts: lastActivityTs
        ? new Date(lastActivityTs).toISOString()
        : null
    },
    planetary
  };
}

// -----------------------------------------
// API: UMOJA FIELD STATE (HUD)
// -----------------------------------------
app.get("/api/umoja/field-state", (req, res) => {
  try {
    const snapshot = getFieldSnapshot();
    res.json({ ok: true, field: snapshot });
  } catch (e) {
    console.error(">>> FIELD STATE ERROR <<<");
    console.error("Message:", e.message);
    console.error("Stack:", e.stack);
    console.error("Location: /api/umoja/field-state");
    res.status(500).json({ ok: false, error: "field-state-error" });
  }
});

// -----------------------------------------
//  API: TOPOLOGY
// -----------------------------------------
app.get("/api/mie/topology", (req, res) => {
  try {
    const topo = buildTopology();
    res.json(topo);
  } catch (e) {
    console.error("Topology error:", e);
    res.status(500).json({ error: "topology-failed", message: e.message });
  }
});

// -----------------------------------------
// API: ALIGNMENT (Stage 3.1)
// -----------------------------------------

app.get("/api/mie/alignment", (req, res) => {
  try {
    const protocol = (req.query.protocol || "ubuntu").toLowerCase();
    const report = computeAlignment(protocol);
    res.json(report);
  } catch (e) {
    console.error("Alignment error:", e);
    res.status(500).json({ error: "alignment-failed", message: e.message });
  }
});

// UT Capsule Submission
app.post("/api/ut/capsule", (req, res) => {
  try {
    const capsule = req.body;
    const line = JSON.stringify(capsule) + "\n";
    appendCapsule(capsule);
    res.json({ ok: true, capsule });
  } catch (err) {
    res.status(500).json({ error: "failed-to-save", message: err.message });
  }
});

// UT Token Balance (read-only)
app.get("/api/ut/tokens", (req, res) => {
  const lines = fs.readFileSync(LEDGER_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);

  const balances = lines
    .filter(c => c.type === "ut_mvr_token_issuance")
    .reduce((acc, c) => {
      acc[c.token_symbol] = (acc[c.token_symbol] || 0) + c.tokens_minted;
      return acc;
    }, {});

  res.json({ balances });
});

// -------------------------------------------------------
// UT TOKEN MINTING ENGINE
// -------------------------------------------------------
app.post("/api/ut/mint", (req, res) => {
  try {
    const { token_symbol, amount, resource_type } = req.body;

    if (!token_symbol || !amount) {
      return res.status(400).json({ error: "missing-fields" });
    }

    const capsule = {
      type: "ut_mvr_token_issuance",
      token_symbol,
      resource_type: resource_type || "carbon",
      tokens_minted: Number(amount),
      ts: new Date().toISOString(),
      contexts: ["unbuntu-trust", "token", "mint"]
    };

    const line = JSON.stringify(capsule) + "\n";
    fs.appendFileSync(LEDGER_FILE, line);

    res.json({ ok: true, capsule });
  } catch (err) {
    res.status(500).json({ error: "mint-failed", message: err.message });
  }
});

// -----------------------------------------
// SPS INITIATE HANDSHAKE (LOCAL / LAN / WAN)
// -----------------------------------------
app.post("/api/sps/initiate", async (req, res) => {
  const body = req.body || {};
  const mode = body.mode || "local";
  const contexts = body.contexts || ["default"];   // FIXED SAFE DEFAULT
  const target = body.target || body.target_url || "http://localhost:8080/api/sps/hello";

  const vessel = ensureVesselId();
  const state = getCurrentPlanetaryState();
  const ssa = ensureSSAKey();

  const local = {
    vessel_id: vessel.id,
    created: vessel.created,
    contexts: ["ubsp-lab", "ubuntu", "diaspora"],
    modes: ["local", "lan", "wan"],
    planetary_state: state,
    ssa: {
      present: !!ssa,
      alg: "ed25519",
      publicKey: ssa.publicKey
    }
  };


  // -------------------
  // 1️⃣ LOCAL LOOPBACK
  // -------------------
  if (mode === "local") {
    const localHello = readJSONSafe(path.join(ROOT, "api", "sps", "hello.json"), null);
    const remote = localHello || local;

    const handshake = {
      local,
      remote,
      mode,
      contexts,
      target,
      ts: new Date().toISOString()
    };

    appendHandshakeCapsule(handshake);
    return res.json({ ok: true, handshake });
  }

  // -------------------
  // 2️⃣ LAN / WAN MODE
  // -------------------
  if (mode === "lan" || mode === "wan") {
    try {
      const remoteResp = await fetch(target);

      const ct = remoteResp.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error(`Expected JSON, received content-type: ${ct}`);
      }

      const remoteHello = await remoteResp.json();

      // RESONANCE DELTA
      const localState = getCurrentPlanetaryState();
      const remoteState = remoteHello.planetary_state || {};

      const resonance = {
        thc_delta: Number(remoteState.thc) - Number(localState.thc),
        coh_delta: Number(remoteState.cohesion) - Number(localState.cohesion),
        risk_delta: Number(remoteState.risk) - Number(localState.risk)
      };

      const handshake = {
        local,
        remote: remoteHello,
        mode,
        contexts,
        target,
        resonance,
        ts: new Date().toISOString()
      };

      appendHandshakeCapsule(handshake);
      return res.json({ ok: true, handshake });

    } catch (e) {
      console.error("LAN SPS error:", e);
      return res.status(502).json({
        ok: false,
        error: e.message
      });
    }
  }

  return res.status(400).json({ ok: false, error: "Invalid mode" });
});
// -----------------------------------------
// EXPRESS BASICS
// -----------------------------------------


// Serve UI from /mie and root
app.use("/vessel", express.static(path.join(ROOT, "mie")));
app.use("/", express.static(path.join(ROOT, "mie"))); // default to vessel UI

// *** ADD THIS: direct root route ***
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "mie", "mie-vessel.html"));
});

// ─────────────────────────────────────────────────────────────────────────────
// FORMATION TRANSPORT JS — served from server (one source of truth, v2.2)
// <script src="http://[LAN-IP]:8080/formation-transport.js"></script>
// ─────────────────────────────────────────────────────────────────────────────
const FORMATION_TRANSPORT_JS = `/**
 * FormationTransport v2.4
 * ─────────────────────────────────────────────────────────────────────────────
 * Sovereign formation channel. Standalone first, networked when available.
 *
 * SEND path (no duplicates):
 *   - WS connected  → send via WS only (server fans out to everyone)
 *   - WS down/none  → send via BC only (same-browser, standalone)
 *   Never both. Server fans out cross-device AND same-browser when WS is up.
 *
 * RECEIVE path (both always active):
 *   - WS: hub events, cross-device messages, formation_snapshot/departure
 *   - BC: same-browser messages arriving while WS is reconnecting
 *
 * Dedup: messages received on both paths within 500ms are suppressed.
 *
 * Mobile (no BroadcastChannel): WS only — full functionality via server.
 * Standalone (no server): BC only — full original same-browser capability.
 * ─────────────────────────────────────────────────────────────────────────────
 */
class FormationTransport {

  static autoUrl() {
    if (typeof window === "undefined") return "";
    var proto = window.location.protocol === "https:" ? "wss" : "ws";
    var host  = window.location.hostname;
    if (!host || host === 'localhost') {
      // Try stored URL from a previously-configured vessel (hull/file context)
      try {
        var stored = localStorage.getItem('bib_formation_server_url') ||
                     localStorage.getItem('spm_formation_server_url') || '';
        if (stored) return stored;
      } catch(e) {}
      if (!host) return ''; // truly unknown
    }
    return proto + "://" + host + ":8080";
  }

  constructor(opts) {
    opts = opts || {};
    this._serverUrl      = (opts.serverUrl || "").replace(/\\/$/, "").replace(/\\/formation$/, "");
    this._debug          = !!opts.debug;
    this._ws             = null;
    this._bc             = null;
    this._mode           = "none";
    this._reconnectN     = 0;
    this._reconnectTimer = null;
    this._pingTimer      = null;
    this._offlineQueue   = [];
    this._closed         = false;
    this._seen           = {};   // dedup: msgKey → timestamp
    this.onmessage       = null;
    this.onopen          = null;  // called when WS connects (vessel can announce immediately)

    this._log("v2.4 server:", this._serverUrl || "(none — standalone BC)");
    this._initBC();
    this._connect();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  postMessage(obj) {
    if (this._closed) return;

    // One-shot messages (departures) must never enter the offline queue.
    // If WS is down when a departure fires, send via BC (same-browser) only.
    // Replaying a departure on reconnect would falsely evict a vessel that
    // has already reconnected and is heartbeating normally.
    var isOneShot = (obj._type === 'bibbos_formation_departure' ||
                     obj._type === 'bibbos_formation_departure');

    // Single send path — WS if connected, BC otherwise. Never both.
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      try { this._ws.send(JSON.stringify(obj)); return; } catch (e) { this._log("ws send:", e); }
    }

    if (this._bc) {
      try { this._bc.postMessage(obj); return; } catch (e) {}
    }

    // Neither WS nor BC — queue for sync burst on reconnect.
    // Departure messages are dropped here: the hub's grace period handles
    // vessel eviction when the WS closes, making a replayed departure redundant.
    if (!isOneShot) {
      this._queueOffline(obj);
    }
  }

  close() {
    this._closed = true;
    this._clearTimers();
    if (this._ws) { try { this._ws.close(1000, "closed"); } catch {} }
    if (this._bc) { try { this._bc.close(); } catch {} }
    this._ws = null; this._bc = null; this._mode = "none";
  }

  get mode()      { return this._mode; }
  get connected() { return !!(this._ws && this._ws.readyState === WebSocket.OPEN); }

  // ── Internal ───────────────────────────────────────────────────────────────

  _initBC() {
    if (typeof BroadcastChannel === "undefined") { this._log("BC unavailable (mobile)"); return; }
    try {
      var self = this;
      this._bc = new BroadcastChannel("spm-formation");
      this._bc.onmessage = function (evt) { self._routeInbound(evt.data, "bc"); };
      if (this._mode === "none") this._mode = "bc";
      this._log("BC open (standalone path)");
    } catch (e) { this._log("BC failed:", e); }
  }

  _connect() {
    if (this._closed || !this._serverUrl) return;
    if (typeof WebSocket === "undefined") return;
    this._connectWS();
  }

  _connectWS() {
    var url = this._serverUrl + "/formation";
    var self = this;
    var ws;
    try { ws = new WebSocket(url); } catch (e) { this._log("WS failed:", e); return; }
    this._ws = ws;

    ws.onopen = function () {
      self._log("WS open");
      self._mode = "ws";
      self._reconnectN = 0;
      self._clearTimers();
      self._startPing();
      self._flushOfflineQueue();
      // Notify vessel so it can announce immediately — no artificial delay needed
      if (self.onopen) { try { self.onopen(); } catch(e) {} }
    };

    ws.onmessage = function (evt) {
      var msg; try { msg = JSON.parse(evt.data); } catch { return; }
      self._routeInbound(msg, "ws");
    };

    ws.onerror = function (e) { self._log("WS error:", e.type || e); };

    ws.onclose = function (evt) {
      self._log("WS closed:", evt.code);
      self._clearTimers();
      self._ws = null;
      if (self._closed) return;
      if (self._mode === "ws") self._mode = self._bc ? "bc" : "none";
      // Exponential backoff: 2s, 4s, 8s, 16s, 30s cap — reduces server churn on mobile
      var MAX_RECONNECT = 20;
      if (self._reconnectN < MAX_RECONNECT) {
        var delay = Math.min(30000, 2000 * Math.pow(1.5, self._reconnectN));
        self._reconnectN++;
        self._log("reconnecting in", Math.round(delay/1000) + "s (attempt " + self._reconnectN + ")");
        self._reconnectTimer = setTimeout(function () { self._connectWS(); }, delay);
      }
    };
  }

  _routeInbound(msg, source) {
    if (!msg || typeof msg !== "object") return;
    var type = msg._type || msg.type || "";

    // Dedup — only for non-heartbeat messages (heartbeats always have unique ts)
    var isHeartbeat = (type === 'bibbos_formation_heartbeat' || type === 'spm_formation_heartbeat' || type === 'masthead_heartbeat');
    if (!isHeartbeat) {
      var key = this._msgKey(msg);
      if (key) {
        var now = Date.now();
        if (this._seen[key] && (now - this._seen[key]) < 500) {
          this._log("dedup suppressed:", type, "from", source);
          return;
        }
        this._seen[key] = now;
        if (Object.keys(this._seen).length > 200) {
          var _self = this; var cutoff = now - 2000;
          Object.keys(this._seen).forEach(function(k){ if(_self._seen[k] < cutoff) delete _self._seen[k]; });
        }
      }
    }

    // Translate hub departure
    if (type === "formation_departure" && msg.vesselId && msg._hub) {
      if (this.onmessage) try { this.onmessage({ data: {
        _type:"bibbos_formation_departure", vesselId:msg.vesselId,
        entityName:msg.entityName||msg.label||null, _hub:true
      }}); } catch {}
      return;
    }

    if (type === "formation_pong") return;

    if (this.onmessage) try { this.onmessage({ data: msg }); } catch {}
  }

  _msgKey(msg) {
    // Build a dedup key from stable fields — ts + vesselId + type
    var type = msg._type || msg.type || "";
    var vid  = msg.vesselId || msg._vesselId || "";
    var ts   = msg.ts || "";
    if (!type || (!vid && !ts)) return null;
    return type + "|" + vid + "|" + ts;
  }

  _queueOffline(obj) {
    if (this._offlineQueue.length >= 64) this._offlineQueue.shift();
    this._offlineQueue.push({ obj: obj, ts: Date.now() });
    this._log("queued:", obj._type || "?");
  }

  _flushOfflineQueue() {
    if (!this._offlineQueue.length) return;
    var self = this; var q = this._offlineQueue.splice(0);
    q.forEach(function (item) {
      if (self._ws && self._ws.readyState === WebSocket.OPEN) {
        try { self._ws.send(JSON.stringify(
          Object.assign({}, item.obj, { _offline: true, _offlineTs: item.ts })
        )); } catch {}
      }
    });
  }

  _startPing() {
    var self = this;
    // Send an immediate ping on open — proves alive to server before first heartbeat
    try { self._ws.send(JSON.stringify({ _type: "formation_ping", ts: Date.now() })); } catch {}
    // Then every 10s — well under any mobile NAT timeout
    this._pingTimer = setInterval(function () {
      if (self._ws && self._ws.readyState === WebSocket.OPEN) {
        try { self._ws.send(JSON.stringify({ _type: "formation_ping", ts: Date.now() })); } catch {}
      }
    }, 10000);
  }

  _clearTimers() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this._pingTimer)      { clearInterval(this._pingTimer);      this._pingTimer = null; }
  }

  _log() {
    if (!this._debug) return;
    var a = Array.prototype.slice.call(arguments);
    console.log.apply(console, ["[FT]"].concat(a));
  }
}

window.FormationTransport = FormationTransport;
`;
app.get("/formation-transport.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(FORMATION_TRANSPORT_JS);
});

// -----------------------------------------
// HTTP SERVER WRAPPER (for WebSocket mesh)
// -----------------------------------------
const server = http.createServer(app);

// ─────────────────────────────────────────────────────────────────────────────
// SOVEREIGN FORMATION HUB  (stateful — single source of formation truth)
// Every vessel connects directly: ws://[LAN-IP]:8080/formation
// Registry, snapshot-on-join, departure broadcast, offline sync, REST endpoint.
//
// Memory management:
//   • Registry stores only a compact identity+status record per vessel (not full payload)
//   • Heartbeat payloads are NOT merged into registry — only named fields are extracted
//   • Departure timers deduplicated per vesselId — only one timer per vessel at a time
//   • formationMsgs resets at 10M to prevent bignum allocation
// ─────────────────────────────────────────────────────────────────────────────
const formationClients  = new Map();  // cid → { ws, label, alive, vesselId }
const formationRegistry = new Map();  // vesselId → compact record (NOT full payload)
let   formationSeq  = 0;
let   formationMsgs = 0;
const FORMATION_QUIET = new Set(["spm_formation_heartbeat","bibbos_formation_heartbeat","formation_ping"]);

// ── Compact registry record — only what the hub needs for snapshot + departure ──
// Never stores full heartbeat payload. Keeps memory bounded regardless of payload size.
function makeRegistryRecord(vesselId, parsed, remoteIP) {
  // Store a compact record — enough for snapshot delivery and key lookup.
  // _intentions is included but CAPPED: only id, name, vesselKey, status per entry.
  // Full intention objects (3KB+ each) are NOT stored — they are relayed live.
  // This keeps the registry bounded while enabling SPM key lookup from snapshot.
  const intentionsSummary = Array.isArray(parsed._intentions)
    ? parsed._intentions.slice(0, 50).map(i => ({
        id:         i.id         || null,
        name:       i.name       || '',
        vesselKey:  i.vesselKey  || null,
        status:     i.status     || null,
        sector:     i.sector     || null,
        targetDate: i.targetDate || null,
        targetBudget:   i.targetBudget   || null,
        targetCurrency: i.targetCurrency || null,
        sponsor:    i.sponsor    || null,
        assignedPM: i.assignedPM || null,
        rationale:  i.rationale  || null,
      }))
    : [];

  return {
    vesselId,
    _app:           parsed._app || null,
    _lastSeen:      Date.now(),
    _remoteIP:      remoteIP,
    // BiBBOS fields
    entityName:     parsed.entityName  || null,
    entityIcon:     parsed.entityIcon  || null,
    industry:       parsed.industry    || null,
    loc:            parsed.loc         || null,
    cur:            parsed.cur         || null,
    sym:            parsed.sym         || null,
    // BiBBOS intentions — compact summary for key lookup (NOT full payload)
    _intentions:    intentionsSummary,
    // SPM fields
    projectName:    parsed.projectName || null,
    steward:        parsed.steward     || null,
    projectSector:  parsed.projectSector || null,
    healthScore:    parsed.healthScore != null ? parsed.healthScore : null,
    status:         parsed.status      || null,
    mode:           parsed.mode        || null,
    // Masthead fields
    name:           parsed.name        || null,
    operator:       parsed.operator    || null,
    // Shared
    vesselKey:      parsed.vesselKey   || null,
  };
}

// ── Backpressure constants ────────────────────────────────────────────────
// If a client's write buffer exceeds this, it is a slow/frozen consumer.
// Drop this message for that client rather than buffering it in Node heap.
const MAX_BUFFER_BYTES  = 512 * 1024;  // 512KB per client
const MAX_BUFFER_STRIKES = 2;          // terminate after 2 consecutive oversized cycles
const MAX_MSGS_PER_SEC  = 80;          // per-client fan-out rate cap (messages/sec)

// Safe send — checks backpressure and rate limit before writing to socket
function safeSend(client, txt) {
  try {
    const ws = client.ws;
    if (ws.readyState !== 1) return;

    // ── Rate limit ────────────────────────────────────────────────────────
    // Prevents a high-frequency sender from flooding a slow receiver
    const now = Date.now();
    if (!client._rateWindow || now - client._rateWindow > 1000) {
      client._rateWindow = now;
      client._rateMsgs   = 0;
    }
    if (++client._rateMsgs > MAX_MSGS_PER_SEC) {
      // Over rate limit — drop silently (heartbeats are idempotent, events are deduped)
      return;
    }

    // ── Backpressure ──────────────────────────────────────────────────────
    const buf = ws.bufferedAmount || 0;
    if (buf > MAX_BUFFER_BYTES) {
      client._bufferStrikes = (client._bufferStrikes || 0) + 1;
      if (client._bufferStrikes >= MAX_BUFFER_STRIKES) {
        console.warn(`[FormationHub] Client ${client._cid||'?'} (${client.label}) buffer ${(buf/1024).toFixed(0)}KB — terminating slow client`);
        try { ws.terminate(); } catch {}
      } else {
        console.warn(`[FormationHub] Client ${client._cid||'?'} (${client.label}) buffer ${(buf/1024).toFixed(0)}KB — dropping message (strike ${client._bufferStrikes}/${MAX_BUFFER_STRIKES})`);
      }
      return;
    }

    // Buffer healthy — reset strikes and send
    if (client._bufferStrikes) client._bufferStrikes = 0;
    ws.send(txt);
  } catch {
    // Socket closed — ignore
  }
}

function formationBroadcast(obj, excludeCid) {
  const txt = JSON.stringify(obj);
  formationClients.forEach((c, id) => {
    if (id === excludeCid) return;
    safeSend(c, txt);
  });
}

// Store last N directives for reconnecting vessels
const pendingDirectives = [];
const MAX_DIRECTIVES = 5;

function buildFormationSnapshot() {
  const vessels = [];
  formationRegistry.forEach((s, vid) => {
    if (s._departureTimer) return;
    // Clone only — never mutate registry entry
    const entry = Object.assign({}, s);
    delete entry._departureTimer;
    vessels.push(entry);
  });
  return {
    _type:"formation_snapshot", _hub:true, ts:Date.now(),
    vessels, count:vessels.length,
    recentDirectives: pendingDirectives.slice()
  };
}

app.get("/api/formation/registry", (req, res) => {
  const vessels = [];
  formationRegistry.forEach((s, vid) => {
    const entry = Object.assign({}, s);
    delete entry._departureTimer;
    vessels.push(entry);
  });
  res.json({ ok:true, count:vessels.length, clients:formationClients.size, vessels });
});

// ── Memory health endpoint — monitor without restarting ───────────────────
// GET http://[LAN-IP]:8080/api/formation/health
app.get("/api/formation/health", (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok:            true,
    uptime_s:      Math.floor(process.uptime()),
    clients:       formationClients.size,
    registry:      formationRegistry.size,
    msgs_total:    formationMsgs,
    heap_used_mb:  (mem.heapUsed  / 1048576).toFixed(1),
    heap_total_mb: (mem.heapTotal / 1048576).toFixed(1),
    rss_mb:        (mem.rss       / 1048576).toFixed(1),
  });
});

// Log hub stats every 5 minutes — visible in PowerShell without hitting endpoint
setInterval(() => {
  const mem    = process.memoryUsage();
  const heapMB = (mem.heapUsed / 1048576).toFixed(0);
  const rssMB  = (mem.rss      / 1048576).toFixed(0);
  if (formationClients.size > 0) {
    console.log(`[FormationHub] ◎ ${formationClients.size} clients · ${formationRegistry.size} registry · heap ${heapMB}MB · rss ${rssMB}MB`);
  }
}, 300000);

const wssFormation = new WebSocket.Server({ noServer: true });

wssFormation.on("connection", (ws, req) => {
  const cid      = ++formationSeq;
  const remoteIP = req.socket.remoteAddress || "?";
  let   msgCount = 0;
  let   vesselId = null;

  formationClients.set(cid, { ws, label: remoteIP, alive: true, joinedAt: Date.now(), _remoteIP: remoteIP, _cid: cid });
  console.log(`[FormationHub] Client ${cid} joined from ${remoteIP} — ${formationClients.size} connected`);
  // Send compact constellation snapshot immediately on connect
  try {
    const _snap = JSON.stringify(buildFormationSnapshot());
    if (ws.readyState === 1) ws.send(_snap);
  } catch {}

  ws.on("pong", () => { const c = formationClients.get(cid); if (c) c.alive = true; });

  ws.on("message", raw => {
    // Leak fix 4: reset counter before overflow
    if (++formationMsgs > 10000000) formationMsgs = 0;
    msgCount++;

    // Any message proves the connection is alive
    const _c = formationClients.get(cid);
    if (_c) _c.alive = true;

    // ── Per-sender inbound rate limit ─────────────────────────────────────
    // Prevents a burst-sending vessel (e.g. recommission storm) from flooding
    // the hub's message loop and pushing excessive fan-out to other clients.
    // Cap: 30 messages per 10 seconds per sender. Heartbeats exempt (15s cadence).
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }
    if (!parsed || typeof parsed !== "object") return;
    const type = parsed._type || parsed.type || "unknown";

    const isHeartbeat = type === 'bibbos_formation_heartbeat' ||
                        type === 'spm_formation_heartbeat'    ||
                        type === 'masthead_heartbeat'         ||
                        type === 'formation_ping';

    if (!isHeartbeat && _c) {
      const nowMs = Date.now();
      if (!_c._inRateWindow || nowMs - _c._inRateWindow > 10000) {
        _c._inRateWindow = nowMs;
        _c._inRateMsgs   = 0;
      }
      if (++_c._inRateMsgs > 30) {
        // Over inbound rate limit — drop silently, don't fan out
        return;
      }
    }

    // Identity resolution — only from messages THIS client sent (not hub fanout)
    if (!parsed._hub) {
      const id = parsed.vesselId || parsed._vesselId || parsed.entityId || null;
      if (id && id !== vesselId) {
        vesselId = id;
        const c  = formationClients.get(cid);
        if (c) {
          c.label    = (parsed.projectName || parsed.entityName || id).slice(0, 48);
          c.vesselId = id;
          c.type     = parsed._app || (type.startsWith("bibbos")?"bibbos":type.startsWith("spm")?"spm":type.startsWith("masthead")?"masthead":"vessel");
        }
        if (!FORMATION_QUIET.has(type)) console.log(`[FormationHub] Client ${cid} is ${formationClients.get(cid)?.label} (${type})`);

        // Leak fix 3: cancel existing departure timer BEFORE creating a new one
        const _prev = formationRegistry.get(vesselId);
        if (_prev && _prev._departureTimer) {
          clearTimeout(_prev._departureTimer);
          delete _prev._departureTimer;
        }
      }
    }

    // Store directives for reconnecting vessels
    if (type === "masthead_directive") {
      const dir = { _type:"masthead_directive", message:parsed.message||'', operator:parsed.operator||'', ts:parsed.ts||new Date().toISOString() };
      pendingDirectives.push(dir);
      if (pendingDirectives.length > MAX_DIRECTIVES) pendingDirectives.shift();
    }

    // Leak fix 1: registry stores COMPACT record only — never the full heartbeat payload
    // Full payload is relayed to subscribers directly; it must NOT be stored in the registry
    if (vesselId && (type==="bibbos_formation_heartbeat"||type==="spm_formation_heartbeat"||type==="masthead_heartbeat")) {
      const existing = formationRegistry.get(vesselId) || {};
      // Preserve departure timer if one is pending (reconnect scenario)
      const _timer = existing._departureTimer;
      const record = makeRegistryRecord(vesselId, parsed, remoteIP);
      if (_timer) record._departureTimer = _timer;
      formationRegistry.set(vesselId, record);
    }

    // Offline sync burst — surface to Masthead
    if (parsed._offline === true && vesselId) {
      formationBroadcast({ _type:"formation_sync_ack", _hub:true, vesselId,
        eventType:type, ts:Date.now(),
        label:(parsed.projectName||parsed.entityName||vesselId).slice(0,48) }, cid);
    }

    // Ping — reply directly, don't relay
    if (type === "formation_ping") {
      try { ws.send(JSON.stringify({ _type:"formation_pong", _hub:true, ts:Date.now() })); } catch {}
      return;
    }

    // Fan out with backpressure guard — never queue into a frozen client's buffer
    if (raw.length > 2097152) {
      console.warn(`[FormationHub] Oversized payload from ${cid} (${(raw.length/1024).toFixed(0)}KB) — not relayed`);
    } else {
      const _excludeCid = cid;
      formationClients.forEach((client, id) => {
        if (id !== _excludeCid) safeSend(client, raw);
      });
    }
    // raw is now eligible for GC — no other references held
  });

  ws.on("close", (code) => {
    const c = formationClients.get(cid);
    const label    = c ? c.label    : remoteIP;
    const _vid     = c ? c.vesselId : vesselId; // use client record as primary
    formationClients.delete(cid);

    if (msgCount === 0 && code === 1006) { return; } // silent: probe/wrong-path
    if (!vesselId) { return; } // silent: never sent an identifying heartbeat (pings don't count)
    console.log(`[FormationHub] Client ${cid} (${label}) departed (${code}) — ${formationClients.size} remaining`);

    const _activeVesselId = _vid || vesselId;
    if (_activeVesselId) {
      // Leak fix 3: only ONE departure timer per vesselId at any time
      // If a timer already exists (rapid reconnect storm), cancel it first
      const existing = formationRegistry.get(_activeVesselId) || {};
      if (existing._departureTimer) {
        clearTimeout(existing._departureTimer);
        delete existing._departureTimer;
      }

      const t = setTimeout(() => {
        // Only broadcast departure if vessel is truly gone (no other connection for it)
        const stillGone = ![...formationClients.values()].some(cl => cl.vesselId === _activeVesselId);
        if (stillGone) {
          const last = formationRegistry.get(_activeVesselId) || {};
          formationBroadcast({
            _type:"formation_departure", _hub:true,
            vesselId:_activeVesselId, label, ts:Date.now(),
            entityName:last.entityName||null,
            projectName:last.projectName||null,
            _app:last._app||null
          });
          formationRegistry.delete(_activeVesselId);
        }
      }, 8000); // 8s grace — covers mobile screen-wake reconnect

      // Stash timer — will be cancelled if vessel reconnects within 8s
      const reg = formationRegistry.get(_activeVesselId) || {};
      reg._departureTimer = t;
      formationRegistry.set(_activeVesselId, reg);
    }
  });

  ws.on("error", err => {
    if (err.code === "ECONNRESET" && msgCount === 0) return;
    console.warn(`[FormationHub] Client ${cid} error: ${err.message}`);
    formationClients.delete(cid);
  });
});

// Two-tier keepalive:
// - Named vessels (sent at least one heartbeat): checked every 30s, allowed 2 missed cycles (60s)
// - Anonymous connections (probes, slow starters): checked every 30s, 1 missed cycle (30s)
const formationPingInterval = setInterval(() => {
  formationClients.forEach((c, id) => {
    if (!c.alive) {
      // Named vessels get one extra cycle (mobile screen lock tolerance)
      if (c.vesselId && !c._missedPing) {
        c._missedPing = true; // give one more cycle
        try { if (c.ws.readyState === 1) c.ws.ping(); } catch {}
        return;
      }
      if (c.vesselId) console.log(`[FormationHub] Client ${id} (${c.label}) timed out`);
      try{c.ws.terminate();}catch{} formationClients.delete(id); return;
    }
    c._missedPing = false; // reset on any alive cycle
    c.alive = false;
    try { if (c.ws.readyState === 1) c.ws.ping(); } catch { formationClients.delete(id); }
  });
}, 30000); // 30s cycle; named vessels get 2 cycles (60s) before termination

// -----------------------------------------
// UMOJA M1 MESH + BOWL ENGINE
// -----------------------------------------
const meshClients = new Set();

// In-RAM view of recent bowls pushed via mesh
const liveBowls = [];
const MAX_LIVE_BOWLS = 256;

/**
 * Broadcast current mesh peers (presence) to everyone.
 */
function broadcastMeshPeers() {
  const peers = [];
  meshClients.forEach(ws => {
    if (ws.meta) {
      peers.push({
        id: ws.meta.id,
        handle: ws.meta.handle,
        scope: ws.meta.scope,
        vessel: ws.meta.vessel || "umoja",
        last_seen: ws.meta.last_seen
      });
    }
  });

  const msg = JSON.stringify({ type: "mesh_peers", peers });
  meshClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      // Backpressure: skip slow/frozen mesh clients
      if ((ws.bufferedAmount || 0) < MAX_BUFFER_BYTES) {
        try { ws.send(msg); } catch {}
      }
    }
  });
}

/**
 * Keep a bounded in-memory list of bowls that have been
 * decoded from the filesystem ledger and lifted into the
 * Ubuntu field as live signals.
 */
function registerLiveBowl(bowl) {
  liveBowls.push(bowl);
  if (liveBowls.length > MAX_LIVE_BOWLS) {
    liveBowls.shift();
  }
}

/**
 * Send the current bowl snapshot to a single peer.
 * This lets a newly-joined vessel get context instantly
 * without re-scanning the ledger.
 */
function sendLiveBowlSnapshot(ws) {
  if (!liveBowls.length) return;
  if (ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify({
    type: "field_bowl_snapshot",
    bowls: liveBowls
  }));
}

/**
 * Decode a single Umoja field bowl from the filesystem
 * ledger given a capsule_id (or null for “latest”).
 * This is where intent → bowl happens on the server.
 */
function decodeFieldBowlFromLedger(capsuleId, scopeHint) {
  if (!fs.existsSync(LEDGER_FILE)) return null;

  let lines;
  try {
    lines = fs.readFileSync(LEDGER_FILE, "utf8")
      .trim()
      .split(/\r?\n/);
  } catch {
    return null;
  }

  // Work from newest backwards, only need a recent window
  const recent = lines.slice(-600).reverse();

  for (const l of recent) {
    let c;
    try {
      c = JSON.parse(l);
    } catch {
      continue;
    }
    if (!c || !c.payload) continue;

    if (capsuleId) {
      if (c.id !== capsuleId && c.capsule_id !== capsuleId) {
        continue;
      }
    }

    const intent = c.payload.intent;
    if (!intent || typeof intent !== "string") continue;

    const idx = intent.indexOf("obj=");
    if (idx === -1) continue;

    let obj;
    try {
      obj = JSON.parse(intent.slice(idx + 4));
    } catch {
      continue;
    }
    if (!obj || obj.type !== "field_post") continue;

    const topic = obj.topic || obj.bowl || obj.category || obj.kind || "comms";
    const body =
      obj.body || obj.message || obj.text || obj.txt || "";
    const mode = obj.mode || "offer";
    const scope = obj.scope || scopeHint || "ubuntu";
    const author =
      obj.author_handle || obj.author || obj.by || "anonymous";
    const channel = obj.channel || "umoja_field";
    const status = obj.status || "open";

    const ts =
      obj.ts ||
      c.ts ||
      new Date().toISOString();

    return {
      capsule_id: c.id,
      ts,
      topic,
      body,
      mode,
      scope,
      author,
      channel,
      status,
      origin: "server"
    };
  }

  return null;
}

// ⚠️  NOTE: cycleMode() below references client-side variables (MODES, state,
// els, meshSocket) that do not exist in this server context. This block was
// accidentally included from an earlier client-side vessel evolution. It is
// unreachable dead code — no server route calls it — and is safe to leave or
// remove in a future cleanup. Do not call cycleMode() from server routes.
function cycleMode() {
  const idx = MODES.indexOf(state.mode);
  const next = (idx === -1 ? 0 : (idx + 1) % MODES.length);
  state.mode = MODES[next];    // 🔥 THIS IS THE SIGNAL
// ensure engine-level mode effects propagate
if (state.mode === "mesh") {
  els.presenceLabel.textContent = "mesh: connected";
} else {
  els.presenceLabel.textContent = "mesh: idle";
}
 
 renderMode();
  saveState();

  // re-announce to mesh
  if (meshSocket && meshSocket.readyState === WebSocket.OPEN) {
    meshSend({
      type: "hello",
      handle: state.handle,
      scope: state.scope,
      vessel: "umoja"
    });
  }

  // refresh UI + mesh to re-evaluate intake rules
  renderBulletin();
  renderFeed();
}

/**
 * Fan out a single bowl object to all mesh peers.
 * Vessels can treat this as a ready-to-render bulletin item.
 */
function broadcastFieldBowl(bowl, originWs) {
  const msg = JSON.stringify({
    type: "field_bowl",
    bowl
  });

  meshClients.forEach(client => {
    if (client.readyState !== WebSocket.OPEN) return;
    // Backpressure: skip frozen mesh clients
    if ((client.bufferedAmount || 0) < MAX_BUFFER_BYTES) {
      try { client.send(msg); } catch {}
    }
  });
}

// WebSocket mesh endpoint — noServer:true (shares upgrade router with formation relay)
const wss = new WebSocket.Server({ noServer: true });

// ─────────────────────────────────────────────────────────────────────────────
// SHARED WEBSOCKET UPGRADE ROUTER
// Routes incoming WebSocket upgrade requests to the correct server by path.
// This is the ws-recommended pattern when multiple WebSocket.Server instances
// share one http.Server — avoids upgrade listener conflicts in ws v7/v8.
//
//   /mesh       → wss          (Umoja mesh + bowl engine)
//   /formation  → wssFormation (Sovereign formation relay)
// ─────────────────────────────────────────────────────────────────────────────
server.on("upgrade", (req, socket, head) => {
  const pathname = req.url ? req.url.split("?")[0] : "";

  if (pathname === "/formation") {
    wssFormation.handleUpgrade(req, socket, head, (ws) => {
      wssFormation.emit("connection", ws, req);
    });
  } else if (pathname === "/mesh") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    // Unknown path — destroy socket cleanly
    socket.destroy();
  }
});

wss.on("connection", (ws, req) => {
  // Minimal sovereign identity for this socket
  ws.meta = {
    id: "peer_" + crypto.randomBytes(4).toString("hex"),
    handle: null,
    scope: "ubuntu",
    vessel: "umoja",
    last_seen: Date.now()
  };

  meshClients.add(ws);

  ws.on("message", raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

// ---------------------------------------------------------------------
// NEW: resolution fanout (v2.2)
// ---------------------------------------------------------------------
if (msg.type === "bowl_resolve" && msg.id) {

  // Build pure fanout payload
  const payload = {
    type: "bowl_resolve",
    id: msg.id,
    resolvedBy: msg.resolvedBy || msg.handle || "unknown",
    ts: msg.ts || Date.now()
  };

  // Relay to all connected vessels
  
const txt = JSON.stringify(payload);
for (const client of wss.clients) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(payload));
  }
}

  return;
}

    if (!msg || typeof msg !== "object") return;

    // Every valid message updates last_seen
    ws.meta.last_seen = Date.now();

    switch (msg.type) {
      // --------------------------------------------------
      // HELLO / PRESENCE: handshake and continuity
      // --------------------------------------------------
      case "hello":
      case "presence_ping": {
        ws.meta.handle =
          msg.handle || ws.meta.handle || ("umoja_" + ws.meta.id.slice(-4));
        ws.meta.scope =
          msg.scope || ws.meta.scope || "ubuntu";
        ws.meta.vessel =
          msg.vessel || ws.meta.vessel || "umoja";

        // Let all peers know about updated presence
        broadcastMeshPeers();

        // Warm bulletin board with current bowls
        sendLiveBowlSnapshot(ws);

        // Explicit hello_ack for v2.0 vessels
        try {
          const peers = [];
          meshClients.forEach(client => {
            if (client.meta) {
              peers.push({
                id: client.meta.id,
                handle: client.meta.handle,
                scope: client.meta.scope,
                vessel: client.meta.vessel || "umoja",
                last_seen: client.meta.last_seen
              });
            }
          });
          ws.send(JSON.stringify({
            type: "hello_ack",
            peers
          }));
        } catch (e) {
          console.warn("hello_ack send failed:", e);
        }

        return;
      }

      // --------------------------------------------------
      // Explicit requests from v2.0 hull
      // --------------------------------------------------
      case "request_peers": {
        try {
          const peers = [];
          meshClients.forEach(client => {
            if (client.meta) {
              peers.push({
                id: client.meta.id,
                handle: client.meta.handle,
                scope: client.meta.scope,
                vessel: client.meta.vessel || "umoja",
                last_seen: client.meta.last_seen
              });
            }
          });
          ws.send(JSON.stringify({
            type: "peers",
            peers
          }));
        } catch (e) {
          console.warn("peers send failed:", e);
        }
        return;
      }

      case "request_field_bowl_snapshot": {
        sendLiveBowlSnapshot(ws);
        return;
      }
// ⚠️  NOTE: The bowl_resolve block below is unreachable dead code.
// bowl_resolve is already handled as a top-level if-check above (before
// the switch), which returns early. This duplicate was from an earlier
// version of the bowl resolution logic. Kept here for historical reference
// but it will never execute. Safe to remove in future cleanup.
if (msg.type === "bowl_resolve" && msg.id) {

  const resolution = {
    type: "bowl_resolve",
    id: msg.id,
    resolvedBy: msg.resolvedBy || ws.meta.handle || "unknown",
    resolvedAt: Date.now()
  };

  // Update server memory (liveBowls)
  for (const b of liveBowls) {
    if (b.id === msg.id) {
      b.status = "resolved";
      b.resolvedBy = resolution.resolvedBy;
      b.resolvedAt = resolution.resolvedAt;
    }
  }

const resolutionCapsule = {
  id: crypto.randomUUID(),
  ts: Date.now(),
  payload: {
    intent: "field_resolve",
    target_id: msg.id,
    by: msg.by,
    scope: msg.scope || "ubuntu"
  },
  meta: {
    vessel_id: ensureVesselId().id
  }
};

appendCapsule(resolutionCapsule);
broadcast(resolutionCapsule);

  // Fanout to all mesh peers
  const txt = JSON.stringify(resolution);
  meshClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(txt); } catch {}
    }
  });

  return;
}

      // --------------------------------------------------
      // Live bowl fanout (all vessels)
      // --------------------------------------------------
      case "bowl": {
        if (!msg.bowl || typeof msg.bowl !== "object") return;

        const bowl = { ...msg.bowl };

        // Normalize bowl structure
        bowl.ts     = bowl.ts     || Date.now();
        bowl.topic  = bowl.topic  || "other";
        bowl.type   = bowl.type   || "offer";
        bowl.scope  = bowl.scope  || msg.scope || ws.meta.scope || "ubuntu";
        bowl.author = bowl.author || msg.handle || ws.meta.handle || "unknown";
        bowl.origin = bowl.origin || "mesh";

bowl.id = bowl.id || ("bowl_" + crypto.randomBytes(4).toString("hex"));

        // Register in live ring and fan out as field bowl
        try {
          registerLiveBowl(bowl);
        } catch (e) {
          console.warn("registerLiveBowl failed:", e);
        }

        // This goes out as { type: "field_bowl", bowl: {...} }
        // so all UIs (v1.6–v2.0) can ingest consistently.
        try {
          broadcastFieldBowl(bowl, ws);
        } catch (e) {
          console.warn("broadcastFieldBowl failed:", e);
        }
        return;
      }

      // --------------------------------------------------
      // Optional: capsule notices from older hulls
      // --------------------------------------------------
      case "mesh_capsule_notice": {
        const notice = {
          type: "mesh_capsule_notice",
          capsule_id: msg.capsule_id || null,
          scope: msg.scope || null,
          ts: Date.now()
        };

        const fanout = JSON.stringify(notice);

        meshClients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(fanout);
          }
        });

        return;
      }

      default:
        // Unknown / legacy types are ignored to keep core sovereign
        return;
    }
  });

  ws.on("close", () => {
    meshClients.delete(ws);
    broadcastMeshPeers();
  });
});

server.listen(port, () => {
  ensureVesselId();
  ensureSSAKey();
  console.log(`🚀 MIE Vessel Server: http://localhost:${port}`);
  console.log(`🌍 Vessel Interface: http://localhost:${port}/`);
  console.log(`📊 Direct API: http://localhost:${port}/api/mie/capsules`);
  console.log("🔀 Legacy path redirected: /vessel/mie-vessel.html -> /");
  console.log("🎯 Semantic Drift Engine: ACTIVE (Mesh + Bowl engine)");
  console.log(`◈  Formation Hub:      ws://[LAN-IP]:${port}/formation`);
  console.log(`◈  Formation Health:   http://[LAN-IP]:${port}/api/formation/health`);
  console.log(`◈  Formation Registry: http://[LAN-IP]:${port}/api/formation/registry`);
  console.log(`◈  Transport JS:       http://[LAN-IP]:${port}/formation-transport.js`);
  console.log(`   Tip: node --max-old-space-size=512 server.js  (raises heap limit if needed)`);
});