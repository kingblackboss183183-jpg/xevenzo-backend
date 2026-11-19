const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'meesho_products.json');

function readCatalog() {
    try {
        if (!fs.existsSync(CATALOG_PATH)) return [];
        const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function saveCatalog(list) {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(list, null, 2), 'utf8');
}

function addOrUpdateMeeshoProduct({
    id,
    name,
    category = 'general',
    meeshoPrice,
    margin,
    inStock = true,
    photoPath = '',
    similarIds = []
}) {
    const list = readCatalog();
    const basePrice = Number(meeshoPrice) || 0;
    const addMargin = Number(margin) || 0;
    const customerPrice = basePrice + addMargin;

    const item = {
        id,
        name,
        category,
        meeshoPrice: basePrice,
        margin: addMargin, // Admin-only internal field; NEVER sent to customer
        customerPrice,
        inStock: Boolean(inStock),
        photoPath,
        similarIds: Array.isArray(similarIds) ? similarIds : [],
        updatedAt: new Date().toISOString()
    };

    const idx = list.findIndex(p => p.id === id);
    if (idx >= 0) list[idx] = item;
    else list.push(item);

    saveCatalog(list);
    return item;
}

function checkProductForOrder(productId) {
    const list = readCatalog();
    const prod = list.find(p => p.id === productId);
    if (!prod) {
        return { ok: false, reason: 'NOT_FOUND', message: 'ഈ പ്രോഡക്റ്റ് നിലവിൽ ലിസ്റ്റിൽ ഇല്ല.' };
    }

    if (prod.inStock) {
        return {
            ok: true,
            inStock: true,
            product: prod,
            customerPriceText: `₹${prod.customerPrice}`,
            photoPath: prod.photoPath || ''
        };
    }

    // Out of stock -> find similar in-stock products
    const similarList = list.filter(p =>
        p.id !== prod.id &&
        p.inStock &&
        (prod.similarIds.includes(p.id) || p.category === prod.category)
    );

    const alt = similarList[0] || null;
    return {
        ok: false,
        inStock: false,
        outOfStockProduct: prod,
        alternativeProduct: alt,
        photoPath: alt && alt.photoPath ? alt.photoPath : '',
        customerMessage: alt
            ? `ക്ഷമിക്കണം, *${prod.name}* നിലവിൽ സ്റ്റോക്ക് ഇല്ല. പകരം ഇതിനോട് സമാനമായ *${alt.name}* (വില: ₹${alt.customerPrice}) ഇപ്പോൾ സ്റ്റോക്ക് ഉണ്ട്. ഇതിന്റെ ഫോട്ടോയും വിവരങ്ങളും താഴെ നൽകുന്നു—ഇത് വേണോ?`
            : `ക്ഷമിക്കണം, *${prod.name}* നിലവിൽ സ്റ്റോക്ക് ഇല്ല. സമാനമായ മറ്റൊരു പ്രോഡക്റ്റ് വരുമ്പോൾ അറിയിക്കാം.`
    };
}


function verifyProductPhotoExists(photoPath) {
    if (!photoPath) return false;
    const full = path.isAbsolute(photoPath) ? photoPath : path.join(__dirname, photoPath);
    return fs.existsSync(full);
}

if (require.main === module) {
    addOrUpdateMeeshoProduct({
        id: 'XEV-104',
        name: 'Smart Mini Blender',
        category: 'kitchen',
        meeshoPrice: 549,
        margin: 150,
        inStock: true,
        photoPath: 'media_in/blender_1.jpg',
        similarIds: ['XEV-105']
    });
    addOrUpdateMeeshoProduct({
        id: 'XEV-105',
        name: 'Portable USB Juicer Cup',
        category: 'kitchen',
        meeshoPrice: 499,
        margin: 150,
        inStock: true,
        photoPath: 'media_in/juicer_alt.jpg',
        similarIds: ['XEV-104']
    });

    console.log('IN STOCK CHECK:', checkProductForOrder('XEV-104'));
    addOrUpdateMeeshoProduct({
        id: 'XEV-104',
        name: 'Smart Mini Blender',
        category: 'kitchen',
        meeshoPrice: 549,
        margin: 150,
        inStock: false,
        photoPath: 'media_in/blender_1.jpg',
        similarIds: ['XEV-105']
    });
    console.log('OUT OF STOCK + SIMILAR CHECK:', checkProductForOrder('XEV-104'));
}

module.exports = {
    readCatalog,
    saveCatalog,
    addOrUpdateMeeshoProduct,
    checkProductForOrder
};
