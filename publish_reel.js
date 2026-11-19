const fs = require('fs');
const path = require('path');
const { generateAllReelDrafts } = require('./reel_helper');
const { publishInstagramReel } = require('./ig_publisher');

const REELS_DIR = path.join(__dirname, 'reels_out');

async function run() {
    const productId = process.argv[2] || 'XEV-101';
    const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://xevenzo-backend.onrender.com').replace(/\/+$/, '');
    const igUserId = process.env.IG_USER_ID;
    const accessToken = process.env.IG_ACCESS_TOKEN;

    const drafts = generateAllReelDrafts();
    const draft = drafts.find(d => d.id === productId) || drafts[0];
    const videoFilename = `${draft.id}_reel.mp4`;
    const localVideoPath = path.join(REELS_DIR, videoFilename);
    const videoUrl = `${baseUrl}/reels/${encodeURIComponent(videoFilename)}`;

    console.log(`Product: [${draft.id}] ${draft.name}`);
    console.log(`Local Video: ${localVideoPath} (exists: ${fs.existsSync(localVideoPath)})`);
    console.log(`Video URL: ${videoUrl}`);
    console.log(`Caption Preview:\n${draft.caption}\n`);

    if (!igUserId || !accessToken) {
        console.log("ℹ️ IG_USER_ID അല്ലെങ്കിൽ IG_ACCESS_TOKEN ഇതുവരെ നൽകിയിട്ടില്ല (Dry-run OK). ലൈവ് പോസ്റ്റിംഗിന് ഇവ രണ്ടും നൽകി റൺ ചെയ്യുക.");
        return;
    }

    if (!fs.existsSync(localVideoPath)) {
        throw new Error(`വീഡിയോ ഫയൽ കണ്ടെത്താൻ കഴിഞ്ഞില്ല: ${localVideoPath}`);
    }

    const result = await publishInstagramReel({
        igUserId,
        accessToken,
        videoUrl,
        caption: draft.caption
    });
    console.log("✅ INSTAGRAM REEL PUBLISHED SUCCESSFULLY:", JSON.stringify(result));
}

run().catch(err => {
    console.error("❌ PUBLISH ERROR:", err.message);
    process.exit(1);
});
