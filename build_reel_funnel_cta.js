const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'reels_out');
fs.mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const productId = args[0] || 'XEV-104';
const productName = args[1] || 'Smart Mini Blender';
const sellingPrice = args[2] || '₹699';
const commentLink = args[3] || `https://xevenzo-backend.onrender.com/wa?id=${productId}`;
const groupLink = args[4] || '';

const reelAndPostCaption = [
    `${productName} — ${sellingPrice}! 🔥`,
    `ഈ റീൽ ഷെയർ ചെയ്ത് സപ്പോർട്ട് ചെയ്യൂ. ഈ പ്രോഡക്റ്റ് വേണമെങ്കിൽ സ്ക്രീനിൽ കാണുന്ന *Xevenzo shopping* WhatsApp QR സ്കാൻ ചെയ്യുകയോ, കമന്റ് ബോക്സിൽ കൊടുത്തിരിക്കുന്ന ലിങ്ക് വഴി വാട്സാപ്പിൽ വരികയോ ചെയ്യുക! 👇`,
    `വാട്സാപ്പിൽ വന്നാൽ നിങ്ങളുടെ അഡ്രസ്സും ഫോൺ നമ്പറും ചോദിച്ച ശേഷം മാത്രമേ പേയ്‌മെന്റ് QR നൽകുകയുള്ളൂ.`,
    groupLink ? `നമ്മുടെ WhatsApp ഗ്രൂപ്പിൽ ചേരാൻ: ${groupLink}` : null,
    `#Xevenzo #MalayalamReels #MeeshoShopping #ShoppingKerala #Offers`
].filter(Boolean).join('\n\n');

const pinnedCommentText = [
    `🛒 *${productName}* ഓർഡർ ചെയ്യാൻ താഴെ കാണുന്ന ലിങ്കിൽ ക്ലിക്ക് ചെയ്ത് വാട്സാപ്പിൽ വരൂ:`,
    `${commentLink}`,
    `അല്ലെങ്കിൽ റീലിൽ കാണുന്ന *Xevenzo shopping* WhatsApp QR സ്കാൻ ചെയ്യുക. അഡ്രസ്സും നമ്പറും നൽകിയ ശേഷം പേയ്‌മെന്റ് വിവരങ്ങൾ ലഭിക്കും.`
].join('\n');

const outFile = path.join(outDir, `${productId}_funnel_cta.txt`);
const content = [
    `=== REEL & POST CAPTION ===`,
    reelAndPostCaption,
    ``,
    `=== PINNED COMMENT TEXT ===`,
    pinnedCommentText
].join('\n');

fs.writeFileSync(outFile, content, 'utf8');
console.log('✅ FUNNEL CTA PACKAGE CREATED:', outFile);
console.log(content);
