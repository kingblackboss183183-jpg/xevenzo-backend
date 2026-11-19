const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { addAffiliateProduct } = require('./product_sync');

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const DRAFTS_DIR = path.join(__dirname, 'reels_out');

async function runHybridJson(prompt) {
    const tasks = [
        async () => {
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) throw new Error('GROQ_API_KEY missing');
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'openai/gpt-oss-120b',
                    max_completion_tokens: 550,
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(`Groq 120b HTTP ${res.status}`);
            return { text: data.choices?.[0]?.message?.content?.trim() || '', engine: 'openai/gpt-oss-120b' };
        },
        async () => {
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) throw new Error('GROQ_API_KEY missing');
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'openai/gpt-oss-20b',
                    max_completion_tokens: 550,
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(`Groq 20b HTTP ${res.status}`);
            return { text: data.choices?.[0]?.message?.content?.trim() || '', engine: 'openai/gpt-oss-20b' };
        },
        async () => {
            if (!genAI) throw new Error('GEMINI_API_KEY missing');
            const model = genAI.getGenerativeModel({ model: 'gemini-4-hydrogen' });
            const result = await model.generateContent(prompt);
            return { text: result.response?.text()?.trim() || '', engine: 'gemini-4-hydrogen' };
        }
    ];

    for (const fn of tasks) {
        try {
            const out = await fn();
            if (out.text) return out;
        } catch {}
    }
    return { text: '', engine: 'fallback' };
}

function parseJsonLoose(raw) {
    const match = String(raw || '').match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        return JSON.parse(match[0]);
    } catch {
        return null;
    }
}

async function processAffiliateProduct({
    name,
    price,
    affiliate_link,
    rating = '4.5★',
    commission_tier = 'High',
    category = 'Trending',
    notes = ''
}) {
    const aiPrompt = `You are a business-minded affiliate marketing AI for 'Xevenzo'.
Evaluate this product and generate customer-friendly highlights and a high-converting Malayalam Instagram Reel script + caption.
Return ONLY valid JSON with keys:
- "approved": boolean (true if rating >= 4.0 or good value)
- "quality_note": short note in Malayalam
- "highlights": concise selling points in English/Malayalam
- "reel_hook": catchy 1-line Malayalam hook
- "reel_script": 15-second natural Malayalam voiceover/on-screen script
- "instagram_caption": engaging Malayalam caption with call-to-action to click the WhatsApp link in bio/comment

Product: ${name}
Price: ${price}
Rating: ${rating}
Commission Tier: ${commission_tier}
Notes: ${notes}`;

    const aiRes = await runHybridJson(aiPrompt);
    const parsed = parseJsonLoose(aiRes.text) || {
        approved: true,
        quality_note: 'മികച്ച റിവ്യൂവും വിലക്കുറവുമുള്ള പ്രോഡക്റ്റ്',
        highlights: notes || 'High customer rating, great value for money',
        reel_hook: `${price}-ന് ഇത്രയും മികച്ച ${name}!`,
        reel_script: `നല്ല റിവ്യൂ ഉള്ള ഒരു കിടിലൻ പ്രോഡക്റ്റ് നോക്കുന്നവരാണോ നിങ്ങൾ? ഇതാണ് ${name}. വില വെറും ${price}.`,
        instagram_caption: `🔥 ${name} — വെറും ${price}!\nവാങ്ങാനും കൂടുതൽ വിവരങ്ങൾക്കും ബയോയിലെ / കമന്റിലെ WhatsApp ലിങ്ക് ക്ലിക്ക് ചെയ്യൂ 👇`
    };

    const saved = addAffiliateProduct({
        name,
        price,
        affiliate_link,
        rating,
        commission_tier,
        category,
        highlights: parsed.highlights
    });

    if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });
    const packageText = [
        `PRODUCT: [${saved.id}] ${saved.name} (${saved.price})`,
        `AI ENGINE: ${aiRes.engine}`,
        `QUALITY NOTE: ${parsed.quality_note}`,
        `AFFILIATE LINK: ${saved.affiliate_link}`,
        `WHATSAPP FUNNEL LINK: ${saved.wa_funnel_link}`,
        `\n--- MALAYALAM HOOK ---\n${parsed.reel_hook}`,
        `\n--- MALAYALAM REEL SCRIPT ---\n${parsed.reel_script}`,
        `\n--- INSTAGRAM CAPTION ---\n${parsed.instagram_caption}\nLink: ${saved.wa_funnel_link}`
    ].join('\n');

    const draftPath = path.join(DRAFTS_DIR, `${saved.id}_ai_package.txt`);
    fs.writeFileSync(draftPath, packageText, 'utf8');

    return { saved, parsed, engine: aiRes.engine, draftPath };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.log('Usage: node ai_pipeline_worker.js "<Name>" "<Price>" "<AffiliateLink>" [Rating] [CommissionTier] [Notes]');
        process.exit(0);
    }
    const [name, price, affiliate_link, rating, commission_tier, notes] = args;
    processAffiliateProduct({
        name,
        price,
        affiliate_link,
        rating: rating || '4.5★',
        commission_tier: commission_tier || 'High',
        notes: notes || ''
    })
        .then(res => {
            console.log('✅ AI PIPELINE COMPLETED:', JSON.stringify(res, null, 2));
        })
        .catch(err => {
            console.error('❌ AI PIPELINE ERROR:', err.message);
            process.exit(1);
        });
}

module.exports = { processAffiliateProduct };
