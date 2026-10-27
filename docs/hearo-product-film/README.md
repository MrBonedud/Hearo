# Hearo product film

This is a company-ready product film for Hearo, built from real recordings of the running app.

| | |
|---|---|
| Length | 113.0 s |
| Picture | 16:9 at 1920×1080, 30 fps |
| Audio | English synthetic voice-over and an instrumental music bed |
| Captions | Burned in |
| Scenes | 11 (the brief's 9 beats; the problem and the demo are split across more than one scene) |

## Where everything is

| What | Where |
|---|---|
| **Rendered video** | `generated-artifacts/hearo-product-film/hearo-product-film-1080p.mp4` |
| Contact sheet (the middle frame of every scene) | `generated-artifacts/hearo-product-film/hearo-product-film-1080p-contact-sheet.jpg` |
| Editable source (React + Framer Motion) | `artifacts/hearo-product-film/` |
| All on-screen text, narration, captions, scene lengths, placeholders and the call to action | `artifacts/hearo-product-film/src/components/video/content.ts` |
| Scene layouts and animation | `artifacts/hearo-product-film/src/components/video/scenes/` |
| Footage, stills, mascot art, audio used by the film | `artifacts/hearo-product-film/public/` |
| Original recordings, capture log and the raw AI responses behind them | `attached_assets/hearo-footage/` (start with `MANIFEST.md`) |
| Narration script | [NARRATION.md](NARRATION.md) |
| Timestamped storyboard | [STORYBOARD.md](STORYBOARD.md) |
| Quality report and limitations | [QA-REPORT.md](QA-REPORT.md) |
| Director's notes | `artifacts/hearo-product-film/SCRIPT.md` |
| Render tool | `scripts/render-product-film.mjs` |
| Soundtrack tool | `scripts/build-film-soundtrack.mjs` |
| Footage capture scripts (reference) | `scripts/film-footage/` |

`generated-artifacts/` is kept out of Git and out of deployments. Download the MP4 when you need to share it: in the Files pane, open `generated-artifacts/hearo-product-film/`, right-click the MP4, and choose **Download**. You can rebuild it at any time with the render command below.

## Before you send it

The recipient and the next step are not known, so the film uses marked placeholders. Replace them in `content.ts`, then render again:

| Placeholder | Where it appears | Current value |
|---|---|---|
| `PLACEHOLDERS.recipient` | Pilot scene, 94.5–105 s | `[Recipient company]` |
| `PLACEHOLDERS.sender` | Closing card, 105–113 s | `[Your name · Role]` |
| `PLACEHOLDERS.contact` | Closing card | `[email@domain · meeting link]` |
| `CTA` | Closing card | `Let's book a 30-minute live demo.` This is an assumption; change it to the real next step. |

Only add contact details or links that you have checked.

## Preview

- **Preview pane:** choose **Hearo — Product Film** (path `/hearo-product-film/`). The film plays and loops. The controls under it let you pause, jump to a scene, loop one scene, and mute. Browsers may need one click before sound plays.
- **Dev server:** the dev server runs in the workflow `artifacts/hearo-product-film: web` (`pnpm --filter @workspace/hearo-product-film run dev`). Saved edits appear in the preview right away.

The preview is not the deliverable; the rendered MP4 is.

## Edit

### Change on-screen text, placeholders or the call to action

Edit `content.ts`. Each scene's text is under `COPY.<scene>`. Rich text is a list of segments, for example `['Coverage ', { t: '2/6', b: true }]`, for bold, colour, monospace or Arabic spans.

Keep the footage notes (`COPY.<scene>.disclosure`) accurate. Each note must say how much the clip was sped up and how much waiting was cut.

### Change a narration line

1. Edit the line in `NARRATION` in `content.ts`. The subtitles come from this text.
2. Make a new `artifacts/hearo-product-film/public/audio/vo_<scene>.mp3`. Either ask the Agent to regenerate it with the same voice (ElevenLabs "Frederick Surrey", `eleven_multilingual_v2`), or record your own MP3.
3. Set `len` to the new file's length in milliseconds:
   ```
   ffprobe -v error -show_entries format=duration -of csv=p=0 <file>
   ```
4. Set `cues` to the second at which each sentence starts inside the file. If you delete `cues`, the captions are timed by text length instead.
5. Keep `start + len` shorter than the scene's length in `SCENE_DURATIONS`.
6. Rebuild the soundtrack:
   ```
   pnpm --filter @workspace/scripts run film:soundtrack
   ```
   Add `-- --check` to compare against the current file without overwriting it.

### Change scene lengths

1. Edit `SCENE_DURATIONS` (milliseconds).
2. Check the event times for that scene in `scenes/*.tsx`. Notes, camera moves and footage segments are timed from the start of the scene.
3. Rebuild the soundtrack.

### Replace footage or music

- **Footage:** replace a file in `public/footage/` with a 1920×1080 file of the same name. Then update that scene's `segments` (source times and speed) in `scenes/DemoScenes.tsx` and its disclosure note.
- **Music:** replace `public/audio/bg_music.mp3` with a file at least 113 s long, then rebuild the soundtrack.

### Check your edits

```
pnpm --filter @workspace/hearo-product-film run typecheck
bash artifacts/hearo-product-film/scripts/validate-recording.sh
```

Do not edit `src/lib/video/` or `.replit-artifact/`. They are the playback and export scaffold.

## Render the MP4

```
pnpm --filter @workspace/scripts run film:render
```

This takes about 4 minutes. The script:

1. Builds the film into `generated-artifacts/hearo-product-film/site`.
2. Serves the build locally.
3. Plays it once in headless Chromium in real time, capturing every painted frame.
4. Lines the frames up with the scene timeline in `content.ts`, correcting timer drift at each scene boundary.
5. Encodes H.264 at 30 fps (CRF 18), with the film's own soundtrack normalised to −16 LUFS integrated and −1.5 dBTP true peak.
6. Writes the contact sheet.

The last line of output gives the resolution, frame rate, frame count, duration and size. Check it and the contact sheet.

**Requirements.** `ffmpeg`/`ffprobe`, Chromium at `/repl/tools/bin/chromium` (override with `CHROMIUM_PATH`), and the Playwright copy installed for `artifacts/listen-first`. Nothing in the app or the film source is changed.

**Options.**
- `OUT=path/to/file.mp4` writes the video somewhere else.
- `--keep-frames` keeps the captured frames.

**Because the capture runs in real time, avoid other heavy work while it renders.** The script prints the longest stretch without a new frame. On this machine it is about 1.3 s, which is a deliberate hold in the film. A much larger number means the capture stalled, and you should render again.

**Alternative.** The preview pane's own export also produces an MP4 (60 fps, larger file). The file `Listen-First-Learning-Oct-27-14-44-17.mp4` at the project root is one of those exports. It was made from an earlier version of this film, before the quality fixes, so do not send it.

## Re-capture the footage (optional)

The clips in `attached_assets/hearo-footage/` were recorded by driving the real app with headless Chromium at 1920×1080. Re-capturing needs:

- **A running app:** the `artifacts/listen-first: web` workflow.
- **The approved lecture PDF:** the path is set at the top of each script.
- **A working AI provider:** each pass makes several real, billed checks.

```
mkdir -p /tmp/hv/out
node scripts/film-footage/capture-pass1.mjs   # stills, clip1, clip2, clip5
node scripts/film-footage/capture-pass2.mjs   # clip3, clip4 (retries when the AI provider is overloaded)
```

Each clip is saved as frames plus `/tmp/hv/out/<clip>/list.txt`. Encode each one like this:

```
ffmpeg -f concat -safe 0 -i /tmp/hv/out/<clip>/list.txt -vf "fps=30,scale=1920:1080,format=yuv420p" \
  -c:v libx264 -crf 19 -movflags +faststart <clip>.mp4
```

Then copy the clips into `attached_assets/hearo-footage/` and `artifacts/hearo-product-film/public/footage/`. Update `MANIFEST.md`, and update the scene `segments` and disclosure notes to match the new timings.
