const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { generateAllReelDrafts } = require('./reel_helper');

const OUT_DIR = path.join(__dirname, 'reels_out');
const IN_DIR = path.join(__dirname, 'media_in');

function buildReelFromMedia(inputMediaPath, productDraft, outBasename) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const ext = path.extname(inputMediaPath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    const outVideo = path.join(OUT_DIR, `${outBasename}.mp4`);
    const outMeta = path.join(OUT_DIR, `${outBasename}_package.txt`);

    const vfFilter = isImage
        ? "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.12)':d=200:s=1080x1920:fps=25,format=yuv420p"
        : "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=25,format=yuv420p";

    const args = isImage
        ? ['-y', '-loop', '1', '-i', inputMediaPath, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-t', '8', '-vf', vfFilter, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', outVideo]
        : ['-y', '-i', inputMediaPath, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-vf', vfFilter, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', outVideo];

    execFileSync('ffmpeg', args, { stdio: 'pipe' });

    const metaContent = [
        `PRODUCT ID: ${productDraft.id}`,
        `PRODUCT NAME: ${productDraft.name}`,
        `VIDEO FILE: ${outVideo}`,
        `\n--- MALAYALAM REEL SCRIPT ---\n${productDraft.script}`,
        `\n--- INSTAGRAM CAPTION ---\n${productDraft.caption}`
    ].join('\n');

    fs.writeFileSync(outMeta, metaContent, 'utf8');
    return { outVideo, outMeta };
}

if (require.main === module) {
    const drafts = generateAllReelDrafts();
    const sampleInput = path.join(OUT_DIR, 'test_reel.mp4');
    if (!fs.existsSync(sampleInput)) {
        throw new Error("test_reel.mp4 കാണാനില്ല; ഘട്ടം 19 ആദ്യം പൂർത്തിയാക്കുക.");
    }
    const res = buildReelFromMedia(sampleInput, drafts[0], 'XEV-101_reel');
    const stat = fs.statSync(res.outVideo);
    console.log(`✅ REEL BUILDER VERIFIED OK | File: ${res.outVideo} | Size: ${stat.size} bytes`);
}

module.exports = { buildReelFromMedia, IN_DIR, OUT_DIR };
