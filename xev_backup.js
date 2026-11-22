// Xevenzo backup: encrypted copy of data files in a private GitHub repo, restored when the server starts.
// Needs env: BACKUP_GH_TOKEN, BACKUP_GH_REPO (owner/repo), BACKUP_SECRET (12+ characters). Without them it does nothing.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const ROOT = __dirname;
const API = String(process.env.BACKUP_API_BASE || "https://api.github.com").replace(/\/+$/, "");
const REPO = String(process.env.BACKUP_GH_REPO || "").trim();
const TOKEN = String(process.env.BACKUP_GH_TOKEN || "").trim();
const SECRET = String(process.env.BACKUP_SECRET || "");
const BRANCH = String(process.env.BACKUP_GH_BRANCH || "main").trim();

const CORE_FILES = ["meesho_products.json", "orders.json", "leads.json", "clicks.json"];
const AUTH_DIR = "auth_info_baileys";
const UPLOADS_DIR = "uploads";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const PREFIX = "snapshot/";
const SIGS_FILE = path.join(ROOT, "backup_sigs.json");
const MAGIC = Buffer.from("XEV1");

const shaCache = {};          // remote path -> git sha (needed to update a file)
let lastSig = {};             // remote file name -> signature of what is already in GitHub
let running = false;
let timer = null;

function enabled() { return Boolean(REPO && TOKEN && SECRET.length >= 12); }

let _key = null;
function key() { if (!_key) _key = crypto.scryptSync(SECRET, "xevenzo-backup-v1", 32); return _key; }

function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}

function decrypt(buf) {
  if (buf.length < 32 || !buf.subarray(0, 4).equals(MAGIC)) throw new Error("not a Xevenzo backup file");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(4, 16));
  d.setAuthTag(buf.subarray(16, 32));
  return Buffer.concat([d.update(buf.subarray(32)), d.final()]);
}

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const packFiles = (map) => zlib.gzipSync(Buffer.from(JSON.stringify(map)));
const unpackFiles = (buf) => JSON.parse(zlib.gunzipSync(buf).toString("utf8"));
function readIf(file) { try { return fs.readFileSync(path.join(ROOT, file)); } catch (_) { return null; } }

async function gh(method, urlPath, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(API + urlPath, {
      method,
      headers: {
        Authorization: "Bearer " + TOKEN,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "xevenzo-backup",
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    return { status: res.status, ok: res.ok, json, text };
  } finally { clearTimeout(t); }
}

// Returns { "snapshot/core.enc": sha, ... }. Throws if the repo is not reachable (wrong name/token).
async function listRemote() {
  const repo = await gh("GET", `/repos/${REPO}`);
  if (!repo.ok) throw new Error(`GitHub repo ${REPO} not reachable (HTTP ${repo.status}). Check BACKUP_GH_REPO and the token.`);
  const r = await gh("GET", `/repos/${REPO}/git/trees/${encodeURIComponent(BRANCH)}?recursive=1`);
  if (r.status === 404 || r.status === 409) return {};   // branch missing / empty repository
  if (!r.ok) throw new Error(`GitHub tree HTTP ${r.status}`);
  const out = {};
  for (const t of (r.json && r.json.tree) || []) if (t.type === "blob" && t.path.startsWith(PREFIX)) out[t.path] = t.sha;
  return out;
}

async function downloadBlob(sha) {
  const r = await gh("GET", `/repos/${REPO}/git/blobs/${sha}`);
  if (!r.ok || !r.json) throw new Error(`GitHub blob HTTP ${r.status}`);
  return Buffer.from(String(r.json.content || "").replace(/\s/g, ""), "base64");
}

async function putFile(remotePath, buf) {
  const url = `/repos/${REPO}/contents/${remotePath}`;
  const body = { message: "backup " + new Date().toISOString(), content: buf.toString("base64"), branch: BRANCH };
  if (shaCache[remotePath]) body.sha = shaCache[remotePath];
  let r = await gh("PUT", url, body);
  if (r.status === 409 || r.status === 422) {   // stale or missing sha: look up the current one and retry once
    const g = await gh("GET", `${url}?ref=${encodeURIComponent(BRANCH)}`);
    if (g.ok && g.json && g.json.sha) body.sha = g.json.sha; else delete body.sha;
    r = await gh("PUT", url, body);
  }
  if (!r.ok) throw new Error(`GitHub PUT ${remotePath} HTTP ${r.status} ${String(r.text).slice(0, 120)}`);
  shaCache[remotePath] = r.json && r.json.content && r.json.content.sha;
}

function flatDirMap(dirName) {
  const dir = path.join(ROOT, dirName);
  const m = {};
  let names = [];
  try { names = fs.readdirSync(dir).sort(); } catch (_) { return m; }
  for (const n of names) {
    const p = path.join(dir, n);
    try { if (fs.statSync(p).isFile()) m[n] = fs.readFileSync(p).toString("base64"); } catch (_) {}
  }
  return m;
}

function bundleUnit(remote, mapFn) {
  let memo;
  const build = () => { if (memo === undefined) { const m = mapFn(); memo = Object.keys(m).length ? packFiles(m) : null; } return memo; };
  return { remote, sig: () => { const b = build(); return b ? sha256(b) : null; }, plain: build };
}

function collectUnits() {
  const units = [];
  units.push(bundleUnit("core.enc", () => {
    const m = {};
    for (const f of CORE_FILES) { const b = readIf(f); if (b) m[f] = b.toString("base64"); }
    return m;
  }));
  units.push(bundleUnit("auth.enc", () => flatDirMap(AUTH_DIR)));
  let names = [];
  try { names = fs.readdirSync(path.join(ROOT, UPLOADS_DIR)); } catch (_) {}
  for (const n of names) {
    const p = path.join(ROOT, UPLOADS_DIR, n);
    let st;
    try { st = fs.statSync(p); } catch (_) { continue; }
    if (!st.isFile()) continue;
    if (st.size > MAX_UPLOAD_BYTES) { console.log("⚠️ backup: skipping large file", n); continue; }
    units.push({
      remote: "uploads__" + n.replace(/[^A-Za-z0-9._-]/g, "_") + ".enc",
      sig: () => `${st.size}:${Math.round(st.mtimeMs)}`,
      plain: () => packFiles({ [n]: fs.readFileSync(p).toString("base64") })
    });
  }
  return units;
}

function applyUnit(remotePath, plain) {
  const rel = remotePath.slice(PREFIX.length);
  const map = unpackFiles(plain);
  let dir = ROOT;
  if (rel === "auth.enc") {
    dir = path.join(ROOT, AUTH_DIR);
    if (fs.existsSync(path.join(dir, "creds.json"))) { console.log("ℹ️ backup: local WhatsApp login exists, keeping it"); return false; }
  } else if (rel.startsWith("uploads__")) {
    dir = path.join(ROOT, UPLOADS_DIR);
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, b64] of Object.entries(map)) {
    if (path.basename(name) !== name) continue;
    fs.writeFileSync(path.join(dir, name), Buffer.from(b64, "base64"));
  }
  return true;
}

async function restore() {
  if (!enabled()) { console.log("ℹ️ backup: not configured, nothing to restore"); return 0; }
  const remote = await listRemote();
  const paths = Object.keys(remote);
  if (!paths.length) { console.log("ℹ️ backup: GitHub is empty, starting fresh"); return 0; }
  // decrypt everything first; only then write files (so a wrong secret never leaves a half-restored state)
  const decoded = [];
  for (const p of paths) {
    let plain;
    try { plain = decrypt(await downloadBlob(remote[p])); }
    catch (e) { throw new Error(/GitHub/.test(e.message) ? e.message : "cannot decrypt the backup. BACKUP_SECRET is not the same one used when the backup was made"); }
    decoded.push([p, plain]);
    shaCache[p] = remote[p];
  }
  const sigs = {};
  let n = 0;
  for (const [p, plain] of decoded) {
    if (applyUnit(p, plain)) { n++; sigs[p.slice(PREFIX.length)] = null; }
  }
  // remember what is now in sync, so the first backup does not re-upload everything
  for (const u of collectUnits()) if (Object.prototype.hasOwnProperty.call(sigs, u.remote)) sigs[u.remote] = u.sig();
  fs.writeFileSync(SIGS_FILE, JSON.stringify(sigs));
  console.log(`♻️ backup: restored ${n} data bundle(s) from GitHub`);
  return n;
}

async function backupOnce() {
  if (!enabled()) return { skipped: "not configured" };
  if (running) return { skipped: "busy" };
  running = true;
  try {
    const remote = await listRemote();
    for (const p of Object.keys(remote)) shaCache[p] = remote[p];
    const pushed = [];
    for (const u of collectUnits()) {
      const sig = u.sig();
      if (!sig || lastSig[u.remote] === sig) continue;
      await putFile(PREFIX + u.remote, encrypt(u.plain()));
      lastSig[u.remote] = sig;
      pushed.push(u.remote);
    }
    if (pushed.length) console.log("💾 backup: pushed to GitHub:", pushed.join(", "));
    return { pushed };
  } finally { running = false; }
}

function startPeriodic(intervalMs = 60000) {
  if (!enabled()) { console.log("ℹ️ backup: not configured (set BACKUP_GH_TOKEN, BACKUP_GH_REPO, BACKUP_SECRET)"); return; }
  if (process.env.XEV_BACKUP_PAUSED) { console.log("⚠️ backup: paused because restore failed. Fix the problem and restart."); return; }
  try { lastSig = JSON.parse(fs.readFileSync(SIGS_FILE, "utf8")); } catch (_) { lastSig = {}; }
  const tick = () => backupOnce().catch((e) => console.log("⚠️ backup error:", e.message));
  setTimeout(tick, Number(process.env.XEV_BACKUP_FIRST_DELAY_MS) || 20000);
  timer = setInterval(tick, intervalMs);
  process.once("SIGTERM", () => {
    console.log("💾 backup: server stopping, final backup...");
    clearInterval(timer);
    const kill = setTimeout(() => process.exit(0), 9000);
    backupOnce().catch(() => {}).finally(() => { clearTimeout(kill); process.exit(0); });
  });
  console.log("💾 backup: running every", Math.round(intervalMs / 1000), "seconds");
}

if (require.main === module) {
  const cmd = process.argv[2];
  (async () => {
    if (cmd === "restore") { await restore(); process.exit(0); }
    if (cmd === "backup") { console.log(await backupOnce()); process.exit(0); }
    console.log("usage: node xev_backup.js backup|restore");
    process.exit(1);
  })().catch((e) => { console.error("❌ backup:", e.message); process.exit(1); });
}

module.exports = { enabled, backupOnce, restore, startPeriodic, encrypt, decrypt };
