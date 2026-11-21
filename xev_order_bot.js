// Xevenzo WhatsApp order bot: reel number -> product card -> address -> payment -> admin commands.
// No AI key needed. Everything comes from meesho_products.json and orders.json.
const fs = require("fs");
const path = require("path");
const { assignProductNumbers, calcPricing } = require("./xev_campaign_engine");
const { loadOrders, addCustomerOrder, updateOrderMeta } = require("./order_store");

let QRCode = null;
try { QRCode = require("qrcode"); } catch (_) {}

const ADMIN_PHONE = String(process.env.ADMIN_PHONE || "918078426656").replace(/\D/g, "");
const ADMIN_JID = ADMIN_PHONE + "@s.whatsapp.net";
const UPI_ID = String(process.env.UPI_ID || "8078426656@naviaxis").trim();
const PAYEE_NAME = String(process.env.UPI_NAME || "MOHAMMED RAFI K").trim();
const PRODUCTS_FILE = path.join(__dirname, "meesho_products.json");
const COD_LIMIT = 5000;

const viewed = new Map();    // customer jid -> product id
const sessions = new Map();  // customer jid -> order session
const adminAsCustomer = new Set();

const STEPS = [
  { key: "name", ask: "നിങ്ങളുടെ *പൂർണ്ണ പേര്* എന്താണ്?" },
  { key: "phone", ask: "ഡെലിവറിക്ക് വിളിക്കാൻ പറ്റുന്ന *ഫോൺ നമ്പർ* (10 അക്കം) അയക്കുക:" },
  { key: "pincode", ask: "*പിൻകോഡ്* (6 അക്കം) അയക്കുക:" },
  { key: "houseAndArea", ask: "*വീടിന്റെ പേര്/നമ്പർ, ഏരിയ, ലാൻഡ്മാർക്ക്* കൃത്യമായി അയക്കുക:" },
  { key: "cityDistrict", ask: "*സിറ്റി/ടൗൺ, ജില്ല* ഏതാണ്?" },
  { key: "qty", ask: "എത്ര *എണ്ണം* വേണം? (ഉദാ: 1)" }
];

const t = (s) => String(s == null ? "" : s).trim();
const digitsOf = (s) => String(s || "").replace(/\D/g, "");

function jidDigits(j) { return digitsOf(String(j || "").split("@")[0].split(":")[0]); }

function isAdmin(msg, jid) {
  const k = (msg && msg.key) || {};
  return [jid, k.remoteJidAlt, k.participantAlt, k.participant].some((c) => {
    const d = jidDigits(c);
    return d.length >= 10 && d.endsWith(ADMIN_PHONE.slice(-10));
  });
}

function isGroupOrSystem(jid) { return /@g\.us$|@broadcast$|@newsletter$/.test(String(jid || "")); }

function readProducts() { try { return assignProductNumbers(); } catch (_) { return []; } }
function productPrice(p) { return Number(p.finalPrice) || calcPricing(p.basePrice).finalPrice; }
function findByNumber(n) { return readProducts().find((p) => parseInt(p.productNumber, 10) === n) || null; }
function findById(id) { return readProducts().find((p) => p.id === id) || null; }

function setStock(number, inStock) {
  let items = [];
  try { items = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8")); } catch (_) { return null; }
  const numbered = assignProductNumbers();
  const target = numbered.find((p) => parseInt(p.productNumber, 10) === number);
  if (!target) return null;
  const raw = items.find((p) => p.id === target.id);
  if (!raw) return null;
  raw.inStock = inStock;
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(items, null, 2), "utf8");
  return target;
}

async function send(sock, jid, text) {
  try { if (sock.sendPresenceUpdate) await sock.sendPresenceUpdate("composing", jid); } catch (_) {}
  if (!process.env.XEV_FAST) await new Promise((r) => setTimeout(r, 600));
  try { if (sock.sendPresenceUpdate) await sock.sendPresenceUpdate("paused", jid); } catch (_) {}
  return sock.sendMessage(jid, { text });
}

function parseReelNumber(text) {
  const s = t(text);
  if (!s || s.length > 30 || /\d{4,}/.test(s)) return null;
  const m = s.match(/(?:^|\s|#)(?:reel|റീൽ|റീല്‍|no\.?|number|നമ്പർ|product)?\s*[:#-]?\s*0*(\d{1,3})(?=\s|$|[?.!])/i);
  return m ? parseInt(m[1], 10) : null;
}

const WANTS_ORDER = /(order|buy|book|ഓർഡർ|വേണം|വാങ്ങ)/i;
const GREETING = /^(hi+|hello+|hlo+|hey+|hai+|ഹായ്|ഹലോ|നമസ്കാരം|namaskaram|salam|സലാം)\b/i;
const WANTS_STATUS = /(track|status|where|എവിടെ|ട്രാക്ക്|സ്റ്റാറ്റസ്)/i;
const WANTS_PRICE = /(price|വില|rate|ഫോട്ടോ|photo|details|വിവരം|ഡീറ്റെയിൽ)/i;
const CANCEL = /^(cancel|ക്യാൻസൽ|വേണ്ട|cancel order)$/i;

function productCard(p) {
  const details = t(p.details).replace(/\s+/g, " ").slice(0, 220);
  return [
    `🛍️ *${p.title}*  (റീൽ നമ്പർ ${p.productNumber})`,
    `💰 *വില: ₹${productPrice(p)}*`,
    details ? `📝 ${details}` : null,
    `✅ UPI പേയ്മെന്റ്, ക്യാഷ് ഓൺ ഡെലിവറി ലഭ്യമാണ്`,
    ``,
    `ഓർഡർ ചെയ്യാൻ *വേണം* എന്ന് അയക്കൂ. 🙂`
  ].filter((x) => x !== null).join("\n");
}

async function sendProductCard(sock, jid, p) {
  const card = productCard(p);
  const imgRel = (Array.isArray(p.images) && p.images[0]) || p.imageUrl || "";
  if (imgRel && String(imgRel).startsWith("/uploads/")) {
    const file = path.join(__dirname, String(imgRel).replace(/^\/+/, ""));
    if (fs.existsSync(file)) {
      try { await sock.sendMessage(jid, { image: fs.readFileSync(file), caption: card }); return; } catch (_) {}
    }
  }
  await send(sock, jid, card);
}

function catalogList() {
  const items = readProducts().filter((p) => p.inStock !== false).slice(0, 8);
  if (!items.length) return "";
  return items.map((p) => `• ${p.productNumber} - ${p.title} (₹${productPrice(p)})`).join("\n");
}

async function sendHelp(sock, jid, intro) {
  const list = catalogList();
  await send(sock, jid, [
    intro,
    `ഇൻസ്റ്റഗ്രാം റീലിൽ കാണിച്ച *നമ്പർ* (ഉദാ: 01) അയച്ചാൽ പ്രോഡക്റ്റ് വിവരവും വിലയും അയക്കാം.`,
    list ? `\nഇപ്പോൾ ലഭ്യമായവ:\n${list}` : null
  ].filter((x) => x !== null).join("\n"));
}

function startSession(jid, product) {
  sessions.set(jid, { stage: "ADDRESS", step: 0, product, data: {}, orderId: "" });
  return STEPS[0].ask;
}

function qtyFrom(session) {
  return Math.min(Math.max(parseInt(digitsOf(session.data.qty), 10) || 1, 1), 10);
}

function totals(session) {
  const unit = productPrice(session.product);
  const qty = qtyFrom(session);
  return { unit, qty, total: unit * qty };
}

function addressSummary(session) {
  const d = session.data;
  const { unit, qty, total } = totals(session);
  return [
    `📋 *ഓർഡർ വിവരങ്ങൾ ഒന്ന് നോക്കൂ:*`,
    `• പ്രോഡക്റ്റ്: ${session.product.title}`,
    `• എണ്ണം: ${qty} (₹${unit} വീതം)  → *ആകെ ₹${total}*`,
    `• പേര്: ${d.name}`,
    `• ഫോൺ: ${d.phone}`,
    `• വിലാസം: ${d.houseAndArea}, ${d.cityDistrict} - ${d.pincode}`,
    ``,
    `എല്ലാം ശരിയാണെങ്കിൽ *ശരി* എന്ന് അയക്കൂ. തിരുത്താൻ *തിരുത്തണം* എന്ന് അയക്കൂ.`
  ].join("\n");
}

function adminSlip(order, session, headline) {
  const d = session.data;
  const qty = qtyFrom(session);
  const p = session.product;
  return [
    `🛒 *${headline} (${order.id})*`,
    `• Product: ${p.title} (No. ${p.productNumber}) x ${qty}`,
    `• Payment: ${order.paymentMethod === "COD" ? "COD" : "UPI"}  | Customer total: ₹${productPrice(p) * qty}`,
    `• Meesho base total: ₹${Number(p.basePrice || 0) * qty}  | Your margin: ₹${Number(p.margin || 0) * qty}`,
    `• Meesho link: ${p.meeshoLink || "-"}`,
    `-----------------------`,
    `• Name: ${d.name}`,
    `• Phone: ${d.phone}`,
    `• Address: ${d.houseAndArea}, ${d.cityDistrict}`,
    `• Pincode: ${d.pincode}`
  ].join("\n");
}

async function sendUpiInstructions(sock, jid, session, order) {
  const { total } = totals(session);
  const upiUri = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(PAYEE_NAME)}&am=${encodeURIComponent(String(total))}&cu=INR&tn=${encodeURIComponent(order.id)}`;
  const caption = [
    `💳 *പേയ്മെന്റ്  (ഓർഡർ ${order.id})*`,
    `• ആകെ അടയ്ക്കേണ്ട തുക: *₹${total}*`,
    `• UPI ID: ${UPI_ID}  (${PAYEE_NAME})`,
    ``,
    `QR സ്കാൻ ചെയ്യുക, അല്ലെങ്കിൽ മുകളിലെ UPI ID-യിലേക്ക് *₹${total}* അയക്കുക. നോട്ടിൽ *${order.id}* എഴുതണേ.`,
    `പണമടച്ച ശേഷം *സ്ക്രീൻഷോട്ട്* ഇവിടെ അയക്കൂ. പണം ഉറപ്പാക്കിയാൽ ഓർഡർ കൺഫേം ചെയ്ത് അറിയിക്കും.`
  ].join("\n");
  if (QRCode) {
    try {
      const buf = await QRCode.toBuffer(upiUri, { type: "png", width: 512, margin: 2 });
      await sock.sendMessage(jid, { image: buf, caption });
      return;
    } catch (_) {}
  }
  await send(sock, jid, caption);
}

async function createOrder(sock, jid, session, method) {
  const d = session.data;
  const p = session.product;
  const { unit, qty, total } = totals(session);
  const order = addCustomerOrder({
    customerPhone: d.phone, customerName: d.name, pincode: d.pincode,
    address: d.houseAndArea, cityDistrict: d.cityDistrict, quantity: qty,
    productTitle: p.title, basePrice: p.basePrice, margin: p.margin, finalPrice: unit,
    meeshoLink: p.meeshoLink, paymentStatus: method === "COD" ? "COD" : "UPI_PENDING"
  });
  updateOrderMeta(order.id, {
    customerJid: jid, productId: p.id, productNumber: p.productNumber,
    paymentMethod: method, totalAmount: total, status: "NEW"
  });
  order.paymentMethod = method;
  session.orderId = order.id;
  return order;
}

async function handleSessionMessage(sock, msg, jid, text, session) {
  const hasImage = Boolean(msg && msg.message && msg.message.imageMessage);

  if (CANCEL.test(text)) {
    sessions.delete(jid);
    await send(sock, jid, "ശരി, ഓർഡർ റദ്ദാക്കി. വേറെ പ്രോഡക്റ്റ് വേണമെങ്കിൽ റീൽ നമ്പർ അയക്കൂ. 🙂");
    return true;
  }

  if (session.stage === "ADDRESS") {
    const step = STEPS[session.step];
    if (!text) { await send(sock, jid, "ദയവായി ടെക്സ്റ്റ് ആയി അയക്കൂ.\n" + step.ask); return true; }
    if (step.key === "pincode" && !/^\d{6}$/.test(text)) { await send(sock, jid, "❌ കൃത്യമായ *6 അക്ക പിൻകോഡ്* അയക്കൂ (ഉദാ: 679334)."); return true; }
    if (step.key === "phone" && digitsOf(text).length < 10) { await send(sock, jid, "❌ കൃത്യമായ *10 അക്ക ഫോൺ നമ്പർ* അയക്കൂ."); return true; }
    if (step.key === "qty" && !/^\d{1,2}$/.test(text)) { await send(sock, jid, "❌ എണ്ണം അക്കത്തിൽ അയക്കൂ (ഉദാ: 1)."); return true; }
    session.data[step.key] = step.key === "phone" ? digitsOf(text).slice(-10) : text;
    session.step += 1;
    if (session.step < STEPS.length) { await send(sock, jid, STEPS[session.step].ask); return true; }
    session.stage = "CONFIRM";
    await send(sock, jid, addressSummary(session));
    return true;
  }

  if (session.stage === "CONFIRM") {
    if (/^(ശരി|ശെരി|sheri|yes|ok|okay|confirm|correct|athe|അതെ)$/i.test(text)) {
      session.stage = "PAYCHOICE";
      const { total } = totals(session);
      const codOk = total < COD_LIMIT;
      await send(sock, jid, [
        `പേയ്മെന്റ് എങ്ങനെ ചെയ്യണം? (ആകെ ₹${total})`,
        `*1* - UPI (GPay / PhonePe) - ഓർഡർ വേഗം അയക്കും`,
        codOk ? `*2* - ക്യാഷ് ഓൺ ഡെലിവറി` : `(₹${COD_LIMIT}-ൽ കൂടിയ തുകയ്ക്ക് UPI മാത്രം)`,
        `1 അല്ലെങ്കിൽ 2 അയക്കൂ.`
      ].join("\n"));
      return true;
    }
    if (/^(തിരുത്തണം|തിരുത്ത്|edit|change|no|അല്ല)/i.test(text)) {
      session.stage = "ADDRESS"; session.step = 0; session.data = {};
      await send(sock, jid, "ശരി, ആദ്യം മുതൽ വിവരങ്ങൾ എടുക്കാം.\n" + STEPS[0].ask);
      return true;
    }
    await send(sock, jid, "വിവരങ്ങൾ ശരിയാണെങ്കിൽ *ശരി* എന്നും, തിരുത്താൻ *തിരുത്തണം* എന്നും അയക്കൂ.");
    return true;
  }

  if (session.stage === "PAYCHOICE") {
    const { total } = totals(session);
    const wantsUpi = /^1$|upi|gpay|phonepe|ഗൂഗിൾ/i.test(text);
    const wantsCod = /^2$|cod|cash|ക്യാഷ്|കാഷ്/i.test(text);
    if (!wantsUpi && !wantsCod) { await send(sock, jid, "1 (UPI) അല്ലെങ്കിൽ 2 (ക്യാഷ് ഓൺ ഡെലിവറി) എന്ന് അയക്കൂ."); return true; }
    if (wantsCod && total >= COD_LIMIT) { await send(sock, jid, `ക്ഷമിക്കണം, ₹${COD_LIMIT}-ൽ കൂടിയ തുകയ്ക്ക് UPI മാത്രമേ പറ്റൂ. *1* അയക്കൂ.`); return true; }

    if (wantsUpi) {
      if (UPI_ID.startsWith("__")) {
        await send(sock, jid, "ക്ഷമിക്കണം, പേയ്മെന്റ് വിവരം ഇപ്പോൾ ലഭ്യമല്ല. ഉടൻ അറിയിക്കാം.");
        await send(sock, ADMIN_JID, "⚠️ UPI_ID സെറ്റ് ചെയ്തിട്ടില്ല. Render Environment-ൽ UPI_ID ചേർക്കൂ.");
        return true;
      }
      const order = await createOrder(sock, jid, session, "UPI");
      session.stage = "AWAITING_PAYMENT";
      await sendUpiInstructions(sock, jid, session, order);
      return true;
    }

    const order = await createOrder(sock, jid, session, "COD");
    sessions.delete(jid);
    await send(sock, jid, [
      `✅ *ഓർഡർ രേഖപ്പെടുത്തി (${order.id})*`,
      `ക്യാഷ് ഓൺ ഡെലിവറി: സാധനം കിട്ടുമ്പോൾ *₹${totals(session).total}* നൽകിയാൽ മതി.`,
      `ഓർഡർ ഇട്ട ശേഷം ട്രാക്കിംഗ് വിവരം ഇവിടെ അയക്കാം.`
    ].join("\n"));
    await send(sock, ADMIN_JID, adminSlip(order, session, "NEW COD ORDER") + `\n\nമീശോയിൽ ഓർഡർ ഇട്ട ശേഷം അയക്കൂ: ordered ${order.id}`);
    return true;
  }

  if (session.stage === "AWAITING_PAYMENT") {
    const claimed = hasImage || /(paid|done|payment|ചെയ്തു|അടച്ചു|അയച്ചു|utr|ref)/i.test(text) || digitsOf(text).length >= 8;
    if (!claimed) {
      await send(sock, jid, `ദയവായി *₹${totals(session).total}* അടച്ച ശേഷം പേയ്മെന്റ് *സ്ക്രീൻഷോട്ട്* അയക്കൂ. (ഓർഡർ ${session.orderId}) റദ്ദാക്കാൻ *cancel* അയക്കൂ.`);
      return true;
    }
    updateOrderMeta(session.orderId, { paymentStatus: "UPI_CLAIMED" });
    const order = loadOrders().find((o) => o.id === session.orderId) || { id: session.orderId, paymentMethod: "UPI" };
    order.paymentMethod = "UPI";
    sessions.delete(jid);
    await send(sock, jid, `🙏 നന്ദി! പേയ്മെന്റ് വിവരം ലഭിച്ചു (${session.orderId}). പണം ഉറപ്പാക്കിയ ശേഷം ഓർഡർ കൺഫേം ചെയ്ത് ഇവിടെ അറിയിക്കാം.`);
    if (hasImage) { try { await sock.sendMessage(ADMIN_JID, { forward: msg }); } catch (_) {} }
    await send(sock, ADMIN_JID, adminSlip(order, session, "UPI PAYMENT CLAIMED") + `\n\nബാങ്ക്/UPI ആപ്പിൽ ₹${totals(session).total} വന്നെന്ന് നോക്കിയ ശേഷം അയക്കൂ: verify ${session.orderId}`);
    return true;
  }
  return false;
}

function statusReply(jid) {
  const mine = loadOrders().filter((o) => o.customerJid === jid);
  if (!mine.length) return "നിങ്ങളുടെ ഓർഡർ ഒന്നും കണ്ടില്ല. റീൽ നമ്പർ അയച്ച് ഓർഡർ ചെയ്യാം. 🙂";
  const o = mine[0];
  const head = `ഓർഡർ ${o.id} (${o.productTitle})`;
  if (o.status === "SHIPPED") return `📦 ${head}\nട്രാക്കിംഗ്: ${o.trackingInfo || "വിവരം ഉടൻ"}`;
  if (o.status === "ORDERED") return `📦 ${head}\nഓർഡർ ഇട്ടിട്ടുണ്ട്. ട്രാക്കിംഗ് വിവരം ഉടൻ അയക്കാം.`;
  if (o.status === "PAID") return `✅ ${head}\nപണം ലഭിച്ചു. ഓർഡർ ഇടുകയാണ്.`;
  if (o.paymentStatus === "UPI_CLAIMED") return `⏳ ${head}\nപേയ്മെന്റ് ഉറപ്പാക്കുകയാണ്, ഉടൻ അറിയിക്കാം.`;
  if (o.paymentStatus === "UPI_PENDING") return `⏳ ${head}\nപണമടച്ച ശേഷം സ്ക്രീൻഷോട്ട് അയക്കൂ.`;
  return `📋 ${head}\nഓർഡർ രേഖപ്പെടുത്തി, ഉടൻ പ്രോസസ് ചെയ്യും.`;
}

async function handleCustomer(sock, msg, jid, text) {
  const hasImage = Boolean(msg && msg.message && msg.message.imageMessage);
  const session = sessions.get(jid);
  if (session) return handleSessionMessage(sock, msg, jid, text, session);

  if (!text) return true;  // stickers, reactions, etc: stay quiet

  const n = parseReelNumber(text);
  if (n === null && WANTS_STATUS.test(text)) { await send(sock, jid, statusReply(jid)); return true; }
  const wantsOrder = WANTS_ORDER.test(text) && text.length <= 40;

  if (n !== null) {
    const p = findByNumber(n);
    if (!p) { await sendHelp(sock, jid, `ക്ഷമിക്കണം, ${n} എന്ന നമ്പറിൽ പ്രോഡക്റ്റ് കണ്ടില്ല.`); return true; }
    if (p.inStock === false) { await send(sock, jid, `ക്ഷമിക്കണം, *${p.title}* ഇപ്പോൾ സ്റ്റോക്ക് ഇല്ല. വേറെ നമ്പർ നോക്കൂ. 🙏`); return true; }
    viewed.set(jid, p.id);
    if (wantsOrder) { await send(sock, jid, startSession(jid, p)); return true; }
    await sendProductCard(sock, jid, p);
    return true;
  }

  const vp = viewed.has(jid) ? findById(viewed.get(jid)) : null;

  if (wantsOrder) {
    if (!vp) { await sendHelp(sock, jid, "ഓർഡർ ചെയ്യാൻ ആദ്യം പ്രോഡക്റ്റ് തിരഞ്ഞെടുക്കാം."); return true; }
    if (vp.inStock === false) { await send(sock, jid, `ക്ഷമിക്കണം, *${vp.title}* ഇപ്പോൾ സ്റ്റോക്ക് ഇല്ല. 🙏`); return true; }
    await send(sock, jid, startSession(jid, vp));
    return true;
  }
  if (WANTS_PRICE.test(text) && vp) { await sendProductCard(sock, jid, vp); return true; }
  if (GREETING.test(text)) { await sendHelp(sock, jid, "നമസ്കാരം! 🙏 Xevenzo-ലേക്ക് സ്വാഗതം."); return true; }
  await sendHelp(sock, jid, "ക്ഷമിക്കണം, മനസ്സിലായില്ല.");
  return true;
}

async function handleAdminCommand(sock, jid, text) {
  const s = t(text);
  let m;

  if (/^customer\s+on$/i.test(s)) { adminAsCustomer.add(jid); await send(sock, jid, "ടെസ്റ്റ് മോഡ് ON: ഇനി നിങ്ങളെ ഒരു കസ്റ്റമർ ആയി കണക്കാക്കും. നിർത്താൻ: customer off"); return true; }
  if (/^customer\s+off$/i.test(s)) { adminAsCustomer.delete(jid); sessions.delete(jid); await send(sock, jid, "ടെസ്റ്റ് മോഡ് OFF."); return true; }

  if (/^orders?$/i.test(s)) {
    const open = loadOrders().filter((o) => o.status !== "SHIPPED").slice(0, 6);
    await send(sock, jid, open.length
      ? open.map((o) => `${o.id} | No.${o.productNumber || "-"} | ${o.customerName} | ${o.paymentStatus} | ${o.status}`).join("\n")
      : "ബാക്കിയുള്ള ഓർഡറുകൾ ഇല്ല.");
    return true;
  }

  if ((m = s.match(/^stock\s+(out|in)\s+0*(\d{1,3})$/i))) {
    const p = setStock(parseInt(m[2], 10), m[1].toLowerCase() === "in");
    await send(sock, jid, p ? `✅ ${p.productNumber} - ${p.title}: ${m[1].toLowerCase() === "in" ? "സ്റ്റോക്ക് ഉണ്ട്" : "സ്റ്റോക്ക് ഇല്ല"}` : "ആ നമ്പറിൽ പ്രോഡക്റ്റ് കണ്ടില്ല.");
    return true;
  }

  if ((m = s.match(/^(verify|ordered|track)\s+(ORD-?\d+)\s*([\s\S]*)$/i))) {
    const cmd = m[1].toLowerCase();
    const id = m[2].toUpperCase().replace(/^ORD(?!-)/, "ORD-");
    const arg = t(m[3]);
    const order = loadOrders().find((o) => o.id === id);
    if (!order) { await send(sock, jid, `❌ ഓർഡർ ഐഡി കണ്ടില്ല: ${id}`); return true; }
    const toCustomer = order.customerJid;
    if (!toCustomer) { await send(sock, jid, `❌ ${id}: കസ്റ്റമറുടെ വാട്സാപ്പ് വിവരം ഇല്ല.`); return true; }

    if (cmd === "verify") {
      if (order.paymentMethod === "COD") { await send(sock, jid, `${id} COD ഓർഡറാണ്, verify വേണ്ട. മീശോയിൽ ഇട്ട ശേഷം: ordered ${id}`); return true; }
      updateOrderMeta(id, { paymentStatus: "PAID", status: "PAID" });
      await send(sock, toCustomer, `✅ *പണം ലഭിച്ചു* (${id}). നന്ദി! ഓർഡർ ഇടുകയാണ്, ട്രാക്കിംഗ് വിവരം ഉടൻ ഇവിടെ അയക്കാം.`);
      await send(sock, jid, `✅ ${id} verified. കസ്റ്റമറെ അറിയിച്ചു. മീശോയിൽ ഇട്ട ശേഷം: ordered ${id}`);
      return true;
    }
    if (cmd === "ordered") {
      updateOrderMeta(id, { status: "ORDERED" });
      await send(sock, toCustomer, `📦 *ഓർഡർ ഇട്ടിട്ടുണ്ട്* (${id}). ട്രാക്കിംഗ് വിവരം കിട്ടിയാൽ ഉടൻ അയക്കാം.`);
      await send(sock, jid, `✅ ${id}: കസ്റ്റമറെ അറിയിച്ചു. ട്രാക്കിംഗ് കിട്ടിയാൽ: track ${id} <വിവരം>`);
      return true;
    }
    if (!arg) { await send(sock, jid, `ട്രാക്കിംഗ് വിവരം കൂടി എഴുതൂ. ഉദാ: track ${id} AWB123456 Delhivery`); return true; }
    updateOrderMeta(id, { status: "SHIPPED", trackingInfo: arg });
    await send(sock, toCustomer, [
      `🚚 *ഡെലിവറി അപ്ഡേറ്റ് (${id})*`,
      `• ഉൽപ്പന്നം: ${order.productTitle}`,
      `• എണ്ണം: ${order.quantity || 1}`,
      `• ട്രാക്കിംഗ്: ${arg}`,
      `ഡെലിവറി ആൾ ${order.customerPhone || "നിങ്ങളുടെ നമ്പറിൽ"} വിളിച്ചേക്കാം.`
    ].join("\n"));
    await send(sock, jid, `✅ ${id}: ട്രാക്കിംഗ് കസ്റ്റമർക്ക് അയച്ചു.`);
    return true;
  }
  return false;
}

async function handleXevMessage(sock, msg, jid, textBody) {
  if (!jid || isGroupOrSystem(jid)) return true;
  const text = t(textBody);
  if (isAdmin(msg, jid)) {
    if (await handleAdminCommand(sock, jid, text)) return true;
    if (!adminAsCustomer.has(jid)) return false;
  }
  return handleCustomer(sock, msg, jid, text);
}

module.exports = { handleXevMessage, parseReelNumber, productCard };
