const fs = require("fs");
const path = require("path");

const CATALOG_FILE = path.join(__dirname, "meesho_products.json");
const IG_USER_ID = String(process.env.IG_USER_ID || "").trim();
const IG_ACCESS_TOKEN = String(process.env.IG_ACCESS_TOKEN || "").trim();
const PUBLIC_BASE = String(process.env.PUBLIC_BASE_URL || "https://xevenzo-backend.onrender.com").replace(/\/+$/, "");

function readCatalog() {
  if (!fs.existsSync(CATALOG_FILE)) return [];
  try {
    const d = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
    return Array.isArray(d) ? d : [];
  } catch (_) {
    return [];
  }
}

function writeCatalog(items) {
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(items, null, 2), "utf8");
}

async function publishProductToInstagram(productId) {
  const items = readCatalog();
  const prod = productId ? items.find((p) => p.id === productId) : items[0];
  if (!prod) {
    console.log("No product found for Instagram publish");
    return;
  }

  const finalPrice = prod.finalPrice || ((Number(prod.basePrice) || 0) + 100);
  const title = prod.title || prod.fullName || "Xevenzo Product";
  const caption = `🔥 ${title}\n💰 Price: ₹${finalPrice}\n${prod.details ? "✨ " + prod.details + "\n" : ""}📲 Order via WhatsApp DM now!\n#Xevenzo #MalayalamShopping #TrendingDeals`;

  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    prod.reelStatus = "IG_TOKEN_PENDING";
    writeCatalog(items);
    console.log("⚠️ Set IG_USER_ID and IG_ACCESS_TOKEN in Render env to auto-post to Instagram.");
    return;
  }

  const mediaUrl = prod.imageUrl
    ? (prod.imageUrl.startsWith("http") ? prod.imageUrl : `${PUBLIC_BASE}${prod.imageUrl}`)
    : "";

  if (!mediaUrl || typeof fetch !== "function") {
    prod.reelStatus = "IG_MEDIA_READY";
    writeCatalog(items);
    return;
  }

  try {
    const createRes = await fetch(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: mediaUrl,
        caption,
        access_token: IG_ACCESS_TOKEN
      })
    });
    const created = await createRes.json();
    if (!created.id) {
      prod.reelStatus = "IG_ERROR";
      writeCatalog(items);
      console.error("IG media create error:", created);
      return;
    }

    const pubRes = await fetch(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: created.id,
        access_token: IG_ACCESS_TOKEN
      })
    });
    const published = await pubRes.json();
    if (published.id) {
      prod.reelStatus = "POSTED_ON_INSTAGRAM";
      prod.igPostId = published.id;
      writeCatalog(items);
      console.log("✅ Published on Instagram XEVENZO:", published.id);
    } else {
      prod.reelStatus = "IG_PUBLISH_FAILED";
      writeCatalog(items);
      console.error("IG publish error:", published);
    }
  } catch (err) {
    prod.reelStatus = "IG_ERROR";
    writeCatalog(items);
    console.error("IG exception:", err.message);
  }
}

publishProductToInstagram(process.argv[2]);
