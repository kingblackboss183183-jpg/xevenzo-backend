const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const mediaDir = path.join(__dirname, "media_in");
const outDir = path.join(__dirname, "reels_out");
const catalogPath = path.join(__dirname, "meesho_products.json");
fs.mkdirSync(outDir, { recursive: true });

let latestProd = { title: "Xevenzo Special Watch", finalPrice: 499 };
if (fs.existsSync(catalogPath)) {
  try {
    const arr = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    if (Array.isArray(arr) && arr.length > 0) {
      const last = arr[arr.length - 1];
      const bp = Number(last.basePrice || 399);
      latestProd = {
        title: last.title || "Xevenzo Product",
        finalPrice: Number(last.finalPrice || (bp + 100))
      };
    }
  } catch {}
}

const imgs = fs.existsSync(mediaDir)
  ? fs.readdirSync(mediaDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort().map((f) => path.join(mediaDir, f))
  : [];

if (imgs.length === 0) {
  console.error("NO_IMAGES_IN_MEDIA_IN");
  process.exit(1);
}

const storyCaption = `${latestProd.title}\nPrice: Rs ${latestProd.finalPrice}\nOrder on WhatsApp`;
fs.writeFileSync(path.join(outDir, "latest_story_caption.txt"), storyCaption, "utf8");

const listFile = path.join(outDir, "story_images.txt");
const concatLines = imgs
  .map((img) => `file '${img.replace(/'/g, "'\\''")}'\nduration 3`)
  .join("\n") + `\nfile '${imgs[imgs.length - 1].replace(/'/g, "'\\''")}'\n`;
fs.writeFileSync(listFile, concatLines, "utf8");

const outStory = path.join(outDir, "xevenzo_story.mp4");
const cmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p" -r 30 -c:v libx264 -preset fast -crf 22 -an "${outStory}"`;

execSync(cmd, { stdio: "inherit" });
fs.copyFileSync(outStory, "/sdcard/Download/xevenzo_story.mp4");
console.log("✅ IG_STORY_READY:", outStory, "| Final Price:", latestProd.finalPrice);
