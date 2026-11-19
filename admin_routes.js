const fs = require("fs");
const path = require("path");
const express = require("express");
const { loadOrders, updateOrderStatus } = require("./order_store");

const router = express.Router();
const CATALOG_FILE = path.join(__dirname, "meesho_products.json");

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

router.get("/api/admin/overview", (_req, res) => {
  const orders = loadOrders();
  const products = readCatalog();
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.finalPrice || 0) * Number(o.quantity || 1), 0);
  const totalMargin = orders.reduce((sum, o) => sum + 100 * Number(o.quantity || 1), 0);
  res.json({
    ok: true,
    stats: {
      totalOrders,
      totalProducts: products.length,
      totalRevenue,
      totalMargin
    },
    orders,
    products
  });
});

router.post("/api/admin/products", (req, res) => {
  const { title, basePrice, meeshoLink, imageUrl } = req.body || {};
  const cleanTitle = String(title || "").trim();
  const cleanBase = Number(basePrice);
  const cleanLink = String(meeshoLink || "").trim();

  if (!cleanTitle || !Number.isFinite(cleanBase) || cleanBase <= 0 || !cleanLink) {
    return res.status(400).json({ ok: false, error: "Title, valid base price, and Meesho link are required." });
  }

  const margin = 100;
  const finalPrice = cleanBase + margin;
  const items = readCatalog();

  const product = {
    id: "XEV-" + Date.now().toString().slice(-5),
    title: cleanTitle,
    fullName: cleanTitle,
    basePrice: cleanBase,
    margin,
    finalPrice,
    meeshoLink: cleanLink,
    imageUrl: String(imageUrl || "").trim(),
    inStock: true,
    createdAt: new Date().toISOString()
  };

  items.unshift(product);
  writeCatalog(items);
  return res.json({ ok: true, product });
});

router.post("/api/admin/orders/:id/status", (req, res) => {
  const { status } = req.body || {};
  const allowed = ["NEW", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ ok: false, error: "Invalid status" });
  }
  const updated = updateOrderStatus(req.params.id, status);
  if (!updated) return res.status(404).json({ ok: false, error: "Order not found" });
  return res.json({ ok: true, order: updated });
});

router.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

module.exports = router;
