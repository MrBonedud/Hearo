// Rebuilds the Hearo product film's soundtrack (public/audio/composite_audio.mp3) from the music bed
// and the per-scene voice-over files, using the scene durations and voice-over offsets in content.ts.
// Run it after replacing a vo_<scene>.mp3 file or changing SCENE_DURATIONS / NARRATION start times.
//
//   node scripts/build-film-soundtrack.mjs            # writes composite_audio.mp3
//   node scripts/build-film-soundtrack.mjs --check    # writes to /tmp and compares with the current file
//
// Mix: music bed at 0.22 with a 3 s fade-out, each voice-over at full level starting at
// (scene start + NARRATION[scene].start), no automatic normalisation, trimmed to the film length.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const FILM = join(ROOT, "artifacts/hearo-product-film");
const AUDIO = join(FILM, "public/audio");
const check = process.argv.includes("--check");
const OUT = check ? "/tmp/composite_audio.check.mp3" : join(AUDIO, "composite_audio.mp3");
const MUSIC_LEVEL = 0.22;
const FADE_S = 3;

const content = readFileSync(join(FILM, "src/components/video/content.ts"), "utf8");
const durBlock = content.match(/export const SCENE_DURATIONS = \{([\s\S]*?)\};/)?.[1];
const narBlock = content.match(/export const NARRATION[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
if (!durBlock || !narBlock) throw new Error("SCENE_DURATIONS or NARRATION not found in content.ts");
const scenes = [...durBlock.matchAll(/(\w+):\s*(\d+)/g)].map(([, key, ms]) => ({ key, ms: Number(ms) }));
const offsets = Object.fromEntries([...narBlock.matchAll(/(\w+):\s*\{\s*start:\s*(\d+)/g)].map(([, key, ms]) => [key, Number(ms)]));
const totalS = scenes.reduce((a, s) => a + s.ms, 0) / 1000;

const inputs = ["-i", join(AUDIO, "bg_music.mp3")];
const chains = [`[0:a]volume=${MUSIC_LEVEL},afade=t=out:st=${(totalS - FADE_S).toFixed(3)}:d=${FADE_S},atrim=0:${totalS}[m]`];
const labels = ["[m]"];
let sceneStart = 0;
for (const s of scenes) {
  const vo = join(AUDIO, `vo_${s.key}.mp3`);
  if (existsSync(vo) && offsets[s.key] !== undefined) {
    const at = sceneStart + offsets[s.key];
    const n = labels.length;
    inputs.push("-i", vo);
    chains.push(`[${n}:a]adelay=${at}|${at}[v${n}]`);
    labels.push(`[v${n}]`);
  } else {
    console.warn(`no voice-over for scene "${s.key}"`);
  }
  sceneStart += s.ms;
}
const graph = `${chains.join(";")};${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=first[out]`;
const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[out]",
  "-t", totalS.toFixed(3), "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "192k", OUT], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`wrote ${OUT} (${totalS.toFixed(1)} s, ${labels.length - 1} voice-over files)`);

if (check) {
  // Null test: subtract the rebuilt mix from the current one and report the residual level.
  const current = join(AUDIO, "composite_audio.mp3");
  if (readFileSync(current).equals(readFileSync(OUT))) { console.log("identical to the current composite_audio.mp3"); process.exit(0); }
  const diff = spawnSync("ffmpeg", ["-hide_banner", "-i", current, "-i", OUT, "-filter_complex",
    "[1:a]volume=-1[n];[0:a][n]amix=inputs=2:normalize=0,volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const level = (re) => diff.match(re)?.[1];
  const ref = spawnSync("ffmpeg", ["-hide_banner", "-i", current, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  console.log(`current mix mean ${ref.match(/mean_volume: ([-\d.]+) dB/)?.[1]} dB; difference mean ${level(/mean_volume: ([-\d.]+) dB/)} dB, peak ${level(/max_volume: ([-\d.]+) dB/)} dB`);
}
