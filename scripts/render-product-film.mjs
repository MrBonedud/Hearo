// Renders the Hearo product film (artifacts/hearo-product-film) to a 1920x1080 30 fps MP4.
//
// How it works: builds the film, serves the build locally, plays it once in headless Chromium in
// real time while capturing every painted frame (Chrome DevTools screencast), then re-times the
// frames onto the film's nominal scene timeline and muxes the film's own pre-mixed soundtrack.
//
//   node scripts/render-product-film.mjs                 # full render
//   node scripts/render-product-film.mjs --keep-frames   # keep the captured JPEG frames
//   OUT=generated-artifacts/x.mp4 node scripts/render-product-film.mjs
//
// Needs: ffmpeg/ffprobe on PATH, Chromium (CHROMIUM_PATH, default /repl/tools/bin/chromium) and
// Playwright (the copy installed for artifacts/listen-first). Nothing in the film artifact is changed.
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import http from "node:http";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const FILM = join(ROOT, "artifacts/hearo-product-film");
const WORK = join(ROOT, "generated-artifacts/hearo-product-film");
const SITE = join(WORK, "site");
const FRAMES = join(WORK, "frames");
const OUT = resolve(ROOT, process.env.OUT ?? join(WORK, "hearo-product-film-1080p.mp4"));
const BASE = "/hearo-product-film/";
const FPS = 30;
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium";
const keepFrames = process.argv.includes("--keep-frames");
const log = (m) => console.log(`[render] ${m}`);
const fail = (m) => { console.error(`[render] FAILED: ${m}`); process.exit(1); };

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: opts.capture ? "pipe" : "inherit", encoding: "utf8", ...opts });
  if (r.status !== 0) fail(`${cmd} ${args.slice(0, 4).join(" ")} … exited ${r.status}\n${r.stderr ?? ""}`);
  return r.stdout ?? "";
}

// 1. Scene durations straight from the film's source of truth.
const content = readFileSync(join(FILM, "src/components/video/content.ts"), "utf8");
const block = content.match(/export const SCENE_DURATIONS = \{([\s\S]*?)\};/);
if (!block) fail("could not find SCENE_DURATIONS in content.ts");
const scenes = [...block[1].matchAll(/(\w+):\s*(\d+)/g)].map(([, key, ms]) => ({ key, ms: Number(ms) }));
const nominalStarts = scenes.reduce((a, s) => [...a, a.at(-1) + s.ms], [0]); // ms, length = scenes + 1
const totalMs = nominalStarts.at(-1);
log(`${scenes.length} scenes, ${(totalMs / 1000).toFixed(1)} s`);

// 2. Production build of the film into generated-artifacts.
mkdirSync(WORK, { recursive: true });
log("building the film");
run("pnpm", ["exec", "vite", "build", "--outDir", SITE, "--emptyOutDir", "--logLevel", "warn"], {
  cwd: FILM, env: { ...process.env, PORT: "4173", BASE_PATH: BASE, NODE_ENV: "production" },
});

// 3. Minimal static server (with byte ranges so media elements behave as in production).
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".woff2": "font/woff2", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!path.startsWith(BASE)) { res.writeHead(404).end(); return; }
  let file = join(SITE, path.slice(BASE.length));
  if (!file.startsWith(SITE) || !existsSync(file) || statSync(file).isDirectory()) file = join(SITE, "index.html");
  const size = statSync(file).size;
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": size });
    createReadStream(file).pipe(res);
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}${BASE}`;

// 4. Real-time capture in headless Chromium.
const pw = join(ROOT, "artifacts/listen-first/node_modules/@playwright/test/index.mjs");
const { chromium } = await import(pathToFileURL(pw).href);
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const events = [];
let stopped; const stoppedP = new Promise((r) => (stopped = r));
await ctx.exposeBinding("__rec", (_src, ev, t, extra) => { events.push({ ev, t, extra }); if (ev === "stop") stopped(); });
// The film calls window.startRecording() on mount and window.stopRecording() after the last scene.
// Long timers are logged so the real scene boundaries can be matched to the nominal ones.
await ctx.addInitScript(() => {
  window.startRecording = async () => {
    window.__rec("start", Date.now());
    // Two animation frames later the film's first frame has been painted; anything earlier is the blank page.
    requestAnimationFrame(() => requestAnimationFrame(() => window.__rec("painted", Date.now())));
  };
  window.stopRecording = () => { window.__rec("stop", Date.now()); };
  const original = window.setTimeout.bind(window);
  window.setTimeout = (fn, delay, ...rest) => {
    if (typeof fn === "function" && typeof delay === "number" && delay >= 1000) {
      return original((...a) => { window.__rec("timer", Date.now(), delay); return fn(...a); }, delay, ...rest);
    }
    return original(fn, delay, ...rest);
  };
});
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });

log("warming fonts and media");
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => /\.(mp3|mp4|png|jpg)$/.test(u));
  const extra = ["audio/composite_audio.mp3"].map((a) => new URL(a, document.baseURI).href);
  await Promise.all([...new Set([...urls, ...extra])].map((u) => fetch(u).then((r) => r.arrayBuffer())));
  await document.fonts.ready;
});
await page.goto("about:blank");
events.length = 0;

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const cdp = await ctx.newCDPSession(page);
const frames = []; const writes = [];
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  const file = join(FRAMES, `f${String(frames.length).padStart(6, "0")}.jpg`);
  frames.push({ file, t: metadata.timestamp * 1000 });
  writes.push(writeFile(file, Buffer.from(data, "base64")));
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080 });
log(`recording ${url} in real time (~${Math.ceil(totalMs / 1000)} s)`);
await page.goto(url, { waitUntil: "commit" });
const guard = setTimeout(() => { problems.push("stopRecording was never called; stopped by timeout"); stopped(); }, totalMs + 20000);
await stoppedP; clearTimeout(guard);
await page.waitForTimeout(300);
await cdp.send("Page.stopScreencast");
await Promise.all(writes);
await browser.close();
server.close();

const start = events.find((e) => e.ev === "start")?.t;
const stop = events.find((e) => e.ev === "stop")?.t ?? start + totalMs;
if (start === undefined) fail("the film never called startRecording()");

// 5. Match real scene boundaries (setTimeout drift) to nominal ones, then re-time every frame.
const timers = events.filter((e) => e.ev === "timer");
const actual = [0];
let cursor = 0;
for (const s of scenes) {
  const hit = timers.find((e) => e.t - start >= cursor && e.extra === s.ms);
  if (!hit) { actual.length = 0; break; }
  cursor = hit.t - start; actual.push(cursor);
}
let mapTime = (t) => t;
if (actual.length === scenes.length + 1) {
  mapTime = (t) => {
    let k = 0; while (k < scenes.length - 1 && t >= actual[k + 1]) k++;
    return nominalStarts[k] + ((t - actual[k]) / (actual[k + 1] - actual[k])) * (nominalStarts[k + 1] - nominalStarts[k]);
  };
  log(`scene drift corrected: max ${Math.max(...actual.map((a, i) => Math.abs(a - nominalStarts[i]))).toFixed(0)} ms`);
} else {
  problems.push("could not match scene boundaries; frames kept on wall-clock time");
}

const rel = frames.map((f) => ({ file: f.file, t: f.t - start }));
// The film mounts (t=0) shortly before its first frame is painted; frames before that are the blank
// page, so the first frame captured after the film has painted is held from t=0 (no white flash).
const painted = events.find((e) => e.ev === "painted")?.t;
if (painted === undefined) problems.push("no paint confirmation after startRecording; the first frames may show the blank page");
const firstIdx = rel.findIndex((f) => f.t >= (painted === undefined ? 0 : painted - start));
if (firstIdx < 0) fail("no frames were captured after the film started");
const used = rel.slice(firstIdx).filter((f) => f.t <= stop - start);
log(`first film frame captured ${used[0].t.toFixed(0)} ms after mount (held from 0 s)`);
used[0] = { ...used[0], t: 0 };
const times = used.map((f) => Math.min(totalMs, Math.max(0, mapTime(f.t))));
let list = "ffconcat version 1.0\n";
let maxGap = 0;
used.forEach((f, i) => {
  const next = i < used.length - 1 ? times[i + 1] : totalMs;
  const d = Math.max(0, next - times[i]);
  maxGap = Math.max(maxGap, d);
  if (d > 0) list += `file '${f.file}'\nduration ${(d / 1000).toFixed(5)}\n`;
});
list += `file '${used.at(-1).file}'\n`;
writeFileSync(join(WORK, "frames.ffconcat"), list);
writeFileSync(join(WORK, "capture.json"), JSON.stringify({ url, start, stop, actualSceneStartsMs: actual, nominalSceneStartsMs: nominalStarts, frames: used.length, problems }, null, 1));
log(`${used.length} unique frames over ${((stop - start) / 1000).toFixed(2)} s (longest unchanged stretch ${(maxGap / 1000).toFixed(2)} s)`);

// 6. Encode: constant 30 fps H.264 + the film's own soundtrack, loudness-normalised for laptop/web
//    playback (two-pass EBU R128 loudnorm to -16 LUFS integrated, -1.5 dBTP; the mix itself is unchanged).
const audio = join(SITE, "audio/composite_audio.mp3");
const LOUDNESS = "I=-16:TP=-1.5:LRA=11";
const measureOut = spawnSync("ffmpeg", ["-hide_banner", "-i", audio, "-af", `loudnorm=${LOUDNESS}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
const m = JSON.parse(measureOut.slice(measureOut.lastIndexOf("{"), measureOut.lastIndexOf("}") + 1));
const loudnorm = `loudnorm=${LOUDNESS}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
log(`soundtrack measured ${m.input_i} LUFS → normalising to -16 LUFS`);
mkdirSync(resolve(OUT, ".."), { recursive: true });
log(`encoding ${OUT}`);
run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(WORK, "frames.ffconcat"), "-i", audio,
  "-map", "0:v", "-map", "1:a", "-vf", `fps=${FPS},scale=1920:1080:flags=lanczos,format=yuv420p`,
  "-af", `${loudnorm},aresample=48000`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-g", String(FPS * 2),
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", (totalMs / 1000).toFixed(3), "-movflags", "+faststart", OUT]);

// 7. Evidence: one frame from the middle of every scene, tiled into a contact sheet.
const SHEET = OUT.replace(/\.mp4$/, "-contact-sheet.jpg");
const mids = scenes.map((s, i) => (nominalStarts[i] + s.ms / 2) / 1000);
const tiles = mids.map((t) => `gte(t,${t.toFixed(3)})*lt(t,${(t + 1 / FPS).toFixed(3)})`).join("+");
run("ffmpeg", ["-y", "-loglevel", "error", "-i", OUT, "-vf", `select='${tiles}',scale=640:360,tile=4x3`, "-frames:v", "1", "-fps_mode", "passthrough", SHEET]);
log(`contact sheet (mid-point of each scene): ${SHEET}`);

const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames",
  "-of", "json", OUT], { capture: true }));
const v = probe.streams.find((s) => s.codec_type === "video");
const a = probe.streams.find((s) => s.codec_type === "audio");
log(`done: ${v.width}x${v.height} ${v.codec_name} ${v.r_frame_rate} fps, ${v.nb_frames} frames, audio ${a?.codec_name ?? "none"}, ` +
  `${Number(probe.format.duration).toFixed(2)} s, ${(Number(probe.format.size) / 1e6).toFixed(1)} MB`);
if (problems.length) log(`capture warnings:\n  ${problems.join("\n  ")}`);
if (!keepFrames) rmSync(FRAMES, { recursive: true, force: true });
