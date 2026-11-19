const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const express = require("express");
const { loadOrders, updateOrderMeta } = require("./order_store");

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
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "@RafiK183";

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function checkPasscode(req, res, next) {
  const pass = String(req.headers["x-admin-passcode"] || req.query.passcode || "").trim();
  if (!pass || pass !== ADMIN_PASSCODE) {
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
  if (pass === ADMIN_PASSCODE) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: "തെറ്റായ പാസ്‌വേഡ്! @RafiK183 നൽകുക." });
});

router.get("/api/admin/overview", checkPasscode, (_req, res) => {
  const orders = loadOrders();
  const products = readCatalog();
  const totalOrders = orders.length;
  const onlinePaid = orders.filter((o) => o.paymentStatus === "ONLINE PAID" || o.paymentStatus === "PAID").length;
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.finalPrice || 0) * Number(o.quantity || 1), 0);
  const totalMargin = orders.reduce((sum, o) => sum + 100 * Number(o.quantity || 1), 0);
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

  const margin = 100;
  const finalPrice = cleanBase + margin;
  const items = readCatalog();

  const product = {
    id: "XEV-" + Date.now().toString().slice(-5),
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

function triggerReelAndInstagram(product) {
  const reelScript = ["pro_malayalam_reel.js", "make_meesho_reel.js"].find((f) => fs.existsSync(path.join(__dirname, f)));
  const igScript = fs.existsSync(path.join(__dirname, "ig_publisher.js")) ? "ig_publisher.js" : null;
  if (!reelScript) return;

  execFile("node", [reelScript, product.id], { cwd: __dirname, timeout: 120000 }, (err) => {
    if (!err && igScript) {
      execFile("node", [igScript, product.id], { cwd: __dirname, timeout: 120000 }, () => {});
    }
  });
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
  const { status, paymentStatus } = req.body || {};
  const allowedStatus = ["NEW", "MEESHO_ORDERED", "SHIPPED", "DELIVERED", "CANCELLED"];
  const allowedPay = ["PENDING", "ONLINE PAID", "COD"];

  const patch = {};
  if (status && allowedStatus.includes(status)) patch.status = status;
  if (paymentStatus && allowedPay.includes(paymentStatus)) patch.paymentStatus = paymentStatus;

  const updated = updateOrderMeta(req.params.id, patch);
  if (!updated) return res.status(404).json({ ok: false, error: "Order not found" });
  return res.json({ ok: true, order: updated });
});

router.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

module.exports = router;
