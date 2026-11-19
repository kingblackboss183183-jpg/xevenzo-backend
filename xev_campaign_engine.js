const fs = require("fs");
const path = require("path");

const CATALOG_FILE = path.join(__dirname, "meesho_products.json");
const WA_NUMBER = String(process.env.XEVENZO_WHATSAPP_NUMBER || "918078426656").replace(/\D/g, "");

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

function assignProductNumbers() {
  const items = readCatalog();
  let maxNum = 0;
  items.forEach((p) => {
    const n = Number(p.productNumber);
    if (Number.isInteger(n) && n > maxNum) maxNum = n;
  });

  let changed = false;
  items.forEach((p) => {
    if (!p.productNumber) {
      maxNum += 1;
      p.productNumber = maxNum;
      changed = true;
    }
  });

  if (changed) writeCatalog(items);
  return items;
}

function buildMalayalamVideoScript(prod) {
  const num = prod.productNumber || 1;
  const title = prod.title || prod.fullName || "Xevenzo Product";
  const finalPrice = prod.finalPrice || ((Number(prod.basePrice) || 0) + 100);
  const details = prod.details || "മികച്ച ക്വാളിറ്റിയിലും ബജറ്റ് വിലയിലും ലഭ്യമായ പ്രോഡക്റ്റ്.";

  return {
    productNumber: num,
    hookMalayalam: `ഇന്നത്തെ സ്പെഷ്യൽ പ്രോഡക്റ്റ് പരിചയപ്പെടാം — ${title}!`,
    bodyMalayalam: `${details} ഇതിന്റെ വില വെറും ₹${finalPrice} രൂപ മാത്രമാണ്.`,
    ctaMalayalam: `കൂടുതൽ വിവരങ്ങൾക്കും ഓർഡർ ചെയ്യാനും താഴെ LINK എന്ന് കമന്റ് ചെയ്യൂ. നമ്മുടെ പേജ് Follow ചെയ്യാനും മറക്കരുത്!`,
    fullNarration: `ഇന്നത്തെ സ്പെഷ്യൽ പ്രോഡക്റ്റ് പരിചയപ്പെടാം — ${title}. ${details} വില വെറും ₹${finalPrice} രൂപ മാത്രമാണ്. കൂടുതൽ വിവരങ്ങൾക്കും ലിങ്കിനും താഴെ LINK എന്ന് കമന്റ് ചെയ്യൂ, കൂടാതെ നമ്മുടെ Xevenzo പേജ് Follow ചെയ്യാനും മറക്കരുത്!`
  };
}

function buildCommentDmReply(prod) {
  const num = prod.productNumber || 1;
  const waLink = `https://wa.me/${WA_NUMBER}`;

  return [
    `📲 നമ്മുടെ WhatsApp ലിങ്ക് ഇതാ:`,
    `${waLink}`,
    ``,
    `🔢 ഈ പ്രോഡക്റ്റിന്റെ നമ്പർ: *${num}*`,
    ``,
    `ഈ ചാറ്റിൽ *${num}* എന്ന് അടിച്ചു കൊടുക്കുക — ഉടൻ തന്നെ പ്രോഡക്റ്റ് വിവരങ്ങൾ ലഭിക്കും!`
  ].join("\n");
}

function findProductByNumberOrCode(inputText) {
  const clean = String(inputText || "").trim().replace(/^#/, "");
  const num = parseInt(clean, 10);
  const items = assignProductNumbers();

  if (Number.isInteger(num) && String(num) === clean) {
    return items.find((p) => Number(p.productNumber) === num) || null;
  }
  return items.find((p) => String(p.productNumber) === clean || String(p.id).toLowerCase() === clean.toLowerCase()) || null;
}

function formatWhatsAppProductReply(prod) {
  const num = prod.productNumber;
  const title = prod.title || prod.fullName || "Xevenzo Product";
  const finalPrice = prod.finalPrice || ((Number(prod.basePrice) || 0) + 100);
  const details = prod.details ? `\n📝 *വിവരങ്ങൾ:* ${prod.details}` : "";

  return [
    `🛍️ *XEVENZO — പ്രോഡക്റ്റ് #${num}*`,
    `📦 *പ്രോഡക്റ്റ്:* ${title}`,
    `💰 *വില:* *₹${finalPrice}*${details}`,
    ``,
    `ഓർഡർ ചെയ്യാൻ നിങ്ങളുടെ *പേര്, പൂർണ്ണ അഡ്രസ്സ്, പിൻകോഡ്, ഫോൺ നമ്പർ* എന്നിവ ഇവിടെ അയക്കുക.`
  ].join("\n");
}

module.exports = {
  assignProductNumbers,
  buildMalayalamVideoScript,
  buildCommentDmReply,
  findProductByNumberOrCode,
  formatWhatsAppProductReply
};
