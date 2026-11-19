const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// നിങ്ങളുടെ Gemini API തലച്ചോറ് സെറ്റ് ചെയ്യുന്നു
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-3.8-flash",
    systemInstruction: "You are a friendly customer support agent for the online shopping brand 'Xevenzo'. You reply in Malayalam and English. Keep responses short, helpful, and natural."
});

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
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('\nകണക്ഷൻ നഷ്ടപ്പെട്ടു! 3 സെക്കൻഡിനുള്ളിൽ വീണ്ടും ശ്രമിക്കുന്നു...');
            if(shouldReconnect) {
                setTimeout(startBot, 3000); 
            }
        } else if (connection === 'open') {
            console.log('\n✅ വാട്സ്ആപ്പ് വിജയകരമായി കണക്ട് ആയി! Xevenzo AI ബോട്ട് ആക്ടീവ് ആണ്.');
        }
    });

    // പുതിയ മെസ്സേജ് വരുമ്പോൾ AI റിപ്ലൈ നൽകാനുള്ള ഭാഗം
    sock.ev.on('messages.upsert', async m => {
        if(m.type === 'notify') {
            const msg = m.messages[0];
            if(!msg.key.fromMe && msg.message) {
                const senderNumber = msg.key.remoteJid;
                
                // കസ്റ്റമർ അയച്ച മെസ്സേജ് എടുക്കുന്നു
                const incomingText = msg.message.conversation || msg.message.extendedTextMessage?.text;
                
                if (incomingText) {
                    console.log(`\nകസ്റ്റമർ ചോദിച്ചത്: ${incomingText}`);
                    
                    try {
                        // AI തലച്ചോറ് ഉപയോഗിച്ച് റിപ്ലൈ ഉണ്ടാക്കുന്നു
                        const result = await aiModel.generateContent(incomingText);
                        const aiResponse = result.response.text();
                        
                        // വാട്സ്ആപ്പിലേക്ക് AI റിപ്ലൈ അയക്കുന്നു
                        await sock.sendMessage(senderNumber, { text: aiResponse });
                        console.log(`AI നൽകിയ മറുപടി: ${aiResponse}`);
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
