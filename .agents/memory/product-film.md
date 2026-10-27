---
name: Product film rendering and honesty
description: How the Hearo product film is rendered to MP4, where its docs live, and the disclosure rule for sped-up or cut footage.
---

The video artifact plays in the browser; the MP4 deliverable comes from a real-time headless-Chromium screencast that is re-timed onto the scene timeline, with the film's own pre-mixed soundtrack muxed in. Render docs live outside the artifact (docs/hearo-product-film, scripts/), and output goes to the gitignored generated-artifacts/.

**Why:** No frame-accurate export exists for the artifact. Capturing the browser's audio drifts, while the pre-mixed file matches the timeline exactly. The first captured frames are the blank page unless they are skipped after the film confirms its first paint.

**How to apply:**
- Keep other heavy work off the machine while rendering. Treat a longest unchanged stretch far above the film's deliberate holds (about 1.3 s) as a stalled capture, and render again.
- Every footage note must state the exact speed-up and every cut wait. Re-derive the notes from the clip segments whenever the segments change, because unstated cuts were caught in QA.
- Main-agent edits to the artifact are not allowed; send fixes to the design subagent as fix-only facts.
- Preview-pane exports land at the project root as large 60 fps files. Keep them out of Git.
