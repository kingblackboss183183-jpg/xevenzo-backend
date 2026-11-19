const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { assignProductNumbers, buildMalayalamVideoScript } = require("./xev_campaign_engine");

const REELS_DIR = path.join(__dirname, "reels");
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(REELS_DIR)) fs.mkdirSync(REELS_DIR, { recursive: true });

function runCmd(cmd, args, timeout = 180000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: __dirname, timeout }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve({ stdout, stderr });
    });
  });
}

async function generateFreeMalayalamVoice(text, outMp3) {
  const pyCode = `
import sys, asyncio
text, out_path = sys.argv[1], sys.argv[2]
done = False
try:
    import edge_tts
    async def main():
        for voice in ["ml-IN-SobhanaNeural", "ml-IN-MidhunNeural"]:
            try:
                tts = edge_tts.Communicate(text, voice)
                await tts.save(out_path)
                return True
            except Exception:
                pass
        return False
    done = asyncio.run(main())
except Exception:
    done = False

if not done:
    from gtts import gTTS
    gTTS(text=text, lang="ml").save(out_path)
`;
  await runCmd("python3", ["-c", pyCode, text, outMp3]);
  return outMp3;
}

function getFallbackImage() {
  if (fs.existsSync(UPLOADS_DIR)) {
    const imgs = fs.readdirSync(UPLOADS_DIR).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));
    if (imgs.length) return path.join(UPLOADS_DIR, imgs[0]);
  }
  return null;
}

async function buildReelForProduct(productId) {
  const items = assignProductNumbers();
  const prod = productId ? items.find((p) => p.id === productId) : items[0];
  if (!prod) throw new Error("Product not found");

  const script = buildMalayalamVideoScript(prod);
  const baseTag = prod.id || ("item-" + Date.now());
  const voiceFile = path.join(REELS_DIR, `${baseTag}-voice.mp3`);
  const outVideo = path.join(REELS_DIR, `${baseTag}-reel.mp4`);

  await generateFreeMalayalamVoice(script.fullNarration, voiceFile);

  let imgPath = "";
  if (prod.imageUrl && prod.imageUrl.startsWith("/uploads/")) {
    const candidate = path.join(__dirname, prod.imageUrl.replace(/^\/+/, ""));
    if (fs.existsSync(candidate)) imgPath = candidate;
  }
  if (!imgPath) imgPath = getFallbackImage();

  let ffmpegArgs;
  if (imgPath) {
    // High-clarity 1080x1920 vertical reel with smooth zoom motion + Malayalam voiceover
    ffmpegArgs = [
      "-y",
      "-loop", "1",
      "-i", imgPath,
      "-i", voiceFile,
      "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:#090d16,zoompan=z='min(zoom+0.0008,1.15)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,format=yuv420p",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      outVideo
    ];
  } else {
    // Clean dark studio background if no image was attached yet
    ffmpegArgs = [
      "-y",
      "-f", "lavfi",
      "-i", "color=c=#090d16:s=1080x1920:r=30",
      "-i", voiceFile,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      outVideo
    ];
  }

  await runCmd("ffmpeg", ffmpegArgs);
  prod.reelVideoPath = `/reels/${path.basename(outVideo)}`;
  prod.malayalamScript = script;
  prod.reelStatus = "VIDEO_READY";
  fs.writeFileSync(path.join(__dirname, "meesho_products.json"), JSON.stringify(items, null, 2), "utf8");
  console.log("✅ REEL_CREATED:", outVideo);
  return { outVideo, script };
}

if (require.main === module) {
  buildReelForProduct(process.argv[2]).catch((e) => {
    console.error("❌ REEL_ERROR:", e.message);
    process.exit(1);
  });
}

module.exports = { buildReelForProduct };
