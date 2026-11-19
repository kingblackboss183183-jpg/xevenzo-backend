const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ADMIN_PHONE = "918078426656";
const mediaDir = path.join(__dirname, "media_in");
const catalogPath = path.join(__dirname, "meesho_products.json");

function isAdminJid(jid) {
  const digits = String(jid || "").replace(/\D/g, "");
  return digits.startsWith(ADMIN_PHONE);
}

function parsePriceAndMargin(text) {
  const baseMatch = text.match(/(?:base|meesho|cost|വില)[:\s]*₹?\s*(\d{2,5})/i);
  const marginMatch = text.match(/(?:margin|comm|commission|മാർജിൻ|കമ്മീഷൻ)[:\s]*₹?\s*(\d{1,5})/i);
  const basePrice = baseMatch ? Number(baseMatch[1]) : 399;
  const margin = 100;
  return { basePrice, margin, finalPrice: basePrice + margin };
}

function extractMeeshoLink(text) {
  const m = text.match(/https?:\/\/(?:www\.)?meesho\.com\/[^\s]+/i);
  return m ? m[0].trim() : "";
}

function extractTitle(text) {
  const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const nameLine = lines.find(l => /^name\s*:/i.test(l));
  if (nameLine) return nameLine.replace(/^name\s*:\s*/i, "").slice(0, 90);
  const nonLink = lines.find(l => !/^https?:\/\//i.test(l) && !/check out this product/i.test(l));
  return (nonLink || "Xevenzo Meesho Product").slice(0, 90);
}

async function handleAdminProductIngest(sock, msg, senderJid, textBody, hasImage) {
  if (!isAdminJid(senderJid)) return false;

  fs.mkdirSync(mediaDir, { recursive: true });
  const link = extractMeeshoLink(textBody);
  const isNewBatch = /^new\s*product/i.test(textBody) || Boolean(link);

  if (isNewBatch && hasImage) {
    const existing = fs.readdirSync(mediaDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    existing.forEach(f => { try { fs.unlinkSync(path.join(mediaDir, f)); } catch {} });
  }

  let savedFileName = "";
  if (hasImage && sock.downloadMediaMessage) {
    try {
      const buffer = await sock.downloadMediaMessage(msg, "buffer", {}, { logger: console, reuploadRequest: sock.updateMediaMessage });
      if (buffer && buffer.length > 0) {
        savedFileName = `prod_${Date.now()}.jpg`;
        fs.writeFileSync(path.join(mediaDir, savedFileName), buffer);
      }
    } catch (err) {
      console.log("ADMIN_MEDIA_SAVE_ERR:", err?.message || err);
    }
  }

  if (link || /base|margin|വില|മാർജിൻ|name\s*:/i.test(textBody)) {
    const title = extractTitle(textBody);
    const { basePrice, margin, finalPrice } = parsePriceAndMargin(textBody);
    const idMatch = link.match(/\/p\/([a-zA-Z0-9_-]+)/);
    const prodId = idMatch ? idMatch[1] : `item_${Date.now()}`;

    let list = [];
    if (fs.existsSync(catalogPath)) {
      try { list = JSON.parse(fs.readFileSync(catalogPath, "utf8")); } catch { list = []; }
    }
    if (!Array.isArray(list)) list = [];

    const entry = {
      id: prodId,
      title,
      fullName: title,
      meeshoLink: link || (list[list.length - 1]?.meeshoLink || ""),
      basePrice,
      margin,
      finalPrice,
      inStock: true,
      rawDetails: textBody.slice(0, 1500),
      updatedAt: new Date().toISOString()
    };

    const next = list.filter(x => x.id !== prodId);
    next.push(entry);
    fs.writeFileSync(catalogPath, JSON.stringify(next, null, 2), "utf8");

    await sock.sendMessage(senderJid, {
      text: `✅ *Catalog Updated*\n• *Product:* ${title}\n• *Base:* ₹${basePrice} | *Margin:* ₹${margin} | *Final:* ₹${finalPrice}\n• *Link Saved:* ${entry.meeshoLink ? "Yes" : "Pending"}`
    });
    const imgsIn = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)) : [];
    if (imgsIn.length > 0) {
      try {
        execSync("node pro_malayalam_reel.js", { stdio: "inherit" });
        if (fs.existsSync("make_ig_story.js")) execSync("node make_ig_story.js", { stdio: "inherit" });
        await sock.sendMessage(senderJid, { text: "🎬 *AUTO_REEL_AND_STORY Built!* (`xevenzo_pro_reel.mp4` & `xevenzo_story.mp4`)" });
      } catch (e) {
        await sock.sendMessage(senderJid, { text: `⚠️ Auto media build note: ${e?.message || e}` });
      }
    }
  } else if (savedFileName) {
    await sock.sendMessage(senderJid, {
      text: `🖼️ *Photo Saved to media_in:* \`${savedFileName}\`\nറീൽ നിർമ്മിക്കാൻ *make reel* എന്ന് അയക്കുക.`
    });
  }

  if (/^make\s*reel$/i.test(textBody.trim())) {
    try {
      execSync("node pro_malayalam_reel.js", { stdio: "inherit" });
      if (fs.existsSync("make_ig_story.js")) {
        execSync("node make_ig_story.js", { stdio: "inherit" });
      }
      await sock.sendMessage(senderJid, { text: "🎬 *Malayalam Pro Reel Created!* (`reels_out/xevenzo_pro_reel.mp4`)" });
    } catch (e) {
      await sock.sendMessage(senderJid, { text: `❌ Reel build error: ${e?.message || e}` });
    }
  }

  return true;
}

module.exports = { handleAdminProductIngest, isAdminJid };
