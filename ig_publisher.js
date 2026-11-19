const fs = require("fs");
const path = require("path");
const { assignProductNumbers, buildMalayalamVideoScript } = require("./xev_campaign_engine");

const CATALOG_FILE = path.join(__dirname, "meesho_products.json");
const REELS_DIR = path.join(__dirname, "reels");
const IG_USER_ID = String(process.env.IG_USER_ID || "").trim();
const IG_ACCESS_TOKEN = String(process.env.IG_ACCESS_TOKEN || "").trim();
const PUBLIC_BASE = String(process.env.PUBLIC_BASE_URL || "https://xevenzo-backend.onrender.com").replace(/\/+$/, "");

function writeCatalog(items) {
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(items, null, 2), "utf8");
}

async function publishProductToInstagram(productId) {
  const items = assignProductNumbers();
  const prod = productId ? items.find((p) => p.id === productId) : items[0];
  if (!prod) {
    console.log("No product found for Instagram publish");
    return;
  }

  const script = buildMalayalamVideoScript(prod);
  const videoFile = prod.reelVideoPath
    ? path.join(__dirname, prod.reelVideoPath.replace(/^\/+/, ""))
    : path.join(REELS_DIR, `${prod.id}-reel.mp4`);

  const caption = [
    script.hookMalayalam,
    script.bodyMalayalam,
    ``,
    `🔢 Product Number: *${script.productNumber}*`,
    script.ctaMalayalam,
    `#Xevenzo #MalayalamShopping #TrendingReels`
  ].join("\n");

  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    prod.reelStatus = "IG_CREDENTIALS_MISSING";
    writeCatalog(items);
    console.log("⚠️ Set IG_USER_ID and IG_ACCESS_TOKEN in Render env to auto-post to Instagram.");
    return;
  }

  const videoUrl = fs.existsSync(videoFile)
    ? `${PUBLIC_BASE}/reels/${path.basename(videoFile)}`
    : (prod.imageUrl ? (prod.imageUrl.startsWith("http") ? prod.imageUrl : `${PUBLIC_BASE}${prod.imageUrl}`) : "");

  if (!videoUrl || typeof fetch !== "function") {
    prod.reelStatus = "IG_MEDIA_MISSING";
    writeCatalog(items);
    return;
  }

  const isVideo = videoUrl.endsWith(".mp4");
  const payload = isVideo
    ? { media_type: "REELS", video_url: videoUrl, caption, access_token: IG_ACCESS_TOKEN }
    : { image_url: videoUrl, caption, access_token: IG_ACCESS_TOKEN };

  try {
    const createRes = await fetch(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const created = await createRes.json();
    if (!created.id) {
      prod.reelStatus = "IG_CREATE_ERROR";
      writeCatalog(items);
      console.error("IG media create error:", created);
      return;
    }

    const pubRes = await fetch(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: created.id, access_token: IG_ACCESS_TOKEN })
    });
    const published = await pubRes.json();
    if (published.id) {
      prod.reelStatus = "POSTED_ON_INSTAGRAM";
      prod.igMediaId = published.id;
      writeCatalog(items);
      console.log("✅ Published on Instagram XEVENZO:", published.id);
    } else {
      prod.reelStatus = "IG_PUBLISH_ERROR";
      writeCatalog(items);
      console.error("IG publish error:", published);
    }
  } catch (err) {
    prod.reelStatus = "IG_EXCEPTION";
    writeCatalog(items);
    console.error("IG error:", err.message);
  }
}

publishProductToInstagram(process.argv[2]);
