const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ADMIN_PHONE = "918078426656";
const mediaDir = path.join(__dirname, "media_in");
const catalogPath = path.join(__dirname, "meesho_products.json");
const sessions = new Map();

function isAdminContact(jid, msg) {
  if (msg?.key?.fromMe) return true;
  const digits = String(jid || "").replace(/\D/g, "");
  return digits.startsWith(ADMIN_PHONE) || digits.includes("8078426656");
}

function loadCatalog() {
  if (!fs.existsSync(catalogPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveCatalog(list) {
  fs.writeFileSync(catalogPath, JSON.stringify(list, null, 2), "utf8");
}

function runMediaBuilders() {
  const results = [];
  if (fs.existsSync("pro_malayalam_reel.js")) {
    execSync("node pro_malayalam_reel.js", { stdio: "inherit" });
    results.push("xevenzo_pro_reel.mp4");
  }
  if (fs.existsSync("make_ig_story.js")) {
    execSync("node make_ig_story.js", { stdio: "inherit" });
    results.push("xevenzo_story.mp4");
  }
  return results;
}

function getAdminMenuText() {
  return [
    "🛡️ *Xevenzo അഡ്മിൻ കൺട്രോൾ മെനു*",
    "താഴെ പറയുന്ന നമ്പർ അയച്ച് തിരഞ്ഞെടുക്കുക:",
    "",
    "*1* — പുതിയ പ്രോഡക്റ്റ് ചേർക്കുക (പേര് → മീശോ വില + ₹100 → ലിങ്ക് → ഫോട്ടോകൾ & റീൽ/സ്റ്റോറി)",
    "*2* — കാറ്റലോഗ് & വില സ്റ്റാറ്റസ് കാണുക",
    "*3* — നിലവിലെ ഫോട്ടോകൾ വെച്ച് റീൽ & സ്റ്റോറി ബിൽഡ് ചെയ്യുക",
    "*4* — നിലവിലെ പ്രോസസ്സ് റദ്ദാക്കുക"
  ].join("\n");
}

async function handleGuidedAdminMessage(sock, msg, senderJid, textBody, hasImage) {
  if (!isAdminContact(senderJid, msg)) return false;

  fs.mkdirSync(mediaDir, { recursive: true });
  const trimmed = String(textBody || "").trim();
  let state = sessions.get(senderJid);

  if (/^(4|\/?cancel|റദ്ദാക്കുക)$/i.test(trimmed)) {
    sessions.delete(senderJid);
    await sock.sendMessage(senderJid, { text: "🛑 *അഡ്മിൻ പ്രോസസ്സ് റദ്ദാക്കി.*\nമെനു കാണാൻ *menu* അല്ലെങ്കിൽ *1* എന്ന് അയക്കുക." });
    return true;
  }

  if (/^(2|\/?status|സ്റ്റാറ്റസ്)$/i.test(trimmed)) {
    const cat = loadCatalog();
    const last = cat[cat.length - 1];
    const imgs = fs.readdirSync(mediaDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
    await sock.sendMessage(senderJid, {
      text: [
        "📊 *Xevenzo അഡ്മിൻ റിപ്പോർട്ട്*",
        `• ആകെ പ്രോഡക്റ്റുകൾ: *${cat.length}*`,
        `• അവസാന പ്രോഡക്റ്റ്: *${last ? last.title : "ഇല്ല"}*`,
        `• വില കണക്ക്: *${last ? `₹${last.basePrice} + ₹100 = ₹${last.finalPrice}` : "-"}*`,
        `• media_in ഫോട്ടോകൾ: *${imgs.length}*`
      ].join("\n")
    });
    return true;
  }

  if (/^(3|builds*media|വീഡിയോ)$/i.test(trimmed)) {
    const imgs = fs.readdirSync(mediaDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
    if (imgs.length === 0) {
      await sock.sendMessage(senderJid, { text: "⚠️ വീഡിയോ നിർമ്മിക്കാൻ *media_in*-ൽ ഫോട്ടോകൾ ഇല്ല. *1* അയച്ച് പുതിയ പ്രോഡക്റ്റ് തുടങ്ങുക." });
      return true;
    }
    await sock.sendMessage(senderJid, { text: "⏳ റീലും സ്റ്റോറിയും നിർമ്മിക്കുന്നു..." });
    const built = runMediaBuilders();
    await sock.sendMessage(senderJid, { text: `✅ വീഡിയോകൾ തയ്യാറായി: *${built.join(", ")}*` });
    return true;
  }

  const startsNew = /^(1|\/?new|new\s*product)$/i.test(trimmed);

  if (!state && !startsNew && !hasImage) {
    await sock.sendMessage(senderJid, { text: getAdminMenuText() });
    return true;
  }

  if (startsNew || (!state && hasImage)) {
    const oldImgs = fs.readdirSync(mediaDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
    oldImgs.forEach((f) => {
      try { fs.unlinkSync(path.join(mediaDir, f)); } catch {}
    });

    state = {
      step: "STEP_1_NAME",
      title: "",
      basePrice: null,
      margin: 100,
      finalPrice: null,
      meeshoLink: "",
      photoCount: 0
    };
    sessions.set(senderJid, state);

    if (hasImage && sock.downloadMediaMessage) {
      const buf = await sock.downloadMediaMessage(msg, "buffer", {}, { logger: console, reuploadRequest: sock.updateMediaMessage });
      if (buf && buf.length > 0) {
        fs.writeFileSync(path.join(mediaDir, `img_${Date.now()}_1.jpg`), buf);
        state.photoCount = 1;
      }
    }

    await sock.sendMessage(senderJid, {
      text: [
        "🆕 *പുതിയ പ്രോഡക്റ്റ് ചേർക്കാം*",
        state.photoCount > 0 ? `📸 ആദ്യ ഫോട്ടോ സേവ് ചെയ്തു (*${state.photoCount}*).` : "",
        "",
        "*1️⃣ പ്രോഡക്റ്റ് പേര്* എന്താണെന്ന് അയക്കുക:"
      ].filter(Boolean).join("\n")
    });
    return true;
  }

  if (state.step === "STEP_1_NAME") {
    if (!trimmed || trimmed.length < 2) {
      await sock.sendMessage(senderJid, { text: "⚠️ കൃത്യമായ *പ്രോഡക്റ്റ് പേര്* അയക്കുക:" });
      return true;
    }
    state.title = trimmed.slice(0, 100);
    state.step = "STEP_2_PRICE";
    await sock.sendMessage(senderJid, {
      text: [
        `✅ പേര്: *${state.title}*`,
        "",
        "*2️⃣ മീശോ അടിസ്ഥാന വില (Base Price)* എത്രയാണെന്ന് അയക്കുക:",
        "(ഓരോ പ്രോഡക്റ്റിനും *₹100* കമ്മീഷൻ താനേ കൂട്ടും)"
      ].join("\n")
    });
    return true;
  }

  if (state.step === "STEP_2_PRICE") {
    const numMatch = trimmed.match(/(\d{2,5})/);
    if (!numMatch) {
      await sock.sendMessage(senderJid, { text: "⚠️ സംഖ്യയായി *മീശോ വില* അയക്കുക (ഉദാ: *299*):" });
      return true;
    }
    state.basePrice = Number(numMatch[1]);
    state.margin = 100;
    state.finalPrice = state.basePrice + 100;
    state.step = "STEP_3_LINK";
    await sock.sendMessage(senderJid, {
      text: [
        "💰 *വില ലോക്ക് ചെയ്തു (അഡ്മിൻ വിവരം)*",
        `• മീശോ വില: *₹${state.basePrice}*`,
        `• കമ്മീഷൻ: *₹100*`,
        `• ഫൈനൽ വില: *₹${state.finalPrice}*`,
        "",
        "*3️⃣ മീശോ ലിങ്ക്* അയക്കുക:"
      ].join("\n")
    });
    return true;
  }

  if (state.step === "STEP_3_LINK") {
    const linkMatch = trimmed.match(/https?:\/\/[^\s]+/i);
    if (!linkMatch) {
      await sock.sendMessage(senderJid, { text: "⚠️ കൃത്യമായ *മീശോ ലിങ്ക്* (`https://...`) അയക്കുക:" });
      return true;
    }
    state.meeshoLink = linkMatch[0].trim();
    state.step = "STEP_4_PHOTOS";
    await sock.sendMessage(senderJid, {
      text: [
        "✅ ലിങ്ക് സേവ് ചെയ്തു.",
        "",
        `*4️⃣ പ്രോഡക്റ്റ് ഫോട്ടോകൾ* അയക്കുക (നിലവിൽ *${state.photoCount}* ഫോട്ടോ).`,
        "എല്ലാം അയച്ച ശേഷം *done* എന്ന് അയക്കുക:"
      ].join("\n")
    });
    return true;
  }

  if (state.step === "STEP_4_PHOTOS") {
    if (hasImage && sock.downloadMediaMessage) {
      const buf = await sock.downloadMediaMessage(msg, "buffer", {}, { logger: console, reuploadRequest: sock.updateMediaMessage });
      if (buf && buf.length > 0) {
        state.photoCount += 1;
        fs.writeFileSync(path.join(mediaDir, `img_${Date.now()}_${state.photoCount}.jpg`), buf);
        await sock.sendMessage(senderJid, {
          text: `🖼️ ഫോട്ടോ *${state.photoCount}* സേവ് ചെയ്തു. കൂടുതൽ ഫോട്ടോയുണ്ടോ? ഇല്ലെങ്കിൽ *done* എന്ന് അയക്കുക.`
        });
      }
      return true;
    }

    if (/^(done|build|ok|ശരി)$/i.test(trimmed)) {
      if (state.photoCount === 0) {
        await sock.sendMessage(senderJid, { text: "⚠️ കുറഞ്ഞത് *ഒരു ഫോട്ടോയെങ്കിലും* അയച്ച ശേഷം *done* എന്ന് അയക്കുക." });
        return true;
      }

      const idMatch = state.meeshoLink.match(/\/p\/([a-zA-Z0-9_-]+)/);
      const prodId = idMatch ? idMatch[1] : `prod_${Date.now()}`;
      const list = loadCatalog().filter((x) => x.id !== prodId);
      list.push({
        id: prodId,
        title: state.title,
        fullName: state.title,
        meeshoLink: state.meeshoLink,
        basePrice: state.basePrice,
        margin: 100,
        finalPrice: state.finalPrice,
        inStock: true,
        updatedAt: new Date().toISOString()
      });
      saveCatalog(list);

      await sock.sendMessage(senderJid, {
        text: `⏳ കാറ്റലോഗ് അപ്ഡേറ്റ് ചെയ്തു (*₹${state.finalPrice}*). റീലും സ്റ്റോറിയും തയ്യാറാക്കുന്നു...`
      });

      const built = runMediaBuilders();
      sessions.delete(senderJid);
      await sock.sendMessage(senderJid, {
        text: [
          "✅ *പ്രോഡക്റ്റ് & മീഡിയ പൂർത്തിയായി (അഡ്മിൻ റിപ്പോർട്ട്)*",
          `• പ്രോഡക്റ്റ്: *${state.title}*`,
          `• മീശോ വില: ₹${state.basePrice} | കമ്മീഷൻ: ₹100 | ഫൈനൽ വില: *₹${state.finalPrice}*`,
          `• ഫോട്ടോകൾ: *${state.photoCount}*`,
          `• വീഡിയോകൾ: *${built.join(", ") || "reel_latest.mp4"}*`,
          `• മീശോ ലിങ്ക്: ${state.meeshoLink}`
        ].join("\n")
      });
      return true;
    }

    await sock.sendMessage(senderJid, {
      text: `📸 ഫോട്ടോ അയക്കുക (നിലവിൽ *${state.photoCount}* ഫോട്ടോ) അല്ലെങ്കിൽ *done* എന്ന് അയക്കുക.`
    });
    return true;
  }

  return false;
}

module.exports = { handleGuidedAdminMessage, isAdminContact };
