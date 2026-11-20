const fs = require("fs");
const path = require("path");
const { assignProductNumbers, buildMalayalamVideoScript, WHATSAPP_LINK } = require("./xev_campaign_engine");

const CATALOG_FILE = path.join(__dirname, "meesho_products.json");
const REELS_DIR = path.join(__dirname, "reels");
const MAKE_WEBHOOK_URL = String(process.env.MAKE_WEBHOOK_URL || "https://hook.eu1.make.com/91qjdqwgl8ht4nun61wyh21xh2aahxxo").trim();
const PUBLIC_BASE = String(process.env.PUBLIC_BASE_URL || "https://xevenzo-backend.onrender.com").replace(/\/+$/, "");

function writeCatalog(items) {
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(items, null, 2), "utf8");
}

async function publishProductToInstagram(productId) {
  const items = assignProductNumbers();
  const prod = productId ? items.find((p) => p.id === productId) : items[items.length - 1];
  if (!prod) {
    console.log("No product found for Instagram publish");
    return;
  }

  const script = buildMalayalamVideoScript(prod);
  const videoFile = prod.reelVideoPath
    ? path.join(__dirname, prod.reelVideoPath.replace(/^\/+/, ""))
    : path.join(REELS_DIR, `${prod.id}-reel.mp4`);

  if (!fs.existsSync(videoFile)) {
    console.log("⚠️ Video file not ready, skipping Make.com:", videoFile);
    return;
  }

  const videoUrl = `${PUBLIC_BASE}/reels/${path.basename(videoFile)}`;
  const imageUrl = prod.imageUrl
    ? (prod.imageUrl.startsWith("http") ? prod.imageUrl : `${PUBLIC_BASE}${prod.imageUrl}`)
    : "";

  const caption = [
    script.hookMalayalam,
    script.bodyMalayalam,
    ``,
    `🔢 റീൽ നമ്പർ: ${script.productNumber}`,
    `📲 ഓർഡർ ചെയ്യാൻ ബയോയിലുള്ള വാട്സാപ്പ് ലിങ്കിൽ കയറി നമ്പർ ${script.productNumber} അയക്കൂ:`,
    `👉 ${WHATSAPP_LINK}`,
    ``,
    `#Xevenzo #MalayalamShopping #KeralaOnlineShopping #TrendingReels`
  ].join("\n");

  try {
    const res = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: prod.id,
        productNumber: script.productNumber,
        title: prod.title || prod.fullName || "Xevenzo Product",
        finalPrice: prod.finalPrice || ((Number(prod.basePrice) || 0) + 100),
        video_url: videoUrl,
        image_url: imageUrl,
        caption
      })
    });

    if (res.ok) {
      prod.reelStatus = "POSTED_TO_MAKE_24X7";
      writeCatalog(items);
      console.log("✅ 24/7 Auto-post sent to Make.com:", prod.id);
    } else {
      prod.reelStatus = "MAKE_WEBHOOK_ERROR";
      writeCatalog(items);
      console.error("Make webhook error:", res.status);
    }
  } catch (err) {
    prod.reelStatus = "MAKE_EXCEPTION";
    writeCatalog(items);
    console.error("Make error:", err.message);
  }
}

publishProductToInstagram(process.argv[2]);
