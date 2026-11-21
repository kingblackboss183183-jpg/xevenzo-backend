const fs = require("fs");
const path = require("path");
const { assignProductNumbers, buildMalayalamVideoScript, calcPricing, WHATSAPP_LINK } = require("./xev_campaign_engine");

const CATALOG_FILE = path.join(__dirname, "meesho_products.json");
const REELS_DIR = path.join(__dirname, "reels");
const MAKE_WEBHOOK_URL = String(process.env.MAKE_WEBHOOK_URL || "https://hook.eu1.make.com/91qjdqwgl8ht4nun61wyh21xh2aahxxo").trim();
const PUBLIC_BASE = String(process.env.PUBLIC_BASE_URL || "https://xevenzo-backend.onrender.com").replace(/\/+$/, "");
const MIN_VIDEO_BYTES = 50 * 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function updateProduct(id, patch) {
  let items = [];
  try { items = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8")); } catch (_) {}
  const p = Array.isArray(items) ? items.find((x) => x.id === id) : null;
  if (!p) return;
  Object.assign(p, patch);
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(items, null, 2), "utf8");
}

// The public link must really open (HTTP 200/206 and a video type) before Make.com is called.
async function checkPublicUrl(url, tries = 6) {
  for (let i = 1; i <= tries; i++) {
    let note = "";
    try {
      const res = await fetch(url, { headers: { Range: "bytes=0-1023" } });
      const type = String(res.headers.get("content-type") || "");
      try { if (res.body) await res.body.cancel(); } catch (_) {}
      if ((res.status === 200 || res.status === 206) && type.includes("video")) return true;
      note = `HTTP ${res.status} ${type}`;
    } catch (e) {
      note = e.message;
    }
    console.log(`⚠️ video link check ${i}/${tries}: ${note}`);
    if (i < tries) await sleep(4000);
  }
  return false;
}

async function publishProductToInstagram(productId) {
  const items = assignProductNumbers();
  const prod = productId ? items.find((p) => p.id === productId) : items[items.length - 1];
  if (!prod) {
    console.log("No product found for Instagram publish");
    return false;
  }

  const script = buildMalayalamVideoScript(prod);
  const videoFile = prod.reelVideoPath
    ? path.join(__dirname, prod.reelVideoPath.replace(/^\/+/, ""))
    : path.join(REELS_DIR, `${prod.id}-reel.mp4`);

  if (!fs.existsSync(videoFile)) {
    updateProduct(prod.id, { reelStatus: "VIDEO_MISSING" });
    console.log("⚠️ Video file not ready, NOT calling Make.com:", videoFile);
    return false;
  }
  const size = fs.statSync(videoFile).size;
  if (size < MIN_VIDEO_BYTES) {
    updateProduct(prod.id, { reelStatus: "VIDEO_TOO_SMALL" });
    console.log("⚠️ Video too small, NOT calling Make.com:", size, "bytes");
    return false;
  }

  const videoUrl = `${PUBLIC_BASE}/reels/${path.basename(videoFile)}`;
  if (!(await checkPublicUrl(videoUrl))) {
    updateProduct(prod.id, { reelStatus: "VIDEO_URL_NOT_PUBLIC" });
    console.log("⚠️ Video link does not open publicly, NOT calling Make.com:", videoUrl);
    return false;
  }

  const imageUrl = prod.imageUrl
    ? (prod.imageUrl.startsWith("http") ? prod.imageUrl : `${PUBLIC_BASE}${prod.imageUrl}`)
    : "";
  const finalPrice = prod.finalPrice || calcPricing(prod.basePrice).finalPrice;

  const caption = [
    script.hookMalayalam,
    script.bodyMalayalam,
    ``,
    `💰 വില: ₹${finalPrice}`,
    `🔢 റീൽ നമ്പർ: ${script.productNumber}`,
    `📲 ഓർഡർ ചെയ്യാൻ ബയോയിലുള്ള വാട്സാപ്പ് ലിങ്കിൽ കയറി നമ്പർ ${script.productNumber} അയക്കൂ:`,
    `👉 ${WHATSAPP_LINK}`,
    ``,
    `#Xevenzo #MalayalamShopping #KeralaOnlineShopping #TrendingReels`
  ].join("\n");

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        productId: prod.id,
        productNumber: script.productNumber,
        title: prod.title || prod.fullName || "Xevenzo Product",
        finalPrice,
        video_url: videoUrl,
        image_url: imageUrl,
        caption
      })
    });
    clearTimeout(timer);
    if (res.ok) {
      updateProduct(prod.id, { reelStatus: "POSTED_TO_MAKE_24X7" });
      console.log("✅ 24/7 Auto-post sent to Make.com:", prod.id, videoUrl);
      return true;
    }
    updateProduct(prod.id, { reelStatus: "MAKE_WEBHOOK_ERROR" });
    console.error("Make webhook error:", res.status);
    return false;
  } catch (err) {
    updateProduct(prod.id, { reelStatus: "MAKE_EXCEPTION" });
    console.error("Make error:", err.message);
    return false;
  }
}

if (require.main === module) {
  publishProductToInstagram(process.argv[2]).then((ok) => process.exit(ok ? 0 : 1));
}

module.exports = { publishProductToInstagram, checkPublicUrl };
