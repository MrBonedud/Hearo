// Captures the Arabic student journey in the running Hearo app for the Arabic product film.
//
//   mkdir -p /tmp/hv/ar && node scripts/film-footage/capture-arabic-journey.mjs
//
// Drives http://127.0.0.1:80/ (the listen-first workflow must be running) in headless Chromium with an
// Arabic (ar-JO) browser. The viewport is 2560x1440 with the page zoomed 1.6x, so the app lays out as on a
// 1600x900 screen while every screencast frame is 2560x1440 (screencast frames ignore deviceScaleFactor),
// letting the film crop into the interface without losing sharpness. Makes REAL, billed AI checks; a check that
// fails (e.g. provider overload) is logged, the app state is restored, and that clip is recorded again.
//
// Output (/tmp/hv/ar): <clip>/f*.jpg + <clip>/list.txt (ffconcat with real frame durations), stills *.png,
// capture-log.txt (timed marks per clip), evaluations.jsonl (raw /api/study/evaluate responses).
// Encode each clip with:
//   ffmpeg -f concat -safe 0 -i /tmp/hv/ar/<clip>/list.txt -vf "fps=30,scale=2560:1440,format=yuv420p" \
//     -c:v libx264 -crf 18 -preset slow -movflags +faststart <clip>.mp4
import fs from "node:fs";
import { chromium } from "/home/runner/workspace/artifacts/listen-first/node_modules/@playwright/test/index.mjs";

const APP = "http://127.0.0.1:80/";
const PDF = "/home/runner/workspace/.local/backups/hearo-sync-20261010T134553Z-857c9bc/approved-stanford-source.pdf";
const OUT = process.env.OUT ?? "/tmp/hv/ar";
const ONLY = process.argv.slice(2); // optional clip names to (re)record
fs.mkdirSync(OUT, { recursive: true });
const note = (m) => { console.log(m); fs.appendFileSync(`${OUT}/capture-log.txt`, `${new Date().toISOString()} ${m}\n`); };

// What the learner types. The correction replaces the wrong sentence after Hearo flags it.
const CORRECT = "موزّع الحمل يوزّع طلبات HTTP على خوادم أمامية متعددة، ويبقي حزم اتصال TCP الواحد على الخادم نفسه. ويمكن التوقف عن استخدام خادم يتعطل.";
const WRONG = " والتخزين المؤقت كمان بسرّع عمليات الكتابة تلقائيًا، فما في داعي نبعث الكتابة لقاعدة البيانات أبدًا.";
const FIXED = " بس التخزين المؤقت بيحفظ نتائج الاستعلامات الأخيرة، والكتابة لازم توصل لقاعدة البيانات فما بتتحسّن. ولما تتغيّر البيانات، لازم نمسح النتائج القديمة من الذاكرة المؤقتة.";

const CHECKED = /تحققنا من شرحك الحالي|Current explanation checked/;
const PAUSED = /وقّفنا التحقق بعد خطأ|paused after an error/;

const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium" });
const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1, locale: "ar-JO" });
await context.addInitScript(() => { const zoom = () => { document.documentElement.style.zoom = "1.6"; };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", zoom); else zoom(); });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
let evalFailed = false;
page.on("response", async (r) => {
  if (!r.url().endsWith("/api/study/evaluate")) return;
  const h = r.headers(); let body = null; try { body = await r.json(); } catch {}
  if (r.status() !== 200) evalFailed = true;
  const verdicts = body?.assessments?.map((a) => [a.conceptId, a.verdict, a.sourceLineIds]);
  note(`EVALUATE ${r.status()} checker=${h["x-hearo-checker"]} model=${h["x-hearo-model"]} fallback=${h["x-hearo-fallback"]} verdicts=${JSON.stringify(verdicts ?? null)}`);
  fs.appendFileSync(`${OUT}/evaluations.jsonl`, JSON.stringify({ status: r.status(), checker: h["x-hearo-checker"], model: h["x-hearo-model"], fallback: h["x-hearo-fallback"], body }) + "\n");
});

const wait = (ms) => page.waitForTimeout(ms);
const T = (id) => page.getByTestId(id);
const smooth = (sel, block = "center") => page.evaluate(([s, b]) => document.querySelector(s)?.scrollIntoView({ behavior: "smooth", block: b }), [sel, block]);
const still = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); note(`STILL ${name}.png`); };
async function waitChecked() {
  await page.waitForFunction(([a, b]) => { const t = document.querySelector("[data-testid=status-live-check]")?.textContent ?? ""; return new RegExp(a).test(t) || new RegExp(b).test(t); },
    [CHECKED.source, PAUSED.source], { timeout: 90000 });
  if (PAUSED.test(await T("status-live-check").innerText()) || evalFailed) throw new Error("live check failed");
}
async function setTranscript(text) { await T("input-transcript").fill(text); }
async function ensureChecked() { // unrecorded recovery through the app's own Retry button
  for (let i = 0; i < 8; i++) {
    try { evalFailed = false; await waitChecked(); return; } catch { note("recovery check failed; retrying in 20 s"); await wait(20000); await T("button-retry-live").click().catch(() => {}); }
  }
  throw new Error("could not get a successful check while restoring state");
}

// Records one clip: every screencast frame goes straight to disk with its timestamp.
async function record(name, steps) {
  const dir = `${OUT}/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const frames = []; const t0 = Date.now(); const marks = [];
  const mark = (m) => marks.push([((Date.now() - t0) / 1000).toFixed(1), m]);
  const onFrame = ({ data, metadata, sessionId }) => {
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    const file = `${dir}/f${String(frames.length).padStart(5, "0")}.jpg`;
    fs.writeFileSync(file, Buffer.from(data, "base64")); frames.push({ file, t: metadata.timestamp });
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 2560, maxHeight: 1440 });
  evalFailed = false; let ok = true;
  try { await steps(mark); } catch (e) { ok = false; note(`CLIP ${name} failed: ${e.message.split("\n")[0]}`); }
  await wait(300); await cdp.send("Page.stopScreencast"); cdp.off("Page.screencastFrame", onFrame);
  if (!ok) return false;
  let list = "ffconcat version 1.0\n";
  frames.forEach((f, i) => { const d = i < frames.length - 1 ? Math.max(0.001, frames[i + 1].t - f.t) : 0.5; list += `file '${f.file}'\nduration ${d.toFixed(4)}\n`; });
  list += `file '${frames.at(-1).file}'\n`; fs.writeFileSync(`${dir}/list.txt`, list);
  note(`CLIP ${name}: ${frames.length} frames, ${(frames.at(-1).t - frames[0].t).toFixed(1)} s; marks ${JSON.stringify(marks)}`);
  return true;
}
async function recordWithRetry(name, steps, restore) {
  if (ONLY.length && !ONLY.includes(name)) { note(`skip ${name}`); return; }
  for (let attempt = 1; attempt <= 6; attempt++) {
    if (await record(name, steps)) return;
    note(`${name}: attempt ${attempt} failed; restoring state in 20 s`); await wait(20000); await restore();
  }
  throw new Error(`${name} failed after retries`);
}

// ---- The journey ---------------------------------------------------------------------------------
await page.goto(APP); await T("screen-landing").waitFor(); await wait(2000);
await still("ar-01-home");

await recordWithRetry("ar-clip1-prepare", async (mark) => {
  await wait(1500); mark("home hero");
  await T("button-start-live").first().click(); mark("start a live study"); await wait(2000);
  await T("input-file").setInputFiles(PDF); mark("approved PDF chosen");
  await T("status-source-verified").waitFor(); mark("source verified");
  await smooth("[data-testid=status-source-verified]"); await wait(2500); await still("ar-02-source-verified");
  await T("button-prepare").click(); mark("prepare");
  await T("input-transcript").waitFor(); await wait(2500); mark("session: concept map, nothing assessed");
  await still("ar-03-session-empty");
}, async () => { await page.goto(APP); await T("screen-landing").waitFor(); });

const assessed = (id) => `[data-testid=assessment-${id}]`;
await recordWithRetry("ar-clip2-explain-supported", async (mark) => {
  await smooth("[data-testid=input-transcript]"); await wait(1200);
  await T("input-transcript").click(); mark("typing starts");
  await T("input-transcript").pressSequentially(CORRECT, { delay: 40 }); mark("typing ends; silent pause");
  await waitChecked(); mark("check returned"); await wait(1200);
  await smooth("[data-testid=panel-study-map]", "start"); await wait(2800); mark("map: load balancing supported"); await still("ar-04-map-supported");
  await smooth(assessed("load-balancing")); await wait(2200); mark("feedback card");
  await page.evaluate((s) => { const d = document.querySelector(`${s} details`); if (d) d.open = true; }, assessed("load-balancing")); await wait(700);
  await smooth(`${assessed("load-balancing")} details`); await wait(2800); mark("citations open"); await still("ar-05-supported-citations");
}, async () => { await setTranscript(""); await wait(3000); });

await wait(3000);
await recordWithRetry("ar-clip3-gap-review", async (mark) => {
  await smooth("[data-testid=input-transcript]"); await wait(1200);
  await T("input-transcript").click(); await page.keyboard.press("Control+End"); mark("typing wrong claim");
  await T("input-transcript").pressSequentially(WRONG, { delay: 40 }); mark("typing ends; silent pause");
  await waitChecked(); mark("check returned"); await wait(1200);
  await smooth("[data-testid=panel-study-map]", "start"); await wait(2800); mark("map: caching flagged"); await still("ar-06-map-review");
  await smooth(assessed("caching")); await wait(3500); mark("review card: source vs you, practice prompt"); await still("ar-07-review-card");
}, async () => { await setTranscript(CORRECT); await T("button-retry-live").click().catch(() => {}); await ensureChecked(); await wait(3000); });

await wait(3000);
await recordWithRetry("ar-clip4-revise-supported", async (mark) => {
  await smooth(assessed("caching")); await wait(1500);
  await T("button-practice-caching").first().click(); mark("try explaining it again"); await wait(1500);
  const value = await T("input-transcript").inputValue();
  const start = value.indexOf(WRONG.trim());
  if (start < 0) throw new Error("wrong sentence not found in transcript");
  await page.evaluate(([s, e]) => { const el = document.querySelector("[data-testid=input-transcript]"); el.focus(); el.setSelectionRange(s, e); }, [start, start + WRONG.trim().length]);
  mark("wrong sentence selected"); await wait(1500);
  await T("input-transcript").pressSequentially(FIXED.trim(), { delay: 40 }); mark("typing correction ends; silent pause");
  await waitChecked(); mark("check returned"); await wait(1200);
  await smooth("[data-testid=panel-study-map]", "start"); await wait(2800); mark("map after correction"); await still("ar-08-map-revised");
  await smooth(assessed("caching")); await wait(3000); mark("caching card after correction"); await still("ar-09-revised-card");
}, async () => { await setTranscript(CORRECT + WRONG); await T("button-retry-live").click().catch(() => {}); await ensureChecked(); await wait(3000); });

await wait(3000);
await recordWithRetry("ar-clip5-report", async (mark) => {
  await smooth("[data-testid=button-finish]"); await wait(1200);
  await T("button-finish").click(); mark("finish & see report");
  await T("card-report-score").waitFor({ timeout: 90000 }); mark("report shown"); await wait(2800); await still("ar-10-report-top");
  await page.evaluate(() => window.scrollBy({ top: 650, behavior: "smooth" })); await wait(2800); mark("report sections"); await still("ar-11-report-sections");
  await smooth("[data-testid=button-download-report]"); await wait(2800); mark("download report"); await still("ar-12-report-download");
}, async () => { await T("button-back-review").click().catch(() => {}); await wait(2000); });

note("journey complete");
await browser.close();
