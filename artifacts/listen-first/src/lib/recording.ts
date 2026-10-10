export const MAX_RECORDING_MS = 10 * 60 * 1000;
export const MAX_RECORDING_BYTES = 25 * 1024 * 1024;
export const MAX_CAPTIONS = 2000;
export const MAX_CAPTION_FILE_BYTES = 1024 * 1024;

export type CaptionEntry = { atMs: number; text: string };
export type CaptionsFile = { schema: 'hearo-captured-captions-v1'; kind: 'captured_final_captions'; language: string; durationMs: number; audioSha256: string; captions: CaptionEntry[] };
export const DURATION_TOLERANCE_MS = 3000;
const HASH = /^[0-9a-f]{64}$/;

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const hashesMatch = (a: string, b: string) => HASH.test(a) && HASH.test(b) && a === b;

/** Size is checked before any bytes are read. Never throws. */
export async function readCaptionsFile(file: { size: number; text: () => Promise<string> }): Promise<CaptionsResult> {
  if (file.size > MAX_CAPTION_FILE_BYTES) return { ok: false, error: 'The captions file is larger than 1 MB.' };
  try { return validateCaptionsFile(await file.text()); }
  catch { return { ok: false, error: 'The captions file could not be read.' }; }
}

/** Media duration (seconds) must be sane and agree with the captions; Infinity (common for MediaRecorder output) cannot be checked. */
export function checkMediaDuration(mediaSeconds: number, captionsDurationMs: number): string | null {
  if (Number.isNaN(mediaSeconds) || mediaSeconds < 0) return 'The audio duration could not be read.';
  if (!Number.isFinite(mediaSeconds)) return null;
  if (mediaSeconds * 1000 > MAX_RECORDING_MS + DURATION_TOLERANCE_MS) return 'The audio is longer than the 10 minute limit.';
  if (Math.abs(mediaSeconds * 1000 - captionsDurationMs) > DURATION_TOLERANCE_MS) return 'The audio length does not match the captions file, so it is not the recording these captions belong to.';
  return null;
}

export function buildCaptionsFile(captions: CaptionEntry[], language: string, durationMs: number, audioSha256: string): CaptionsFile {
  return { schema: 'hearo-captured-captions-v1', kind: 'captured_final_captions', language, durationMs, audioSha256, captions };
}

export type CaptionsResult = { ok: true; value: CaptionsFile } | { ok: false; error: string };
export function validateCaptionsFile(raw: string): CaptionsResult {
  if (raw.length > MAX_CAPTION_FILE_BYTES) return { ok: false, error: 'The captions file is larger than 1 MB.' };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { ok: false, error: 'The captions file is not valid JSON.' }; }
  const f = data as Partial<CaptionsFile> | null;
  if (!f || typeof f !== 'object' || f.schema !== 'hearo-captured-captions-v1' || f.kind !== 'captured_final_captions') return { ok: false, error: 'This is not a Hearo captured-captions file.' };
  if (typeof f.language !== 'string' || f.language.length > 20) return { ok: false, error: 'The captions language is missing or invalid.' };
  if (!Number.isFinite(f.durationMs) || (f.durationMs as number) < 0 || (f.durationMs as number) > MAX_RECORDING_MS) return { ok: false, error: 'The recorded duration is missing or over the limit.' };
  if (typeof f.audioSha256 !== 'string' || !HASH.test(f.audioSha256)) return { ok: false, error: 'The captions file has no valid audio SHA-256, so it cannot be matched to an audio file.' };
  if (!Array.isArray(f.captions) || f.captions.length === 0) return { ok: false, error: 'The captions file has no captions, so there is nothing to replay.' };
  if (f.captions.length > MAX_CAPTIONS) return { ok: false, error: 'The captions file has too many entries.' };
  let last = -1;
  const captions: CaptionEntry[] = [];
  for (const entry of f.captions) {
    const c = entry as Partial<CaptionEntry>;
    if (!c || typeof c.text !== 'string' || !c.text.trim() || c.text.length > 4000
      || typeof c.atMs !== 'number' || !Number.isFinite(c.atMs) || c.atMs < 0 || c.atMs < last || c.atMs > (f.durationMs as number)) {
      return { ok: false, error: 'A caption entry is malformed or out of time order.' };
    }
    last = c.atMs;
    captions.push({ atMs: Math.round(c.atMs), text: c.text.trim() });
  }
  return { ok: true, value: { schema: 'hearo-captured-captions-v1', kind: 'captured_final_captions', language: f.language, durationMs: f.durationMs as number, audioSha256: f.audioSha256, captions } };
}

export function validateAudioFile(file: { size: number; type: string }): string | null {
  if (!file.type.startsWith('audio/') && file.type !== 'video/webm') return 'Choose an audio file recorded by Hearo.';
  if (file.size === 0) return 'The audio file is empty.';
  if (file.size > MAX_RECORDING_BYTES) return 'The audio file is larger than 25 MB.';
  return null;
}

/** Captions whose time has been reached and that were not appended before. Seeking back never repeats; seeking forward catches up. */
export function dueCaptions(captions: CaptionEntry[], appended: Set<number>, timeMs: number): number[] {
  const due: number[] = [];
  captions.forEach((c, i) => { if (c.atMs <= timeMs && !appended.has(i)) due.push(i); });
  return due;
}
