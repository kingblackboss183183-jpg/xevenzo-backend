const { startAddressFlow, handleAddressStep } = require("./meesho_address_collector");

const ADDRESS_COLUMN_TEMPLATE = [
  "📋 *ഓർഡർ അഡ്രസ്സ് ഫോം (കൃത്യമായി പൂരിപ്പിച്ച് അയക്കുക):*",
  "",
  "പേര്: ",
  "ഫോൺ: ",
  "പിൻകോഡ്: ",
  "വീട് / ഏരിയ / ലാൻഡ്മാർക്ക്: ",
  "സിറ്റി / ജില്ല: ",
  "ക്വാണ്ടിറ്റി: 1"
].join("\n");

function getReelAddressPrompt(productTitle = "Men’s Premium Luxury Sports Watch (3D Car Wheel Dial)") {
  return [
    `🎬 *${productTitle}*`,
    `നിങ്ങൾ അയച്ച റീൽ / വീഡിയോ ഞങ്ങൾക്ക് ലഭിച്ചു.`,
    ``,
    ADDRESS_COLUMN_TEMPLATE,
    ``,
    `മുകളിലെ ഓരോ വരിയിലും കൃത്യമായ വിവരങ്ങൾ ചേർത്ത് ഈ മെസ്സേജ് കോപ്പി ചെയ്ത് അയക്കുക.`
  ].join("\n");
}

function parseAndVerifyForm(rawText) {
  const text = String(rawText || "");
  const nameMatch = text.match(/(?:പേര്|name)\s*[:\-]\s*([^\n]+)/i);
  const phoneMatch = text.match(/(?:ഫോൺ|phone|mobile|നമ്പർ)\s*[:\-]\s*([^\n]+)/i);
  const pinMatch = text.match(/(?:പിൻകോഡ്|pin\s*code|pincode|pin)\s*[:\-]\s*([^\n]+)/i);
  const houseMatch = text.match(/(?:വീട്\s*\/?\s*ഏരിയ\s*\/?\s*ലാൻഡ്മാർക്ക്|വീട്|അഡ്രസ്സ്|അഡ്രസ്|address)\s*[:\-]\s*([^\n]+)/i);
  const cityMatch = text.match(/(?:സിറ്റി\s*\/?\s*ജില്ല|സിറ്റി|ജില്ല|city|district)\s*[:\-]\s*([^\n]+)/i);
  const qtyMatch = text.match(/(?:ക്വാണ്ടിറ്റി|qty|quantity|എണ്ണം)\s*[:\-]\s*([^\n]+)/i);

  const hasAnyLabel = Boolean(nameMatch || phoneMatch || pinMatch || houseMatch || cityMatch || qtyMatch);
  if (!hasAnyLabel) return { isFormSubmission: false };

  const name = nameMatch ? nameMatch[1].trim() : "";
  const phoneDigits = (phoneMatch ? phoneMatch[1].trim() : "").replace(/\D/g, "");
  const pincodeDigits = (pinMatch ? pinMatch[1].trim() : "").replace(/\D/g, "");
  const houseAndArea = houseMatch ? houseMatch[1].trim() : "";
  const cityDistrict = cityMatch ? cityMatch[1].trim() : houseAndArea;
  const qtyNum = parseInt((qtyMatch ? qtyMatch[1].trim() : "1").replace(/\D/g, ""), 10) || 1;

  const errors = [];
  if (!name || name.length < 2) errors.push("• *പേര്* കൃത്യമായി നൽകുക.");
  if (phoneDigits.length < 10) errors.push("• *ഫോൺ നമ്പർ* കുറഞ്ഞത് 10 അക്കമായി നൽകുക.");
  if (!/^\d{6}$/.test(pincodeDigits)) errors.push("• *പിൻകോഡ്* കൃത്യമായി 6 അക്കമായി നൽകുക.");
  if (!houseAndArea || houseAndArea.length < 4) errors.push("• *വീട് / ഏരിയ / ലാൻഡ്മാർക്ക്* കൃത്യമായി നൽകുക.");
  if (!cityDistrict || cityDistrict.length < 2) errors.push("• *സിറ്റി / ജില്ല* കൃത്യമായി നൽകുക.");
  if (qtyNum < 1) errors.push("• *ക്വാണ്ടിറ്റി* 1 അല്ലെങ്കിൽ അതിൽ കൂടുതലായി നൽകുക.");

  return {
    isFormSubmission: true,
    valid: errors.length === 0,
    errors,
    values: {
      name,
      phone: phoneDigits.slice(-10),
      pincode: pincodeDigits,
      houseAndArea,
      cityDistrict,
      qty: String(qtyNum)
    }
  };
}

async function handleReelOrFormMessage(sock, senderJid, textBody, hasVideo, productObj) {
  const parsed = parseAndVerifyForm(textBody);

  if (parsed.isFormSubmission) {
    if (!parsed.valid) {
      await sock.sendMessage(senderJid, {
        text: [
          "❌ *അഡ്രസ്സ് ഫോമിൽ തിരുത്തേണ്ട കാര്യങ്ങൾ:*",
          ...parsed.errors,
          "",
          ADDRESS_COLUMN_TEMPLATE
        ].join("\n")
      });
      return true;
    }

    startAddressFlow(senderJid, productObj);
    const orderedFields = [
      parsed.values.name,
      parsed.values.phone,
      parsed.values.pincode,
      parsed.values.houseAndArea,
      parsed.values.cityDistrict,
      parsed.values.qty
    ];

    for (const val of orderedFields) {
      await handleAddressStep(sock, senderJid, val, false);
    }
    return true;
  }

  if (hasVideo || /\b(reel|reels|റീൽ)\b/i.test(String(textBody || ""))) {
    await sock.sendMessage(senderJid, { text: getReelAddressPrompt(productObj?.title) });
    return true;
  }

  return false;
}

module.exports = {
  ADDRESS_COLUMN_TEMPLATE,
  getReelAddressPrompt,
  parseAndVerifyForm,
  handleReelOrFormMessage
};
