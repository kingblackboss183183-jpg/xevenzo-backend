const fs = require("fs");
const path = require("path");

const ADMIN_PERSONAL_JID = "918078426656@s.whatsapp.net";

function getWatchProduct() {
  const p = path.join(__dirname, "meesho_products.json");
  if (!fs.existsSync(p)) return null;
  const arr = JSON.parse(fs.readFileSync(p, "utf8"));
  return (Array.isArray(arr) ? arr : []).find((x) => x.id === "i93xmy") || null;
}

function buildCustomerReply(item) {
  return [
    `*${item.title}*`,
    `• *വില:* ₹${item.finalPrice}`,
    `• *സവിശേഷതകൾ:* സ്റ്റെയിൻലെസ് സ്റ്റീൽ ബ്ലാക്ക് സ്ട്രാപ്പ്, ക്വാർട്സ്, വാട്ടർ റെസിസ്റ്റന്റ്, 1 മാസം വാറന്റി, ഫ്രീ സൈസ്`,
    `• *ഡെലിവറി:* സാധാരണ 3-5 ദിവസം`,
    ``,
    `ഓർഡർ ചെയ്യാൻ താൽപ്പര്യമുണ്ടെങ്കിൽ നിങ്ങളുടെ *പൂർണ്ണ പേര്*, *ഡെലിവറി അഡ്രസ്സ് (പിൻകോഡ് സഹിതം)*, *ഫോൺ നമ്പർ*, *ക്വാണ്ടിറ്റി* എന്നിവ അയക്കുക.`
  ].join("\n");
}

function buildAdminLinkAlert(item, customerJid, customerDetailsText = "") {
  return [
    `🔔 *NEW WATCH ORDER / PHOTO INQUIRY*`,
    `• *Customer:* ${customerJid}`,
    `• *Final Price (Customer):* ₹${item.finalPrice}`,
    `• *Meesho Base Price:* ₹${item.basePrice}`,
    `• *Your Commission/Margin:* ₹${item.margin}`,
    `• *Meesho Link:* ${item.meeshoLink}`,
    customerDetailsText ? `• *Customer Info:* ${customerDetailsText}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

async function handleWatchInquiry(sock, customerJid, customerDetailsText = "") {
  const item = getWatchProduct();
  if (!item) return false;
  await sock.sendMessage(customerJid, { text: buildCustomerReply(item) });
  await sock.sendMessage(ADMIN_PERSONAL_JID, { text: buildAdminLinkAlert(item, customerJid, customerDetailsText) });
  return true;
}

module.exports = { getWatchProduct, buildCustomerReply, buildAdminLinkAlert, handleWatchInquiry };
