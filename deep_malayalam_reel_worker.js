const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const baseDir = __dirname;
const mediaDir = path.join(baseDir, 'media_in');
const outDir = path.join(baseDir, 'reels_out');
fs.mkdirSync(mediaDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const productId = args[0] || 'XEV-104';
const productName = args[1] || 'Smart Mini Blender';
const price = args[2] || '₹699';
const benefits = args[3] || 'ദിവസേനയുള്ള ജ്യൂസ്, ഷേക്ക്, സ്മൂത്തി എന്നിവ മിനിറ്റുകൾക്കുള്ളിൽ എളുപ്പത്തിൽ തയ്യാറാക്കാം; പോർട്ടബിൾ ആയതുകൊണ്ട് എവിടെയും കൊണ്ടുപോകാം, വൃത്തിയാക്കാനും വളരെ എളുപ്പമാണ്.';
const waLink = args[4] || `https://xevenzo-backend.onrender.com/wa?id=${productId}`;

const deepScriptPackage = [
    `=== PRODUCT: ${productName} (${productId}) | PRICE: ${price} ===`,
    ``,
    `[0-3s HOOK - മലയാളം]`,
    `${productName} ഇത്രയും എളുപ്പവും ഉപകാരപ്രദവുമാണോ? ${price} റേഞ്ചിൽ ഇതൊരു കിടിലൻ ഓപ്ഷനാണ്!`,
    ``,
    `[3-22s DEEP EXPLANATION - മലയാളം]`,
    `${benefits}`,
    `ഈ പ്രോഡക്റ്റ് നിങ്ങളുടെ ദൈനംദിന ജോലികൾ എങ്ങനെ എളുപ്പമാക്കുന്നു എന്നും, ഉപയോഗിക്കുമ്പോൾ ശ്രദ്ധിക്കേണ്ട കാര്യങ്ങളും വ്യക്തമായി മനസ്സിലാക്കാം.`,
    ``,
    `[22-30s FUNNEL CTA - റീൽ ഷെയർ + WHATSAPP QR + COMMENT LINK]`,
    `ഈ റീൽ ഷെയർ ചെയ്ത് സപ്പോർട്ട് ചെയ്യൂ! ഈ പ്രോഡക്റ്റ് വേണമെങ്കിൽ സ്ക്രീനിൽ കാണുന്ന *Xevenzo shopping* WhatsApp QR സ്കാൻ ചെയ്യുകയോ, കമന്റ് ബോക്സിലുള്ള ലിങ്ക് വഴി വാട്സാപ്പിൽ വരികയോ ചെയ്യുക.`,
    `വാട്സാപ്പിൽ നിങ്ങളുടെ അഡ്രസ്സും ഫോൺ നമ്പറും (OTP/ഡെലിവറി നമ്പർ) നൽകിയ ശേഷം മാത്രമേ പേയ്‌മെന്റ് QR നൽകുകയുള്ളൂ.`,
    ``,
    `[PINNED COMMENT LINK]`,
    `${waLink}`
].join('\n');

const pkgPath = path.join(outDir, `${productId}_deep_malayalam_package.txt`);
fs.writeFileSync(pkgPath, deepScriptPackage, 'utf8');

const images = fs.readdirSync(mediaDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
console.log('📁 media_in images count:', images.length);
console.log('✅ DEEP MALAYALAM PACKAGE SAVED:', pkgPath);

if (images.length > 0 && fs.existsSync(path.join(baseDir, 'reel_builder.js'))) {
  try {
    execSync(`node "${path.join(baseDir, 'reel_builder.js')}"`, { stdio: 'inherit' });
  } catch (e) {
    console.log('ℹ️ reel_builder.js run note:', e.message);
  }
} else {
  console.log('ℹ️ media_in-ൽ ഇമേജുകൾ ചേർത്ത ശേഷം reel_builder.js റൺ ചെയ്യുമ്പോൾ 9:16 വീഡിയോ ബിൽഡ് ആകും.');
}
