const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const PRODUCTS_PATH = path.join(__dirname, 'products.json');
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

function readCatalog() {
    try {
        if (!fs.existsSync(PRODUCTS_PATH)) return [];
        const raw = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function findMatchingProduct(text, catalog) {
    const q = String(text || '').toLowerCase();
    const idMatch = catalog.find(p => p.id && q.includes(String(p.id).toLowerCase()));
    if (idMatch) return idMatch;
    return catalog.find(p => {
        const words = String(p.name || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
        return words.some(w => q.includes(w));
    }) || null;
}

function buildIgPrompt(channel, messageText, matchedProduct, catalog) {
    const prodInfo = matchedProduct
        ? `Matched Product: [${matchedProduct.id}] ${matchedProduct.name} | Price: ${matchedProduct.price} | Highlights: ${matchedProduct.highlights} | Link: ${matchedProduct.affiliate_link || 'N/A'}`
        : `Catalog summary: ${catalog.map(p => `[${p.id}] ${p.name} (${p.price})`).join(', ') || 'None'}`;

    return `You are a friendly, human-like social media & sales assistant for 'Xevenzo' on Instagram (${channel}).
Reply naturally in Malayalam (or Manglish/English if the user uses that). Keep it short, warm, and natural.
Rules:
1. If a specific product matches, focus on that product first and share its price/link clearly, then ask if they want to see other products.
2. Never invent prices or fake links.
3. For public comments, keep it concise and invite them to DM or WhatsApp for quick details.

${prodInfo}
Incoming ${channel} message: "${messageText}"`;
}

async function askGroqText(model, prompt) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY missing');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            max_completion_tokens: 280,
            messages: [{ role: 'user', content: prompt }]
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${model} HTTP ${res.status}`);
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error(`${model} empty reply`);
    return { text, engine: model };
}

async function askGeminiText(modelName, prompt) {
    if (!genAI) throw new Error('GEMINI_API_KEY missing');
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const text = result.response?.text()?.trim();
    if (!text) throw new Error(`${modelName} empty reply`);
    return { text, engine: modelName };
}

async function generateInstagramReply({ channel = 'dm', messageText = '' }) {
    const catalog = readCatalog();
    const matchedProduct = findMatchingProduct(messageText, catalog);
    const prompt = buildIgPrompt(channel, messageText, matchedProduct, catalog);

    const chain = [
        () => askGroqText('openai/gpt-oss-120b', prompt),
        () => askGroqText('openai/gpt-oss-20b', prompt),
        () => askGeminiText('gemini-4-hydrogen', prompt)
    ];

    let lastErr = null;
    for (const step of chain) {
        try {
            return await step();
        } catch (err) {
            lastErr = err;
        }
    }

    const fallbackLink = matchedProduct?.affiliate_link || 'https://xevenzo-backend.onrender.com/wa';
    const fallbackName = matchedProduct?.name || 'Xevenzo പ്രോഡക്റ്റ്';
    return {
        text: `${fallbackName} വിവരങ്ങളും ലിങ്കും ഇവിടെയുണ്ട്: ${fallbackLink} — വേറെ പ്രോഡക്റ്റുകൾ കൂടി കാണണോ?`,
        engine: 'fallback',
        error: lastErr?.message
    };
}

if (require.main === module) {
    const sampleText = process.argv.slice(2).join(' ') || 'XEV-101 ലിങ്ക് തരാമോ?';
    generateInstagramReply({ channel: 'dm', messageText: sampleText })
        .then(r => console.log('✅ IG AI TEST:', JSON.stringify(r, null, 2)))
        .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { generateInstagramReply, findMatchingProduct };
