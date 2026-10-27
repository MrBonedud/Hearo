# Hearo product film: QA report

Checked on 27 October 2026 against the final render `generated-artifacts/hearo-product-film/hearo-product-film-1080p.mp4`.

## The file

| Check | Result |
|---|---|
| Container | MP4 with fast start (it can begin playing before it has fully downloaded) |
| Size | 39.9 MB |
| Duration | 113.00 s |
| Video | H.264 High, yuv420p, 1920×1080, constant 30 fps, 3,390 frames, about 2.6 Mbit/s |
| Audio | AAC-LC, 48 kHz stereo, about 196 kbit/s |
| Full decode | Decodes from start to end with no errors (`ffmpeg -v error -i … -f null -`) |
| Loudness | −16.0 LUFS integrated, 6.0 LU loudness range, true peak −1.3 dBFS. The unprocessed mix was −23 LUFS, which is quiet on laptops. |
| Blank frames | None. The opening frame is the film's own dark-navy fade-in. Earlier renders opened on 4–8 white frames from the page loading, and the render script now skips them. |

## How the render was made and checked

- **Capture method:** the film is a web page, so the render script plays it in headless Chromium in real time and records every painted frame.
- **Final capture:**
  - 4,307 distinct frames over 113.2 s.
  - The longest stretch without a new frame was 1.31 s, which is a deliberate hold in the film.
  - Timer drift at scene boundaries was at most 177 ms, and it was corrected so that every scene starts exactly on its planned time.
  - No page errors, failed requests or console errors were logged during capture.
- **Audio:** the soundtrack is the film's own pre-mixed file, not a recording of the browser. Voice-over placement therefore matches the planned timeline exactly.
- **Frames inspected:**
  - A contact sheet with the middle frame of every scene.
  - Every scene boundary.
  - The first and last frames, and the middle of the film.
  - Spot frames at 26, 36, 45, 49.5, 52, 64.5, 72, 88, 91, 103 and 108.5 s.
  - Full-resolution crops of the footage notes.
- **The listed checks pass:** film typecheck, recording-lifecycle validation, a clean dev-server log, and a clean browser console.

## Defects found and fixed during QA

| Found | Fix | Verified in render |
|---|---|---|
| The home-screen still at about 91 s was cropped mid-word | The full screenshot is shown, scaled to fit | Yes |
| Camera pushes at about 49 s and 64 s cut sidebar words and left an empty column | One later push that centres the feedback card | Yes |
| Captions started up to about 0.5 s before the matching speech | Caption changes now use sentence starts measured from the voice-over files | Placement checked; not checked by ear |
| The thinking and thumbs-up mascots were blown up about 1.9× from small source art and looked soft | Shown near native size on a pale disc | Yes |
| Long stretches where nothing changed (25.6–27.9, 87.9–94.8, 100.7–105.3 s) | Small timed accents added. The longest unchanged stretch fell from 3.3 s to 1.3 s. | Yes |
| The footage notes for scenes 5 and 7 did not mention cut waits (6.6 s and 13.7 s), and scene 4 was labelled "normal speed" while playing at 1.05× | The notes now state the cut waits, and scene 4 now really plays at 1× | Yes (crops) |
| The call to action and most on-screen text were hard-coded in the scene files | All copy moved into `content.ts`; the output is unchanged | Yes |
| White frames at the very start | The render script skips frames painted before the film | Yes |

## Accuracy and honesty

- **Footage:** every product shot is a real recording or still from the running app at 1920×1080, driven by browser automation. No interface was redrawn.
- **Live results:** the verdicts in scenes 5–7 are live AI responses. The raw responses are stored in `attached_assets/hearo-footage/evaluations.jsonl`.
- **Speed changes and cuts:** each footage scene says on screen how much it was sped up and how much waiting was cut.
  - The longest cut is about 25 s in scene 6, during a slow AI response.
  - A typical successful check took 6–8 s end to end during capture.
- **No invented business facts:** the film contains no metrics, customers, testimonials, partner logos or market figures. The pilot scene says "Early working product · no outcome studies or customers yet", and its measures are labelled as proposals.
- **Report score:** the 16.7/100 score shown is the app's local rubric. The film labels it "not an academic grade".
- **No private information visible:** no browser chrome, URLs, keys, personal data or error screens appear.

## Limitations and open items

1. **Placeholders must be filled in before sending:**
   - `[Recipient company]`, `[Your name · Role]` and `[email@domain · meeting link]`.
   - The call to action ("Let's book a 30-minute live demo.") is an assumption.
   - All of these are in `content.ts`.
2. **Speech input was not shown working with a real microphone.** Every explanation in the footage was typed. Typing is a supported input, and the narration says "aloud or by typing", but no microphone was available for capture.
3. **One source only.** The live study accepts only the approved lecture PDF, so the film shows one course.
4. **AI provider reliability.**
   - The OpenAI key configured in this project returns HTTP 401 (unauthorised).
   - The app fell back to Gemini (`gemini-3.1-flash-lite`), which returned "overloaded" (503) for 6 of 12 attempts during capture. Failed takes were retried and not used.
   - Fix the OpenAI key before any live demo.
5. **Guided sample:** the app's guided sample uses prewritten feedback and is not shown in the film.
6. **The voice-over is synthetic** (ElevenLabs). Levels and timing were measured, but the narration was not reviewed by ear in this environment. Listen through once before sending.
7. **Captions:** the caption changes in the closing line ("Hearo. Learn by explaining. Master by teaching.") are timed by text length, not measured. Because the render is real-time, events inside a scene can land up to about 0.2 s off the plan.
8. **Phone screens:** the film was checked at 1920×1080. On a phone, the text inside the app footage is small. Captions and side notes stay readable, and the key cards get camera push-ins.
9. **Mascot artwork:** the app's mascot images have low resolution and small checkerboard patches in the visor. The opening's waving mascot is still enlarged about 2.4× and looks slightly soft.
10. **Superseded export:** `Listen-First-Learning-Oct-27-14-44-17.mp4` (87.6 MB, 60 fps) at the project root is a preview-pane export of an earlier, pre-QA version. It is not the deliverable. It should be deleted or moved into `generated-artifacts/` so it does not end up in Git.
11. **Other packages, not caused by this work:**
    - The typechecks for the pitch deck (`artifacts/hearo-pitch`, `ImportedChart.tsx`) and the canvas sandbox (duplicate Vite types) already failed.
    - The app (`artifacts/listen-first`), API server, film and scripts typecheck cleanly.
    - The app's home page loads normally in the preview.
