const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const title = args[0] || "Xevenzo Special Product";
const basePrice = Number(args[1] || 399);
const margin = Number(args[2] || 100);
const meeshoLink = args[3] || "";
const finalPrice = basePrice + margin;

const mediaDir = path.join(__dirname, "media_in");
const outDir = path.join(__dirname, "reels_out");
fs.mkdirSync(mediaDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const imgs = fs
  .readdirSync(mediaDir)
  .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
  .sort()
  .map((f) => path.join(mediaDir, f));

if (imgs.length === 0) {
  console.error("NO_IMAGES_IN_MEDIA_IN");
  process.exit(1);
}

const scriptText = [
  `Xevenzo shopping - ${title}`,
  `വില: Rs ${finalPrice} (ഇന്ന് തന്നെ ഓർഡർ ചെയ്യാം)`,
  `വാട്സ്ആപ്പ് വഴി പേരും അഡ്രസ്സും പിൻകോഡും അയച്ച് എളുപ്പത്തിൽ ഓർഡർ ചെയ്യാം.`,
  meeshoLink ? `Link: ${meeshoLink}` : ""
]
  .filter(Boolean)
  .join("\n");

fs.writeFileSync(path.join(outDir, "latest_reel_script.txt"), scriptText, "utf8");

const listFile = path.join(outDir, "images.txt");
const perImgSec = Math.max(2, Math.min(5, Math.floor(12 / imgs.length)));
const concatLines = imgs
  .map((img) => `file '${img.replace(/'/g, "'\\''")}'\nduration ${perImgSec}`)
  .join("\n") + `\nfile '${imgs[imgs.length - 1].replace(/'/g, "'\\''")}'\n`;

fs.writeFileSync(listFile, concatLines, "utf8");

const outVideo = path.join(outDir, "reel_latest.mp4");
const cmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p" -r 30 -c:v libx264 -preset fast -crf 23 -an "${outVideo}"`;

execSync(cmd, { stdio: "inherit" });
console.log("REEL_CREATED:", outVideo);
