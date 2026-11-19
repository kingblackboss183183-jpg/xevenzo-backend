const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const mediaDir = path.join(__dirname, "media_in");
const outDir = path.join(__dirname, "reels_out");
fs.mkdirSync(outDir, { recursive: true });

const voiceScript = "വെറുമൊരു സാധാരണ വാച്ചല്ല ഇത്! സ്പോർട്സ് കാറിന്റെ അലോയ് വീലും റെഡ് ബ്രേക്ക് കാലിപ്പറും പോലെയുള്ള പ്രീമിയം ബ്ലാക്ക് സ്റ്റെയിൻലെസ് സ്റ്റീൽ അനലോഗ് വാച്ച്! വാട്ടർ റെസിസ്റ്റന്റ്, ക്വാർട്സ് മൂവ്മെന്റ്, കിടിലൻ ലുക്ക്. വെറും 499 രൂപയ്ക്ക് ഇന്ന് തന്നെ സ്വന്തമാക്കാം! ഓർഡർ ചെയ്യാൻ ബയോയിലെ Xevenzo shopping വാട്സ്ആപ്പ് ലിങ്കിൽ ഇപ്പോൾ തന്നെ മെസ്സേജ് അയക്കൂ!";

const audioPath = path.join(outDir, "malayalam_voice.mp3");
const tempVideoPath = path.join(outDir, "temp_motion.mp4");
const finalReelPath = path.join(outDir, "xevenzo_pro_reel.mp4");
const downloadCopyPath = "/sdcard/Download/xevenzo_pro_reel.mp4";

console.log("1. Generating Malayalam AI Voiceover...");
execSync(`edge-tts --voice ml-IN-MidhunNeural --rate=+5% --text "${voiceScript}" --write-media "${audioPath}"`, { stdio: "inherit" });

const imgs = fs.readdirSync(mediaDir)
  .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
  .sort()
  .map((f) => path.join(mediaDir, f));

if (imgs.length === 0) {
  console.error("NO_IMAGES_FOUND");
  process.exit(1);
}

console.log("2. Creating Smooth Zoom-In HD Video Clips...");
const clipPaths = [];
imgs.forEach((img, idx) => {
  const clipOut = path.join(outDir, `clip_${idx}.mp4`);
  // Smooth zoom-in effect (Ken Burns) at 1080x1920 30fps for 4 seconds per image
  const zoomCmd = `ffmpeg -y -loop 1 -i "${img}" -vf "scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,zoompan=z='min(zoom+0.0015,1.25)':d=120:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,format=yuv420p" -t 4 -r 30 -c:v libx264 -preset fast -crf 20 "${clipOut}"`;
  execSync(zoomCmd, { stdio: "ignore" });
  clipPaths.push(clipOut);
});

const concatList = path.join(outDir, "clips_list.txt");
fs.writeFileSync(concatList, clipPaths.map(c => `file '${c}'`).join("\n"), "utf8");

execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${tempVideoPath}"`, { stdio: "ignore" });

console.log("3. Merging HD Video & Malayalam Audio...");
execSync(`ffmpeg -y -i "${tempVideoPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -shortest "${finalReelPath}"`, { stdio: "inherit" });

fs.copyFileSync(finalReelPath, downloadCopyPath);
clipPaths.forEach(c => { try { fs.unlinkSync(c); } catch {} });
try { fs.unlinkSync(tempVideoPath); } catch {}

console.log("✅ PRO_REEL_CREATED:", finalReelPath);
console.log("✅ SAVED_TO_DOWNLOADS:", downloadCopyPath);
