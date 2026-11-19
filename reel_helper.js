const fs = require('fs');
const path = require('path');

const PRODUCTS_PATH = path.join(__dirname, 'products.json');

function buildMalayalamReelDraft(product) {
    const hook = `ഈ വിലയ്ക്ക് ഇത്രയും നല്ല ${product.name} കിട്ടുമോ?!`;
    const script = [
        `Hook: ${hook}`,
        `Body: ${product.name} ഇപ്പോൾ വെറും ${product.price} രൂപയ്ക്ക് ലഭ്യമാണ്. ${product.highlights} എന്നതാണ് ഇതിന്റെ പ്രധാന പ്രത്യേകത. ഡെലിവറി സാധാരണയായി ${product.delivery}യ്ക്കുള്ളിൽ എത്തും.`,
        `CTA: കൂടുതൽ വിവരങ്ങൾക്കും ഓർഡർ ചെയ്യാനും കമന്റിൽ/വാട്സ്ആപ്പിൽ ബന്ധപ്പെടുക അല്ലെങ്കിൽ ലിങ്ക് പരിശോധിക്കുക.`
    ].join('\n');

    const caption = `${hook}\n\n✨ *${product.name}* (${product.price})\n✅ ${product.highlights}\n🚚 Delivery: ${product.delivery}\n🔗 Link: ${product.affiliate_link || 'DM for link'}\n\n#Xevenzo #MalayalamReels #ProductReview #ShoppingKerala #Offers`;

    return { id: product.id, name: product.name, script, caption };
}

function generateAllReelDrafts() {
    const raw = fs.readFileSync(PRODUCTS_PATH, 'utf8');
    const products = JSON.parse(raw);
    return products.map(buildMalayalamReelDraft);
}

if (require.main === module) {
    const drafts = generateAllReelDrafts();
    console.log(`✅ REEL DRAFTS GENERATED: ${drafts.length}`);
    console.log(JSON.stringify(drafts[0], null, 2));
}

module.exports = { buildMalayalamReelDraft, generateAllReelDrafts };
