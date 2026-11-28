const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const express = require("express");
const { loadOrders, updateOrderMeta } = require("./order_store");
const { calcPricing, nextProductNumber } = require("./xev_campaign_engine");

const router = express.Router();
router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-admin-passcode");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
const CATALOG_FILE = path.join(__dirname, "meesho_products.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const ADMIN_PASSCODE = String(process.env.ADMIN_PASSCODE || "").trim();

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function checkPasscode(req, res, next) {
  const pass = String(req.headers["x-admin-passcode"] || req.query.passcode || "").trim();
  if (!ADMIN_PASSCODE || !pass || pass !== ADMIN_PASSCODE) {
    return res.status(401).json({ ok: false, error: "Invalid passcode" });
  }
  next();
}

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

router.use("/uploads", express.static(UPLOADS_DIR));

router.post("/api/admin/unlock", (req, res) => {
  const pass = String((req.body && req.body.passcode) || "").trim();
  if (ADMIN_PASSCODE && pass === ADMIN_PASSCODE) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: "തെറ്റായ പാസ്‌വേഡ്!" });
});

router.get("/api/admin/overview", checkPasscode, (_req, res) => {
  const orders = loadOrders();
  const products = readCatalog();
  const totalOrders = orders.length;
  const onlinePaid = orders.filter((o) => o.paymentStatus === "ONLINE PAID" || o.paymentStatus === "PAID").length;
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.finalPrice || 0) * Number(o.quantity || 1), 0);
  const totalMargin = orders.reduce((sum, o) => sum + Number(o.margin || 100) * Number(o.quantity || 1), 0);
  res.json({
    ok: true,
    stats: { totalOrders, onlinePaid, totalProducts: products.length, totalRevenue, totalMargin },
    orders,
    products
  });
});

router.post("/api/admin/products", checkPasscode, (req, res) => {
  const { title, details, basePrice, meeshoLink, imagesBase64, autoPostIg } = req.body || {};
  const cleanTitle = String(title || "").trim();
  const cleanBase = Number(basePrice);
  const cleanLink = String(meeshoLink || "").trim();

  if (!cleanTitle || !Number.isFinite(cleanBase) || cleanBase <= 0) {
    return res.status(400).json({ ok: false, error: "പ്രോഡക്റ്റ് പേരും കൃത്യമായ മീശോ വിലയും നൽകുക." });
  }

  const savedImages = [];
  if (Array.isArray(imagesBase64)) {
    imagesBase64.slice(0, 6).forEach((b64, i) => {
      if (typeof b64 === "string" && b64.includes(",")) {
        const extMatch = b64.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
        const ext = (extMatch && extMatch[1] ? extMatch[1].replace("jpeg", "jpg") : "png").toLowerCase();
        const raw = b64.split(",")[1];
        const safeName = `prod-${Date.now()}-${i}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, safeName), Buffer.from(raw, "base64"));
        savedImages.push(`/uploads/${safeName}`);
      }
    });
  }

  const { margin, finalPrice } = calcPricing(cleanBase);
  const items = readCatalog();

  const product = {
    id: "XEV-" + Date.now().toString().slice(-5),
    productNumber: nextProductNumber(items),
    title: cleanTitle,
    fullName: cleanTitle,
    details: String(details || "").trim(),
    basePrice: cleanBase,
    margin,
    finalPrice,
    meeshoLink: cleanLink,
    imageUrl: savedImages[0] || "",
    images: savedImages,
    inStock: true,
    reelStatus: autoPostIg ? "QUEUED" : "READY",
    createdAt: new Date().toISOString()
  };

  items.unshift(product);
  writeCatalog(items);

  if (autoPostIg) {
    triggerReelAndInstagram(product);
  }

  return res.json({ ok: true, product });
});

let reelQueue = Promise.resolve();
function triggerReelAndInstagram(product) {
  reelQueue = reelQueue.then(() => new Promise((resolve) => {
    const mark = (status) => {
      try {
        const items = readCatalog();
        const p = items.find((x) => x.id === product.id);
        if (p) { p.reelStatus = status; writeCatalog(items); }
      } catch (_) {}
    };
    mark("BUILDING_VIDEO");
    execFile("node", ["build_xev_reel.js", product.id], { cwd: __dirname, timeout: 900000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      console.log(String(stdout || "").slice(-600));
      if (err) {
        console.error("❌ REEL build failed:", String(stderr || err.message).slice(-800));
        mark("REEL_FAILED");
        return resolve();
      }
      execFile("node", ["ig_publisher.js", product.id], { cwd: __dirname, timeout: 300000 }, (err2, so2, se2) => {
        console.log(String(so2 || "").slice(-600));
        if (err2) console.error("❌ IG publish step failed:", String(se2 || err2.message).slice(-800));
        resolve();
      });
    });
  }));
}

router.post("/api/admin/products/:id/publish-ig", checkPasscode, (req, res) => {
  const items = readCatalog();
  const prod = items.find((p) => p.id === req.params.id);
  if (!prod) return res.status(404).json({ ok: false, error: "Product not found" });
  prod.reelStatus = "PROCESSING_IG";
  writeCatalog(items);
  triggerReelAndInstagram(prod);
  return res.json({ ok: true, message: "വീഡിയോ നിർമ്മാണവും ഇൻസ്റ്റാഗ്രാം പോസ്റ്റിംഗും ആരംഭിച്ചു!" });
});

router.post("/api/admin/orders/:id/meta", checkPasscode, (req, res) => {
  const { status, paymentStatus, trackingId, courier } = req.body || {};
  const allowedStatus = ["NEW", "MEESHO_ORDERED", "SHIPPED", "DELIVERED", "CANCELLED"];
  const allowedPay = ["PENDING", "ONLINE PAID", "COD"];

  const patch = {};
  if (status && allowedStatus.includes(status)) patch.status = status;
  if (paymentStatus && allowedPay.includes(paymentStatus)) patch.paymentStatus = paymentStatus;
        if (typeof trackingId === "string") patch.trackingId = trackingId.trim().slice(0,80);
        if (typeof courier === "string") patch.courier = courier.trim().slice(0,40);

  const updated = updateOrderMeta(req.params.id, patch);
  if (!updated) return res.status(404).json({ ok: false, error: "Order not found" });
  return res.json({ ok: true, order: updated });
});


// --- Phase2: Public Customer Tracking (no passcode, last-4 phone check) ---
router.post("/api/track", (req, res) => {
  const orderId = String(req.body?.orderId || "").trim().toUpperCase();
  const last4 = String(req.body?.last4 || "").trim();
  if(!orderId || !/^\d{4}$/.test(last4)) return res.status(400).json({ok:false,error:"Invalid input"});
  const o = loadOrders().find(x => x.id === orderId);
  if(!o) return res.status(404).json({ok:false,error:"Not found"});
  const digits = String(o.customerPhone || "").replace(/\D/g,"");
  if(!digits || !digits.endsWith(last4)) return res.status(404).json({ok:false,error:"Not found"});
  return res.json({ok:true, order:{id:o.id, productTitle:o.productTitle, quantity:o.quantity, status:o.status, paymentStatus:o.paymentStatus, trackingId:o.trackingId||"", createdAt:o.createdAt, cityDistrict:o.cityDistrict||""}});
});
router.get("/track", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "track.html"));
});

router.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

module.exports = router;
