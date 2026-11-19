const express = require("express");
const _xevApp = express();
_xevApp.use(express.json({ limit: "10mb" }));
_xevApp.use(require("./admin_routes"));
_xevApp.listen(process.env.ADMIN_PORT || 3099);
(() => {
  const fsMod = require("fs");
  const pathMod = require("path");
  const envFile = pathMod.join(__dirname, ".env");
  if (fsMod.existsSync(envFile)) {
    const lines = fsMod.readFileSync(envFile, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key && !process.env[key]) process.env[key] = val;
      }
    }
  }
})();
const fs = require('fs');
const path = require('path');
const http = require('http');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const PRODUCTS_PATH = path.join(__dirname, 'products.json');
const LEADS_PATH = path.join(__dirname, 'leads.json');
const CLICKS_PATH = path.join(__dirname, 'clicks.json');
const REELS_DIR = path.join(__dirname, 'reels_out');
const ADMIN_PHONE = '918078426656';
const { handleWatchInquiry, getWatchProduct } = require("./watch_order_helper");
const { startAddressFlow, isInAddressFlow, handleAddressStep } = require("./meesho_address_collector");
const { handleReelOrFormMessage } = require("./reel_address_form");
const { handleAdminProductIngest, isAdminJid } = require("./admin_ingest_handler");
const { handleGuidedAdminMessage } = require("./admin_guided_ingest");


const chatMemory = new Map();
const MAX_HISTORY = 8;

function readJsonSafe(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function writeJsonSafe(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeDigits(jidOrPhone) {
    const beforeAt = String(jidOrPhone || '').split('@')[0].split(':')[0];
    return beforeAt.replace(/\D/g, '');
}

function isVerifiedAdmin(senderJid) {
    const digits = normalizeDigits(senderJid);
    return digits === ADMIN_PHONE || digits.endsWith(ADMIN_PHONE);
}

function buildAdminReport() {
    const clicks = readJsonSafe(CLICKS_PATH, []);
    const leads = readJsonSafe(LEADS_PATH, []);

    const recentLeadsText = leads.length
        ? leads.slice(-5).map((l, idx) => `${idx + 1}. ${l.message} (${new Date(l.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })})`).join('\n')
        : "ഇതുവരെ ഓർഡർ/അഡ്രസ്സ് വിവരങ്ങളൊന്നും രേഖപ്പെടുത്തിയിട്ടില്ല.";

    const recentClicksText = clicks.length
        ? clicks.slice(-5).map((c, idx) => `${idx + 1}. ${c.name || c.id} (${new Date(c.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })})`).join('\n')
        : "ഇതുവരെ ലിങ്ക് ക്ലിക്കുകളൊന്നുമില്ല.";

    return `📊 *Xevenzo റിപ്പോർട്ട് (Verified Admin)*\n\n` +
           `🔗 ആകെ ലിങ്ക് ക്ലിക്കുകൾ: *${clicks.length}*\n` +
           `📦 ആകെ അഡ്രസ്സ്/ഓർഡർ എൻക്വയറികൾ: *${leads.length}*\n\n` +
           `🕒 *അവസാന 5 ക്ലിക്കുകൾ:*\n${recentClicksText}\n\n` +
           `📝 *അവസാന 5 അഡ്രസ്സ് / ഓർഡർ എൻട്രികൾ:*\n${recentLeadsText}`;
}

function getHistory(jid) {
    return chatMemory.get(jid) || [];
}

function pushHistory(jid, role, content) {
    const arr = getHistory(jid);
    arr.push({ role, content });
    if (arr.length > MAX_HISTORY) arr.splice(0, arr.length - MAX_HISTORY);
    chatMemory.set(jid, arr);
}

function maybeSaveLead(jid, text) {
    if (isVerifiedAdmin(jid)) return false;
    const hasPin = /\b\d{6}\b/.test(text);
    const hasAddressWord = /(address|pin|pincode|district|post|house|road|നഗരം|വിലാസം|പിൻ|ജില്ല|വീട്)/i.test(text);
    if (hasPin || (hasAddressWord && text.length > 18)) {
        const leads = readJsonSafe(LEADS_PATH, []);
        leads.push({
            time: new Date().toISOString(),
            from: normalizeDigits(jid),
            message: text.trim()
        });
        writeJsonSafe(LEADS_PATH, leads);
        return true;
    }
    return false;
}

function buildSystemPrompt() {
    const products = readJsonSafe(PRODUCTS_PATH, []);
    const catalogText = products.length
        ? products.map(p => `- [${p.id}] ${p.name} | Price: ${p.price} | Category: ${p.category} | Highlights: ${p.highlights} | Delivery: ${p.delivery} | Link: ${p.affiliate_link || "N/A"}`).join('\n')
        : "No products currently listed.";

    return `You are a warm, natural human-like customer support and affiliate/dropshipping assistant for 'Xevenzo'. Reply naturally in Malayalam (or English/Manglish if the customer prefers), keeping messages concise, clear, and helpful like a real person.

Rules:
1. Use ONLY the verified Xevenzo catalog below for product names, prices, features, delivery times, and affiliate links. Never invent prices or fake links.
2. When a customer asks about a product or wants to buy, share its price, key highlights, and affiliate link clearly.
3. If a customer wants to order/book or asks for delivery details, politely ask for their Name, full Address with Pincode, and preferred product/quantity.
4. If the customer provides address/pincode details, acknowledge politely and confirm their details are noted for follow-up.

XEVENZO VERIFIED CATALOG:
${catalogText}`;
}

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

async function askGroq(model, history, systemPrompt) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY missing");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                max_completion_tokens: 550,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...history
                ]
            }),
            signal: controller.signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`${model} HTTP ${res.status}: ${data.error?.message || "API error"}`);
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error(`${model} empty response`);
        return { text, engine: model };
    } finally {
        clearTimeout(timer);
    }
}

async function askGemini(modelName, history, systemPrompt) {
    if (!genAI) throw new Error("GEMINI_API_KEY missing");
    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt
    });
    const formatted = history.map(h => `${h.role === "user" ? "Customer" : "Assistant"}: ${h.content}`).join("\n");
    const result = await model.generateContent(formatted);
    const text = result.response?.text()?.trim();
    if (!text) throw new Error(`${modelName} empty response`);
    return { text, engine: modelName };
}

async function generateHybridReply(jid, incomingText) {
    maybeSaveLead(jid, incomingText);
    pushHistory(jid, "user", incomingText);
    const history = getHistory(jid);
    const systemPrompt = buildSystemPrompt();

    const chain = [
        () => askGroq("openai/gpt-oss-120b", history, systemPrompt),
        () => askGroq("openai/gpt-oss-20b", history, systemPrompt),
        () => askGemini("gemini-4-hydrogen", history, systemPrompt)
    ];

    let lastError = null;
    for (const step of chain) {
        try {
            const res = await step();
            pushHistory(jid, "assistant", res.text);
            return res;
        } catch (err) {
            lastError = err;
            console.log(`⚠️ Fallback triggered (${err.message})`);
        }
    }
    throw lastError || new Error("All AI engines failed");
}

function humanDelayMs(text) {
    const base = 900;
    const perChar = Math.min(text.length * 12, 1800);
    return base + perChar;
}

let isStartingSocket = false;
let pairingCodeRequested = false;
async function startBot() {
    if (isStartingSocket) return;
    isStartingSocket = true;
    pairingCodeRequested = false;
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const browserTuple = (typeof Browsers !== 'undefined' && Browsers.ubuntu) ? Browsers.ubuntu('Chrome') : ["Ubuntu", "Chrome", "20.0.04"];
    const sock = makeWASocket({
        version: (await (async () => { try { const b = await require("@whiskeysockets/baileys"); if (b.fetchLatestWaWebVersion) { const r = await b.fetchLatestWaWebVersion(); if (r && r.version) return r.version; } if (b.fetchLatestBaileysVersion) { const r = await b.fetchLatestBaileysVersion(); if (r && r.version) return r.version; } } catch {} return undefined; })()),
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: browserTuple
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'connecting' && !sock.authState.creds.registered && !pairingCodeRequested) {
            pairingCodeRequested = true;
            setTimeout(async () => {
                const phoneNumber = String(process.env.PAIRING_PHONE || process.env.BOT_PHONE || "916238985160").replace(/\D/g, '');
                try {
                    const codeVal = await sock.requestPairingCode(phoneNumber);
                    console.log("\n==================================");
                    console.log("നിങ്ങളുടെ പെയറിങ് കോഡ്:", codeVal, " (Number:", phoneNumber + ")");
                    console.log("==================================\n");
                } catch (error) {
                    pairingCodeRequested = false;
                    console.log("കോഡ് എടുക്കുന്നതിൽ പ്രശ്നം:", error?.message || error);
                }
            }, 2500);
        }
        if (connection === 'close') {
            isStartingSocket = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reasonMsg = lastDisconnect?.error?.output?.payload?.message || lastDisconnect?.error?.message || '';
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log("\nകണക്ഷൻ നഷ്ടപ്പെട്ടു!", statusCode || '', reasonMsg ? "(" + reasonMsg + ")" : '', shouldReconnect ? "- 4 സെക്കൻഡിനുള്ളിൽ വീണ്ടും ശ്രമിക്കുന്നു..." : "- Logged out");
            if (shouldReconnect) {
                setTimeout(startBot, 4000);
            }
        } else if (connection === 'open') {
            isStartingSocket = false;
            console.log("\n✅ വാട്സ്ആപ്പ് വിജയകരമായി കണക്ട് ആയി! Xevenzo AI ബോട്ട് ആക്ടീവ് ആണ്.");
        }
    });
sock.ev.on('messages.upsert', async m => {
        if (m.type === 'notify') {
            const msg = m.messages[0];
            if (!msg.key.fromMe && msg.message) {
                const senderNumber = msg.key.remoteJid;
                const incomingText = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            const textBody = String(incomingText || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || "").trim();

      
      
      const cleanDigits = String(senderNumber || "").replace(/\D/g, "");
      const isAdminMsg = isAdminJid(senderNumber) || cleanDigits.includes("8078426656") || Boolean(msg.key?.fromMe);
      if (isAdminMsg && !/^(linknow|testreel)$/i.test(textBody)) {
          const hasImgMsg = Boolean(msg.message?.imageMessage);
          const handledAdmin = await handleAdminProductIngest(sock, msg, senderNumber, textBody, hasImgMsg);
          if (handledAdmin) return;
      }

      
      const hasImgMsgNow = Boolean(msg.message?.imageMessage);
      const handledGuidedAdmin = await handleGuidedAdminMessage(sock, msg, senderNumber, textBody, hasImgMsgNow);
      if (handledGuidedAdmin) return;

      const hasVideoMsg = Boolean(msg.message?.videoMessage);
      const handledReelForm = await handleReelOrFormMessage(sock, senderNumber, textBody, hasVideoMsg, getWatchProduct());
      if (handledReelForm) return;

      
      const rawJid = String(senderNumber || "");
      const digitsOnly = rawJid.replace(/\D/g, "");
      const isAdminSender = Boolean(msg.key?.fromMe) || digitsOnly.startsWith("918078426656") || digitsOnly.includes("8078426656");
      const hasImg = Boolean(msg.message?.imageMessage);
      const hasVid = Boolean(msg.message?.videoMessage);

      if (isAdminSender) {
        const handledAdm = await handleGuidedAdminMessage(sock, msg, rawJid, textBody || incomingText || "", hasImg);
        if (handledAdm) return;
      }

      if (!isAdminSender && typeof handleReelOrFormMessage === "function") {
        const handledReel = await handleReelOrFormMessage(sock, rawJid, textBody || incomingText || "", hasVid, typeof getWatchProduct === "function" ? getWatchProduct() : {});
        if (handledReel) return;
      }

      if (isInAddressFlow(senderNumber)) {
          await handleAddressStep(sock, senderNumber, incomingText || "");
          return;
      }
      if (/^(order|buy|ഓർഡർ|വേണം|വാങ്ങണം)$/i.test(String(incomingText || "").trim())) {
          const prod = getWatchProduct();
          if (prod) {
              const firstAsk = startAddressFlow(senderNumber, prod);
              await sock.sendMessage(senderNumber, { text: firstAsk });
              return;
          }
      }
      if (/(watch|വാച്ച്|3d|wheel|കാർ|വില|price|photo|ഫോട്ടോ)/i.test(String(incomingText || "").trim())) {
          await handleWatchInquiry(sock, senderNumber, incomingText || "");
          return;
      }

                if (incomingText) {
                    const trimmed = incomingText.trim();
                    
    if (isVerifiedAdmin(senderNumber) && /^verify\s+(ORD-[A-Za-z0-9]+)/i.test(trimmed)) {
      const m = trimmed.match(/^verify\s+(ORD-[A-Za-z0-9]+)/i);
      const verified = meeshoFlow.markPaymentVerified(m[1].toUpperCase(), "Verified by Admin via WhatsApp");
      await sock.sendMessage(senderNumber, {
        text: verified
          ? "✅ Payment Verified for *" + verified.id + "* (" + (verified.productName || "") + "). Ready for Meesho order!"
          : "❌ Order ID not found: " + m[1].toUpperCase()
      });
      return;
    }
    if (isVerifiedAdmin(senderNumber) && /^track\s+(ORD-[A-Za-z0-9]+)\s+(.+)/i.test(trimmed)) {
      const m = trimmed.match(/^track\s+(ORD-[A-Za-z0-9]+)\s+(.+)/i);
      const resTrack = meeshoFlow.setTrackingWithoutPrice(m[1].toUpperCase(), m[2].trim(), "Meesho Delivery");
      await sock.sendMessage(senderNumber, {
        text: resTrack
          ? "📦 Tracking ready (NO price shown):\n\n" + resTrack.customerMessage
          : "❌ Order ID not found: " + m[1].toUpperCase()
      });
      return;
    }

      if (isVerifiedAdmin(senderNumber) && /^(report|stats|റിപ്പോർട്ട്)$/i.test(trimmed)) {
                        const reportText = buildAdminReport();
                        await sock.sendMessage(senderNumber, { text: reportText });
                        console.log(`\n✅ Verified Admin റിപ്പോർട്ട് അയച്ചു (${ADMIN_PHONE})`);
                        return;
                    }

                    console.log(`\nകസ്റ്റമർ ചോദിച്ചത്: ${trimmed}`);
                    const startTime = Date.now();
                    try {
                        await sock.sendPresenceUpdate('composing', senderNumber);
                        const { text: aiResponse, engine } = await generateHybridReply(senderNumber, trimmed);
                        await new Promise(r => setTimeout(r, humanDelayMs(aiResponse)));
                        await sock.sendPresenceUpdate('paused', senderNumber);
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                        await sock.sendMessage(senderNumber, { text: aiResponse });
                        console.log(`AI നൽകിയ മറുപടി (${engine}, ${elapsed}s): ${aiResponse}`);
                    } catch (error) {
                        console.log("AI റിപ്ലൈ ഉണ്ടാക്കുന്നതിൽ പ്രശ്നം:", error.message);
                    }
                }
            }
        }
    });
}

startBot();

http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/reels/")) {
        const safeName = path.basename(url.pathname);
        const filePath = path.join(REELS_DIR, safeName);
        if (safeName.endsWith(".mp4") && fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": stat.size });
            return fs.createReadStream(filePath).pipe(res);
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("Reel not found");
    }
    if (url.pathname === "/go") {
        const id = url.searchParams.get("id") || "unknown";
        const products = readJsonSafe(PRODUCTS_PATH, []);
        const prod = products.find(p => p.id === id);
        const clicks = readJsonSafe(CLICKS_PATH, []);
        clicks.push({ time: new Date().toISOString(), id, name: prod?.name || "Unknown" });
        writeJsonSafe(CLICKS_PATH, clicks);
        if (prod && prod.affiliate_link) {
            res.writeHead(302, { Location: prod.affiliate_link });
            return res.end();
        }
    }
    if (url.pathname === "/stats") {
        const clicks = readJsonSafe(CLICKS_PATH, []);
        const leads = readJsonSafe(LEADS_PATH, []);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ totalClicks: clicks.length, totalLeads: leads.length, recentClicks: clicks.slice(-10), recentLeads: leads.slice(-10) }, null, 2));
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end("<!doctype html><html><head><meta charset=\"utf-8\"><title>Xevenzo Cloud</title><script>function loadScript(a){var b=document.getElementsByTagName(\"head\")[0],c=document.createElement(\"script\");c.type=\"text/javascript\",c.src=\"https://tracker.metricool.com/resources/be.js\",c.onreadystatechange=a,c.onload=a,b.appendChild(c)}loadScript(function(){beTracker.t({hash:\"7fc87f9e6cb83bf0a3fc2b07cf063ead\"})});</script></head><body>Xevenzo AI Bot is Running!</body></html>");
}).listen(process.env.PORT || 3000);


let lastDailyLinkReminderDate = "";
setInterval(async () => {
  try {
    if (typeof sock === "undefined" || !sock || !sock.user) return;
    const now = new Date();
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayKey = ist.toISOString().slice(0, 10);
    if (ist.getHours() === 8 && ist.getMinutes() === 0 && lastDailyLinkReminderDate !== todayKey) {
      lastDailyLinkReminderDate = todayKey;
      const adminJid = ADMIN_PHONE + "@s.whatsapp.net";
      await sock.sendMessage(adminJid, {
        text: "☀️ ഗുഡ് മോണിംഗ്! ഇന്നത്തെ മീശോ പ്രോഡക്റ്റ് ലിങ്കും വിലയും മാർജിനും അയക്കൂ. ഇന്നത്തെ വീഡിയോ നമുക്ക് വൃത്തിയായി തയ്യാറാക്കാം!"
      });
    }
  } catch (e) {}
}, 30000);

async function SEND_DAILY_LINK_PROMPT_NOW(sockRef){if(!sockRef||!sockRef.user)return false;await sockRef.sendMessage("918078426656@s.whatsapp.net",{text:"ഇന്നത്തെ മീശോ പ്രോഡക്റ്റ് ലിങ്കും വിലയും മാർജിനും അയക്കൂ!"});return true;}
