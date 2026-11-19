const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const SYSTEM_PROMPT = "You are a friendly customer support agent for the online shopping brand 'Xevenzo'. You reply in Malayalam and English. Keep responses short, helpful, and natural.";

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

async function askGroq(model, prompt) {
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
                max_completion_tokens: 500,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: prompt }
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

async function askGemini(modelName, prompt) {
    if (!genAI) throw new Error("GEMINI_API_KEY missing");
    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_PROMPT
    });
    const result = await model.generateContent(prompt);
    const text = result.response?.text()?.trim();
    if (!text) throw new Error(`${modelName} empty response`);
    return { text, engine: modelName };
}

async function generateHybridReply(prompt) {
    const chain = [
        () => askGroq("openai/gpt-oss-120b", prompt),
        () => askGroq("openai/gpt-oss-20b", prompt),
        () => askGemini("gemini-4-hydrogen", prompt)
    ];

    let lastError = null;
    for (const step of chain) {
        try {
            return await step();
        } catch (err) {
            lastError = err;
            console.log(`⚠️ Fallback triggered (${err.message})`);
        }
    }
    throw lastError || new Error("All AI engines failed");
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            const phoneNumber = "916238985160";
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n==================================`);
                console.log(`നിങ്ങളുടെ പെയറിങ് കോഡ്: ${code}`);
                console.log(`==================================\n`);
            } catch (error) {
                console.log("കോഡ് എടുക്കുന്നതിൽ പ്രശ്നം:", error?.message || error);
            }
        }, 4000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('\nകണക്ഷൻ നഷ്ടപ്പെട്ടു! 3 സെക്കൻഡിനുള്ളിൽ വീണ്ടും ശ്രമിക്കുന്നു...');
            if (shouldReconnect) {
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            console.log('\n✅ വാട്സ്ആപ്പ് വിജയകരമായി കണക്ട് ആയി! Xevenzo AI ബോട്ട് ആക്ടീവ് ആണ്.');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        if (m.type === 'notify') {
            const msg = m.messages[0];
            if (!msg.key.fromMe && msg.message) {
                const senderNumber = msg.key.remoteJid;
                const incomingText = msg.message.conversation || msg.message.extendedTextMessage?.text;

                if (incomingText) {
                    console.log(`\nകസ്റ്റമർ ചോദിച്ചത്: ${incomingText}`);
                    const startTime = Date.now();
                    try {
                        const { text: aiResponse, engine } = await generateHybridReply(incomingText);
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

const http = require("http");
http.createServer((req, res) => { res.writeHead(200); res.end("Xevenzo AI Bot is Running!"); }).listen(process.env.PORT || 3000);
