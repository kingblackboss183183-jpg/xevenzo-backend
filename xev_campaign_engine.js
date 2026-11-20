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

function assignProductNumbers() {
  const items = readCatalog();
  items.forEach((item, index) => {
    if (!item.productNumber) {
      item.productNumber = String(index + 1).padStart(2, "0");
    }
  });
  return items;
}

function buildMalayalamVideoScript(prod) {
  const num = prod.productNumber || "01";
  const title = prod.title || prod.fullName || "ഈ അടിപൊളി പ്രോഡക്റ്റ്";
  const price = prod.finalPrice || ((Number(prod.basePrice) || 0) + 100);

  return {
    productNumber: num,
    whatsappLink: WHATSAPP_LINK,
    hookMalayalam: `വെറും ${price} രൂപയ്ക്ക് കിടിലൻ ഓഫർ!`,
    bodyMalayalam: `${title} ഇപ്പോൾ Xevenzo-ൽ ഏറ്റവും കുറഞ്ഞ വിലയിൽ ലഭ്യമാണ്.`,
    ctaMalayalam: `ഇത് വാങ്ങാൻ ബയോയിലുള്ള വാട്സാപ്പ് ലിങ്കിൽ കയറി പ്രോഡക്റ്റ് നമ്പർ ${num} എന്ന് മെസ്സേജ് അയക്കൂ.`,
    fullVoiceText: `വെറും ${price} രൂപയ്ക്ക് കിടിലൻ ഓഫർ! ${title} ഇപ്പോൾ Xevenzo-ൽ ലഭ്യമാണ്. ഇത് ഓർഡർ ചെയ്യാൻ ബയോയിലുള്ള വാട്സാപ്പ് ലിങ്കിൽ കയറി റീൽ നമ്പർ ${num} എന്ന് ഷെയർ ചെയ്യൂ.`
  };
}

module.exports = { assignProductNumbers, buildMalayalamVideoScript, WHATSAPP_LINK };
