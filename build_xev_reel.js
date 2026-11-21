const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { assignProductNumbers, buildMalayalamVideoScript } = require("./xev_campaign_engine");

const REELS_DIR = path.join(__dirname, "reels");
const CATALOG_FILE = path.join(__dirname, "meesho_products.json");
if (!fs.existsSync(REELS_DIR)) fs.mkdirSync(REELS_DIR, { recursive: true });

// ffmpeg: FFMPEG_PATH env > ffmpeg-static package (Render) > system ffmpeg (Termux)
let FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
if (!process.env.FFMPEG_PATH) {
  try { FFMPEG = require("ffmpeg-static") || "ffmpeg"; } catch (_) {}
}

const W = 720, H = 1280, FPS = 25;

function updateProduct(id, patch) {
  let items = [];
  try { items = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8")); } catch (_) {}
  const p = Array.isArray(items) ? items.find((x) => x.id === id) : null;
  if (!p) return;
  Object.assign(p, patch);
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(items, null, 2), "utf8");
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label + " timeout")), ms))
  ]);
}

async function edgeTts(text, outFile) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
  let lastErr;
  for (const voice of ["ml-IN-SobhanaNeural", "ml-IN-MidhunNeural"]) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const res = tts.toStream(text);
      const stream = res && res.audioStream ? res.audioStream : res;
      const chunks = [];
      await withTimeout(new Promise((resolve, reject) => {
        stream.on("data", (c) => chunks.push(c));
        stream.on("end", resolve);
        stream.on("close", resolve);
        stream.on("error", reject);
      }), 60000, "edge tts");
      const buf = Buffer.concat(chunks);
      if (buf.length > 5000) { fs.writeFileSync(outFile, buf); return; }
      lastErr = new Error("edge tts returned tiny audio");
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("edge tts failed");
}

function splitForTts(text, max = 180) {
  const parts = [];
  let cur = "";
  for (const s of text.split(/(?<=[.!?।])\s+/)) {
    if ((cur + " " + s).trim().length <= max) { cur = (cur + " " + s).trim(); continue; }
    if (cur) parts.push(cur);
    cur = s;
    while (cur.length > max) {
      const cut = cur.lastIndexOf(" ", max);
      const at = cut > 0 ? cut : max;
      parts.push(cur.slice(0, at));
      cur = cur.slice(at).trim();
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

async function googleTts(text, outFile) {
  const bufs = [];
  for (const p of splitForTts(text)) {
    const url = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ml&q=" + encodeURIComponent(p);
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error("google tts HTTP " + res.status);
    bufs.push(Buffer.from(await res.arrayBuffer()));
  }
  const buf = Buffer.concat(bufs);
  if (buf.length < 3000) throw new Error("google tts returned empty audio");
  fs.writeFileSync(outFile, buf);
}

async function makeVoice(text, outFile) {
  try { await edgeTts(text, outFile); return "edge"; }
  catch (e1) {
    console.log("⚠️ Edge voice failed, trying Google voice:", e1.message);
    await googleTts(text, outFile);
    return "google";
  }
}

function probeDuration(file) {
  return new Promise((resolve) => {
    execFile(FFMPEG, ["-i", file], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 }, (_err, _so, se) => {
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(se || ""));
      const sec = m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 25;
      resolve(Math.min(Math.max(sec, 5), 85));
    });
  });
}

function productImages(prod) {
  const raw = Array.isArray(prod.images) && prod.images.length ? prod.images : (prod.imageUrl ? [prod.imageUrl] : []);
  const list = [];
  for (const u of raw) {
    if (typeof u === "string" && u.startsWith("/uploads/")) {
      const p = path.join(__dirname, u.replace(/^\/+/, ""));
      if (fs.existsSync(p)) list.push(p);
    }
  }
  return list.slice(0, 6);
}

function renderVideo(images, voiceFile, seconds, outVideo) {
  const total = seconds + 0.8;
  const args = ["-y"];
  let filter;
  let audioIdx;

  if (images.length) {
    const n = images.length;
    const frames = Math.max(Math.round((total / n) * FPS), FPS);
    images.forEach((img) => args.push("-i", img));
    audioIdx = n;
    const parts = [];
    images.forEach((_, i) => {
      parts.push(
        `[${i}:v]split=2[bg${i}][fg${i}];` +
        `[bg${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:3[b${i}];` +
        `[fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease[f${i}];` +
        `[b${i}][f${i}]overlay=(W-w)/2:(H-h)/2,setsar=1,` +
        `zoompan=z='min(zoom+0.0010,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},` +
        `format=yuv420p[v${i}]`
      );
    });
    parts.push(images.map((_, i) => `[v${i}]`).join("") + `concat=n=${n}:v=1:a=0[vout]`);
    filter = parts.join(";");
  } else {
    args.push("-f", "lavfi", "-i", `color=c=0x090d16:s=${W}x${H}:r=${FPS}:d=${total}`);
    audioIdx = 1;
    filter = "[0:v]format=yuv420p[vout]";
  }

  args.push("-i", voiceFile);
  args.push(
    "-filter_complex", filter,
    "-map", "[vout]", "-map", `${audioIdx}:a`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
    "-movflags", "+faststart",
    "-t", String(total),
    outVideo
  );

  return new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { cwd: __dirname, timeout: 840000, maxBuffer: 64 * 1024 * 1024 }, (err, _so, se) => {
      if (err) return reject(new Error(String(se || err.message).slice(-1200)));
      resolve();
    });
  });
}

async function buildReelForProduct(productId) {
  const items = assignProductNumbers();
  const prod = productId ? items.find((p) => p.id === productId) : items[0];
  if (!prod) throw new Error("Product not found");

  const script = buildMalayalamVideoScript(prod);
  const tag = prod.id || ("item-" + Date.now());
  const voiceFile = path.join(REELS_DIR, `${tag}-voice.mp3`);
  const outVideo = path.join(REELS_DIR, `${tag}-reel.mp4`);

  updateProduct(prod.id, { productNumber: prod.productNumber, reelStatus: "BUILDING_VIDEO" });

  const engine = await makeVoice(script.fullNarration, voiceFile);
  const seconds = await probeDuration(voiceFile);
  const images = productImages(prod);
  console.log(`🎙️ voice=${engine} ${seconds.toFixed(1)}s, images=${images.length}`);

  await renderVideo(images, voiceFile, seconds, outVideo);

  const size = fs.statSync(outVideo).size;
  if (size < 50 * 1024) throw new Error("Video too small: " + size + " bytes");

  updateProduct(prod.id, {
    productNumber: prod.productNumber,
    reelVideoPath: `/reels/${path.basename(outVideo)}`,
    malayalamScript: script,
    reelStatus: "VIDEO_READY"
  });
  try { fs.unlinkSync(voiceFile); } catch (_) {}
  console.log("✅ REEL_CREATED:", outVideo, size + " bytes");
  return { outVideo, script };
}

if (require.main === module) {
  buildReelForProduct(process.argv[2]).catch((e) => {
    console.error("❌ REEL_ERROR:", e.message);
    try { if (process.argv[2]) updateProduct(process.argv[2], { reelStatus: "REEL_FAILED" }); } catch (_) {}
    process.exit(1);
  });
}

module.exports = { buildReelForProduct, renderVideo, probeDuration, productImages, splitForTts };
