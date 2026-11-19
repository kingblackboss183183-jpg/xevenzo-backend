const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const ADMIN_PERSONAL_JID = "918078426656@s.whatsapp.net";
const UPI_ID = "8078426656@naviaxis";
const PAYEE_NAME = "MOHAMMED RAFI K";

const STEPS = [
  { key: "name", ask: "നിങ്ങളുടെ *പൂർണ്ണ പേര്* (Full Name) എന്താണ്?" },
  { key: "phone", ask: "ഡെലിവറിക്ക് വിളിക്കാൻ പറ്റുന്ന *ഫോൺ നമ്പർ* (10 അക്കം) അയക്കുക:" },
  { key: "pincode", ask: "നിങ്ങളുടെ *പിൻകോഡ്* (6 അക്ക Pin Code) അയക്കുക:" },
  { key: "houseAndArea", ask: "നിങ്ങളുടെ *വീടിന്റെ പേര് / നമ്പർ, ഏരിയ / ലാൻഡ്മാർക്ക്* എന്നിവ കൃത്യമായി അയക്കുക:" },
  { key: "cityDistrict", ask: "നിങ്ങളുടെ *സിറ്റി / ടൗൺ / ജില്ല* ഏതാണെന്ന് പറയുക:" },
  { key: "qty", ask: "എത്ര *ക്വാണ്ടിറ്റി* (എണ്ണം) വേണമെന്ന് പറയുക (ഉദാഹരണം: 1):" }
];

const sessions = new Map();

function startAddressFlow(customerJid, productObj) {
  sessions.set(customerJid, {
    stage: "ADDRESS",
    stepIndex: 0,
    product: productObj,
    data: {}
  });
  return STEPS[0].ask;
}

function isInAddressFlow(customerJid) {
  return sessions.has(customerJid);
}

function computeTotalAmount(session) {
  const unitPrice = Number(session.product?.finalPrice || 399);
  const qtyNum = Math.max(1, parseInt(String(session.data.qty || "1").replace(/\D/g, ""), 10) || 1);
  return { unitPrice, qtyNum, totalAmount: unitPrice * qtyNum };
}

async function generateUpiQrBuffer(amount, noteText) {
  const upiUri = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(PAYEE_NAME)}&am=${encodeURIComponent(String(amount))}&cu=INR&tn=${encodeURIComponent(noteText)}`;
  return await QRCode.toBuffer(upiUri, {
    type: "png",
    width: 512,
    margin: 2
  });
}

function formatMeeshoOrderSummary(session, paymentStatus = "PAYMENT SCREENSHOT RECEIVED") {
  const { product, data } = session;
  const { qtyNum, totalAmount } = computeTotalAmount(session);
  const baseTotal = Number(product?.basePrice || 0) * qtyNum;
  const commissionTotal = Number(product?.margin ?? 100) * qtyNum;

  return [
    `📦 *MEESHO ORDER READY (FOR ADMIN)*`,
    `• *Status:* ${paymentStatus}`,
    `• *Product:* ${product ? product.title : "Watch (i93xmy)"}`,
    `• *Quantity:* ${qtyNum}`,
    `• *Customer Paid Amount:* ₹${totalAmount}`,
    `• *Meesho Base Total:* ₹${baseTotal}`,
    `• *Your Commission Total:* ₹${commissionTotal}`,
    `• *Meesho Link:* ${product ? product.meeshoLink : ""}`,
    `----------------------------`,
    `• *Full Name:* ${data.name || ""}`,
    `• *Phone:* ${data.phone || ""}`,
    `• *Pincode:* ${data.pincode || ""}`,
    `• *House / Area / Landmark:* ${data.houseAndArea || ""}`,
    `• *City / District:* ${data.cityDistrict || ""}`
  ].join("\n");
}

async function handleAddressStep(sock, customerJid, incomingText, hasMedia = false) {
  const session = sessions.get(customerJid);
  if (!session) return false;

  if (session.stage === "AWAITING_PAYMENT") {
    const { totalAmount } = computeTotalAmount(session);
    if (!hasMedia && String(incomingText || "").trim().length < 2) {
      await sock.sendMessage(customerJid, {
        text: `ദയവായി *₹${totalAmount}* പേയ്‌മെന്റ് ചെയ്ത ശേഷം പേയ്‌മെന്റ് സ്ക്രീൻഷോട്ട് / കൺഫർമേഷൻ അയക്കുക.`
      });
      return true;
    }

    sessions.delete(customerJid);

    await sock.sendMessage(customerJid, {
      text: `✅ *ഓർഡർ & ഡെലിവറി അഡ്രസ്സ് സക്സസ്ഫുൾ!*\nനിങ്ങളുടെ പേയ്‌മെന്റ് വിവരം (₹${totalAmount}) രേഖപ്പെടുത്തിയിട്ടുണ്ട്. *ട്രാക്കിംഗ് വിവരം പിന്നീട് ലഭിക്കും.*`
    });

    await sock.sendMessage(ADMIN_PERSONAL_JID, {
      text: formatMeeshoOrderSummary(session, hasMedia ? "PAYMENT IMAGE SENT" : `PAYMENT NOTE: ${String(incomingText || "").trim()}`)
    });

    return true;
  }

  const currentStep = STEPS[session.stepIndex];
  const cleaned = String(incomingText || "").trim();

  if (!cleaned) {
    await sock.sendMessage(customerJid, { text: `ദയവായി കൃത്യമായി മറുപടി നൽകുക.\n${currentStep.ask}` });
    return true;
  }

  if (currentStep.key === "pincode" && !/^\d{6}$/.test(cleaned)) {
    await sock.sendMessage(customerJid, { text: "❌ കൃത്യമായ *6 അക്ക പിൻകോഡ്* നൽകുക (ഉദാഹരണം: 679334)." });
    return true;
  }

  if (currentStep.key === "phone" && cleaned.replace(/\D/g, "").length < 10) {
    await sock.sendMessage(customerJid, { text: "❌ കൃത്യമായ *ഫോൺ നമ്പർ* നൽകുക." });
    return true;
  }

  session.data[currentStep.key] = cleaned;
  session.stepIndex += 1;

  if (session.stepIndex < STEPS.length) {
    await sock.sendMessage(customerJid, { text: STEPS[session.stepIndex].ask });
    return true;
  }

  // All address details collected -> generate fixed-amount QR & ask immediate payment
  session.stage = "AWAITING_PAYMENT";
  const { unitPrice, qtyNum, totalAmount } = computeTotalAmount(session);
  const qrBuffer = await generateUpiQrBuffer(totalAmount, `Xevenzo Order ${session.product?.id || "i93xmy"}`);

  await sock.sendMessage(customerJid, {
    image: qrBuffer,
    caption: [
      `💳 *പേയ്‌മെന്റ് വിവരങ്ങൾ*`,
      `• *പ്രോഡക്റ്റ്:* ${session.product?.title || "Watch"}`,
      `• *ക്വാണ്ടിറ്റി:* ${qtyNum} (₹${unitPrice} വീതം)`,
      `• *ആകെ അടയ്ക്കേണ്ട തുക:* *₹${totalAmount}*`,
      `• *UPI ID:* \`${UPI_ID}\` (${PAYEE_NAME})`,
      ``,
      `ഈ QR കോഡ് സ്കാൻ ചെയ്താൽ *₹${totalAmount}* തുക തന്നെയാണ് കാണിക്കുക. പേയ്‌മെന്റ് പൂർത്തിയാക്കി *സ്ക്രീൻഷോട്ട്* ഇപ്പോൾ തന്നെ അയക്കുക.`
    ].join("\n")
  });

  return true;
}

module.exports = { startAddressFlow, isInAddressFlow, handleAddressStep, formatMeeshoOrderSummary };
