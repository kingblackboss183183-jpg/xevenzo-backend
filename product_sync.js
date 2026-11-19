const fs = require('fs');
const path = require('path');

const PRODUCTS_PATH = path.join(__dirname, 'products.json');
const BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://xevenzo-backend.onrender.com').replace(/\/+$/, '');

function readProducts() {
    try {
        if (!fs.existsSync(PRODUCTS_PATH)) return [];
        const raw = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function saveProducts(list) {
    fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(list, null, 2), 'utf8');
}

function getNextId(list) {
    let maxNum = 100;
    for (const p of list) {
        const m = String(p.id || '').match(/(\d+)$/);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > maxNum) maxNum = n;
        }
    }
    return `XEV-${maxNum + 1}`;
}

function addAffiliateProduct({
    name,
    price,
    affiliate_link,
    rating = '4.5★',
    commission_tier = 'High',
    category = 'Trending',
    highlights = 'Good customer reviews, reliable quality',
    delivery = '3-5 days delivery'
}) {
    if (!name || !price || !affiliate_link) {
        throw new Error('name, price, and affiliate_link are required');
    }
    const list = readProducts();
    const id = getNextId(list);
    const item = {
        id,
        name: String(name).trim(),
        price: String(price).trim(),
        rating: String(rating).trim(),
        commission_tier: String(commission_tier).trim(),
        category: String(category).trim(),
        highlights: String(highlights).trim(),
        delivery: String(delivery).trim(),
        affiliate_link: String(affiliate_link).trim(),
        wa_funnel_link: `${BASE_URL}/wa?id=${encodeURIComponent(id)}`,
        added_at: new Date().toISOString()
    };
    list.push(item);
    saveProducts(list);
    return item;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args[0] === 'list') {
        console.log(JSON.stringify(readProducts(), null, 2));
    } else if (args[0] === 'add' && args.length >= 4) {
        const [, , name, price, affiliate_link, rating, commission_tier, highlights] = args;
        const added = addAffiliateProduct({
            name,
            price,
            affiliate_link,
            rating: rating || '4.5★',
            commission_tier: commission_tier || 'High',
            highlights: highlights || 'Verified product with strong reviews'
        });
        console.log('✅ PRODUCT ADDED:', JSON.stringify(added, null, 2));
    } else {
        console.log('Usage:');
        console.log('  node product_sync.js list');
        console.log('  node product_sync.js add "<Name>" "<Price>" "<AffiliateLink>" [Rating] [CommissionTier] [Highlights]');
    }
}

module.exports = { readProducts, saveProducts, addAffiliateProduct };
