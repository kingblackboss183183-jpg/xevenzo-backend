const fs = require("fs");
const path = require("path");
const ORDERS_FILE = path.join(__dirname, "orders.json");

function loadOrders() {
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, "[]", "utf8");
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function saveOrders(list) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(list, null, 2), "utf8");
}

function addCustomerOrder(orderData) {
  const list = loadOrders();
  const basePrice = Number(orderData.basePrice || 0);
  const margin = 100;
  const finalPrice = Number(orderData.finalPrice || (basePrice ? basePrice + margin : 0));

  const record = {
    id: "ORD-" + Date.now().toString().slice(-6),
    createdAt: new Date().toISOString(),
    customerPhone: String(orderData.customerPhone || "").trim(),
    customerName: String(orderData.customerName || "").trim(),
    pincode: String(orderData.pincode || "").trim(),
    address: String(orderData.address || "").trim(),
    cityDistrict: String(orderData.cityDistrict || "").trim(),
    quantity: Number(orderData.quantity || 1),
    productTitle: String(orderData.productTitle || "Xevenzo Product").trim(),
    basePrice,
    margin,
    finalPrice,
    meeshoLink: String(orderData.meeshoLink || "").trim(),
    paymentStatus: String(orderData.paymentStatus || "PENDING").toUpperCase(),
    status: "NEW"
  };

  list.unshift(record);
  saveOrders(list);
  return record;
}

function updateOrderMeta(id, patch = {}) {
  const list = loadOrders();
  const item = list.find((o) => o.id === id);
  if (!item) return null;
  if (patch.status) item.status = patch.status;
  if (patch.paymentStatus) item.paymentStatus = patch.paymentStatus;
  item.updatedAt = new Date().toISOString();
  saveOrders(list);
  return item;
}

module.exports = { loadOrders, saveOrders, addCustomerOrder, updateOrderMeta };
