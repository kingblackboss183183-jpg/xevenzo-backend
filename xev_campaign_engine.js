const fs = require("fs");
const path = require("path");

const CATALOG_FILE = path.join(__dirname, "meesho_products.json");
const WHATSAPP_LINK = process.env.WHATSAPP_LINK || "https://wa.me/918078426656";

function readCatalog() {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// Margin slabs: Meesho base price -> margin. Final price always ends with 9.
function calcPricing(basePrice) {
  const base = Number(basePrice) || 0;
  let margin = 100;
  if (base >= 700) margin = 150;
  else if (base >= 400) margin = 130;
  let finalPrice = base + margin;
  while (finalPrice % 10 !== 9) finalPrice += 1;
  return { margin: finalPrice - base, finalPrice };
}

function nextProductNumber(items) {
  let max = 0;
  for (const it of items || []) {
    const n = parseInt(it.productNumber, 10);
    if (n > max) max = n;
  }
  return String(max + 1).padStart(2, "0");
}

function assignProductNumbers() {
  const items = readCatalog();
  // Admin adds the newest product at the top, so number from the oldest (bottom) up.
  for (let i = items.length - 1; i >= 0; i--) {
    if (!items[i].productNumber) items[i].productNumber = nextProductNumber(items);
  }
  return items;
}

function buildMalayalamVideoScript(prod) {
  const num = prod.productNumber || "01";
  const spoken = String(parseInt(num, 10) || 1);
  const title = String(prod.title || prod.fullName || "ഈ പ്രോഡക്റ്റ്").trim();
  const price = prod.finalPrice || calcPricing(prod.basePrice).finalPrice;
  let details = String(prod.details || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (details && !/[.!?।]$/.test(details)) details += ".";

  const hook = `ഒന്ന് നോക്കൂ! ${title}. വെറും ${price} രൂപയ്ക്ക്!`;
  const body = details ? `ഇതിന്റെ പ്രത്യേകതകൾ കേൾക്കൂ. ${details}` : "";
  const priceLine = `ഇതിന്റെ വില ${price} രൂപ മാത്രം. ക്യാഷ് ഓൺ ഡെലിവറിയും യുപിഐ പേയ്മെന്റും ലഭ്യമാണ്.`;
  const cta = `ഓർഡർ ചെയ്യാൻ ബയോയിലുള്ള വാട്സാപ്പ് ലിങ്കിൽ കയറി, ${spoken} എന്ന് മെസ്സേജ് അയക്കൂ. റീൽ നമ്പർ ${spoken}.`;
  const narration = [hook, body, priceLine, cta].filter(Boolean).join(" ");

  return {
    productNumber: num,
    whatsappLink: WHATSAPP_LINK,
    hookMalayalam: hook,
    bodyMalayalam: details || `${title} ഇപ്പോൾ Xevenzo-ൽ ലഭ്യമാണ്.`,
    ctaMalayalam: cta,
    fullNarration: narration,
    fullVoiceText: narration
  };
}

module.exports = { assignProductNumbers, buildMalayalamVideoScript, calcPricing, nextProductNumber, WHATSAPP_LINK };
