const fs = require("fs");
const path = require("path");
const express = require("express");
const { loadOrders, updateOrderMeta } = require("./order_store");

const router = express.Router();
const CATALOG_FILE = path.join(__dirname, "meesho_products.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "Xevenzo@2026";

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
  if (pass === ADMIN_PASSCODE) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: "തെറ്റായ പാസ്‌വേഡ്! വീണ്ടും ശ്രമിക്കുക." });
});

router.get("/api/admin/overview", checkPasscode, (_req, res) => {
  const orders = loadOrders();
  const products = readCatalog();
  const totalOrders = orders.length;
  const paidOrders = orders.filter((o) => o.paymentStatus === "PAID").length;
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.finalPrice || 0) * Number(o.quantity || 1), 0);
  const totalMargin = orders.reduce((sum, o) => sum + 100 * Number(o.quantity || 1), 0);
  res.json({
    ok: true,
    stats: {
      totalOrders,
      paidOrders,
      totalProducts: products.length,
      totalRevenue,
      totalMargin
    },
    orders,
    products
  });
});

router.post("/api/admin/products", checkPasscode, (req, res) => {
  const { title, details, basePrice, meeshoLink, imageUrl, imageBase64, fileName } = req.body || {};
  const cleanTitle = String(title || "").trim();
  const cleanBase = Number(basePrice);
  const cleanLink = String(meeshoLink || "").trim();

  if (!cleanTitle || !Number.isFinite(cleanBase) || cleanBase <= 0) {
    return res.status(400).json({ ok: false, error: "പ്രോഡക്റ്റ് പേരും കൃത്യമായ മീശോ വിലയും ആവശ്യമാണ്." });
  }

  let savedImage = String(imageUrl || "").trim();
  if (imageBase64 && typeof imageBase64 === "string" && imageBase64.includes(",")) {
    const extMatch = imageBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
    const ext = (extMatch && extMatch[1] ? extMatch[1].replace("jpeg", "jpg") : "png").toLowerCase();
    const b64Data = imageBase64.split(",")[1];
    const safeName = `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, safeName), Buffer.from(b64Data, "base64"));
    savedImage = `/uploads/${safeName}`;
  } else if (fileName && !savedImage) {
    savedImage = String(fileName).trim();
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
    imageUrl: savedImage,
    inStock: true,
    createdAt: new Date().toISOString()
  };

  items.unshift(product);
  writeCatalog(items);
  return res.json({ ok: true, product });
});

router.post("/api/admin/orders/:id/meta", checkPasscode, (req, res) => {
  const { status, paymentStatus } = req.body || {};
  const allowedStatus = ["NEW", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED"];
  const allowedPay = ["PENDING", "PAID", "COD"];

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
