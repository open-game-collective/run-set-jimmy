/**
 * Plays a whole Run Set Jimmy game through the real UI with four phones and records it:
 *   recordings/run-set-jimmy-game.mp4     TV | Jonathan's phone | Juniper's phone, with the TV's sound
 *   recordings/run-set-jimmy-phones.mp4   all four phones side by side
 *   recordings/run-set-jimmy-fast.mp4     the first video at 4× speed (a quick look)
 *   recordings/moments/                   stills of key moments, and a contact sheet
 *
 *   GAME_URL=http://localhost:8797 pnpm record     (needs `pnpm dev`)
 *   GAME_ROUNDS=2   stop after 2 rounds (default: all 7)
 *   GAME_BEAT=400   ms between taps (slower is easier to follow)
 *
 * Playwright records pixels only, so the TV page's Web Audio is captured with a MediaRecorder
 * (?record exposes a tap) and muxed in.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { BASE, NAMES, newRoomCode, phoneContext, playTable, seatPlayers, wait } from "./table";

const RAW = "recordings/raw";
const MOMENTS = "recordings/moments";
const OUT = "recordings/run-set-jimmy-game.mp4";
const PHONES_OUT = "recordings/run-set-jimmy-phones.mp4";
const FAST_OUT = "recordings/run-set-jimmy-fast.mp4";
const ROUNDS = process.env.GAME_ROUNDS ? Number(process.env.GAME_ROUNDS) : undefined;
const BEAT = Number(process.env.GAME_BEAT ?? 350);
const FONT = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf";

async function main() {
  for (const dir of [RAW, MOMENTS]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
  const tvSize = { width: 1280, height: 720 };
  const tvCtx = await browser.newContext({ viewport: tvSize, recordVideo: { dir: RAW, size: tvSize } });
  const startedAt = [Date.now()];
  const tv = await tvCtx.newPage();
  const phones: Page[] = [];
  for (let i = 0; i < 4; i++) {
    const opts = phoneContext();
    const ctx = await browser.newContext({ ...opts, recordVideo: { dir: RAW, size: opts.viewport } });
    startedAt.push(Date.now());
    const page = await ctx.newPage();
    await page.setContent('<body style="margin:0;background:#0f3b37;height:100vh"></body>');
    page.on("pageerror", (e) => console.log(`[${NAMES[i]}] ${e.message}`));
    phones.push(page);
  }
  tv.on("pageerror", (e) => console.log(`[tv] ${e.message}`));

  const code = newRoomCode();
  await tv.goto(`${BASE}/tv/${code}?record=1`);
  await tv.getByTestId("tv-join").waitFor();
  await tv.evaluate(`(() => {
    const rec = new MediaRecorder(window.__tvTap(), { mimeType: "audio/webm;codecs=opus" });
    window.__chunks = [];
    rec.ondataavailable = (e) => window.__chunks.push(e.data);
    rec.start(250);
    window.__rec = rec;
  })()`);
  const audioStartedAt = Date.now();
  await wait(1500);
  await seatPlayers(phones, code, BEAT * 2);
  await wait(BEAT * 4);

  const seen = new Map<string, number>();
  const result = await playTable(phones, {
    beat: BEAT,
    ...(ROUNDS === undefined ? {} : { rounds: ROUNDS }),
    onMoment: async (name) => {
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      if (n > 3) return;
      await wait(450);
      await tv.screenshot({ path: `${MOMENTS}/tv-${name}-${n}.png` });
      await phones[0]?.screenshot({ path: `${MOMENTS}/phone-${name}-${n}.png` });
    },
  });
  console.log(`played ${result.rounds} rounds, ${result.actions} actions`);
  await wait(BEAT * 10);

  const b64 = await tv.evaluate<string>(`new Promise((resolve) => {
    window.__rec.onstop = () => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.readAsDataURL(new Blob(window.__chunks, { type: "audio/webm" }));
    };
    window.__rec.stop();
  })`);
  const audio = `${RAW}/tv-audio.webm`;
  writeFileSync(audio, Buffer.from(b64, "base64"));

  const pages = [tv, ...phones];
  const videos = await Promise.all(
    pages.map(async (p) => {
      const v = p.video();
      await p.context().close();
      if (!v) throw new Error("no video");
      return v.path();
    }),
  );
  await browser.close();

  const meta = { videos, startedAt, audio, audioStartedAt };
  writeFileSync(`${RAW}/meta.json`, JSON.stringify(meta, null, 1));
  stitch(meta);
}

type Meta = { videos: string[]; startedAt: number[]; audio: string; audioStartedAt: number };

/** Lines the recordings up in wall-clock time and lays them out (re-run alone: `pnpm record --stitch`). */
function stitch({ videos, startedAt, audio, audioStartedAt }: Meta): void {
  const last = Math.max(...startedAt);
  const offsets = startedAt.map((t) => ((last - t) / 1000).toFixed(3));
  const audioOffset = ((audioStartedAt - last) / 1000).toFixed(3);
  const label = (i: number, text: string, h: number) =>
    `[${i}:v]scale=-2:${h},pad=iw+24:ih+64:12:64:color=0x0a2725,drawtext=fontfile='${FONT}':text='${text}':fontcolor=0xecd08a:fontsize=26:x=(w-tw)/2:y=18[p${i}]`;

  // TV | Jonathan | Juniper, with the TV's sound.
  const main3 = [0, 1, 2];
  execFileSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      ...main3.flatMap((i) => ["-ss", offsets[i] ?? "0", "-i", videos[i] ?? ""]),
      "-itsoffset", audioOffset, "-i", audio,
      "-filter_complex",
      `${label(0, "TV", 720)};${label(1, `${NAMES[0]} (host)`, 720)};${label(2, `${NAMES[1]}`, 720)};[p0][p1][p2]hstack=inputs=3:shortest=1,pad=ceil(iw/2)*2:ceil(ih/2)*2[out]`,
      "-map", "[out]", "-map", "3:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "21", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-shortest", OUT,
    ],
    { stdio: "inherit" },
  );
  // All four phones.
  const ph = [1, 2, 3, 4];
  execFileSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      ...ph.flatMap((i) => ["-ss", offsets[i] ?? "0", "-i", videos[i] ?? ""]),
      "-itsoffset", audioOffset, "-i", audio,
      "-filter_complex",
      `${ph.map((i, k) => label(k, NAMES[i - 1] ?? "", 844)).join(";")};[p0][p1][p2][p3]hstack=inputs=4:shortest=1,pad=ceil(iw/2)*2:ceil(ih/2)*2[out]`,
      "-map", "[out]", "-map", "4:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-r", "30", "-c:a", "aac", "-b:a", "128k", "-shortest", PHONES_OUT,
    ],
    { stdio: "inherit" },
  );
  // A quick look at 4× speed (no sound).
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", OUT, "-filter:v", "setpts=PTS/4", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", FAST_OUT], { stdio: "inherit" });
  // Contact sheet of the main video (one frame every 20 s).
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", OUT, "-vf", "fps=1/20,scale=640:-2,tile=4x6", "-frames:v", "1", `${MOMENTS}/contact-sheet.png`], { stdio: "inherit" });
  console.log(`Saved ${OUT}, ${PHONES_OUT}, ${FAST_OUT}`);
}

if (process.argv.includes("--stitch")) stitch(JSON.parse(readFileSync(`${RAW}/meta.json`, "utf8")) as Meta);
else main().catch((err) => {
  console.error(err);
  process.exit(1);
});
