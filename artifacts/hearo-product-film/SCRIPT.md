# Hearo — Product Film (16:9, 1920×1080, 113.0 s, 11 scenes)

Treatment: **Editorial lecture-notes × real-capture evidence.** Promise: Hearo checks what a learner *means* against the source, and shows its work. Identity: brand navy #1E3A8A / paper #F3F5F9 / cape red #DC2626 for "wrong" / gold #F59E0B for emphasis; Instrument Serif display, Inter (brand) body, JetBrains Mono for citations and disclosures. Hero: the real app footage. Motion: masked serif line reveals, strike-through rules, a slow camera push on the footage. Arc: navy hook → paper problem → navy turn → five real-capture demos → principles → pilot → navy close with the thumbs-up mascot.

All copy (on-screen text, narration, captions, CTA, placeholders) is in `src/components/video/content.ts`. Placeholders: `[Recipient company]`, `[Your name · Role]`, `[email@domain · meeting link]`.

| # | Key | Start–End (s) | On screen | Narration (VO starts +0.5 s; open +0.9 s) |
|---|---|---|---|---|
| 1 | open | 0.0–7.0 | Waving mascot inside listening rings; "Hearo" 30vmin serif; "Learn by explaining." | What if you could see what someone understands, just by hearing them explain it? |
| 2 | problem | 7.0–21.0 | "Reading feels like learning." / "Rereading." "Highlighting." struck in red / a learner's wrong note about caching, "automatically" underlined red | Reading a lecture feels like learning. But rereading and highlighting rarely show what a learner actually understands. A wrong idea can sit unnoticed until an exam exposes it. |
| 3 | opportunity | 21.0–29.5 | Navy. "Explain it." / "Check it." + thinking mascot | Explaining in your own words is where the gaps surface. The hard part is checking that explanation against the source. |
| 4 | reveal | 29.5–38.5 | clip1 (1×, 0.2–9.2 s): home → PDF "Source verified" → concept map | This is Hearo. A learner opens an approved source. Hearo verifies it, and prepares a map of its key concepts. |
| 5 | check | 38.5–53.5 | clip2: typing at 3×, then the live check, green Supported, citations S04-01..03 | The learner explains, aloud or by typing. Hearo stays silent, checks the meaning against the lecture, and marks the concept supported, citing the exact lines. |
| 6 | wrong | 53.5–66.5 | clip3: wrong sentence typed at 2×, ~26 s slow-AI wait cut, red Contradicted, Source vs You card | When an idea goes wrong, Hearo catches it. The source sits right beside the learner's own words, so the correction is concrete. |
| 7 | arabic | 66.5–75.5 | clip5: Arabic RTL typing at 3×, result at 1.4×, Load balancing Supported | Explanations in Arabic or English are checked against the same English source. |
| 8 | report | 75.5–83.5 | clip4 (1.3×): report, 16.7/100 local rubric, coverage 2/6, download | At the end, a report shows coverage and accuracy, ready to download. |
| 9 | diff | 83.5–94.5 | Three principles with crossfading real stills: Cites its source / Keeps AI apart / Never interrupts | Every verdict cites its source. AI notes are labeled apart from source text. And Hearo never interrupts. |
| 10 | pilot | 94.5–105.0 | "A focused pilot." + 4 proposed measures (coverage, accuracy, reliability, learner view); "Early working product · no outcome studies or customers yet" | Hearo is an early, working product. We'd like to propose a focused pilot, with success measures we define together. |
| 11 | close | 105.0–113.0 | Thumbs-up mascot, "Hearo", promise, "Let's book a 30-minute live demo.", contact placeholder | Hearo. Learn by explaining. Master by teaching. |

Every footage scene carries an on-screen disclosure of playback speed and any cut wait. Subtitles are generated from the narration, sentence by sentence, bottom-centre below the footage window.

## Audio spec
- Runtime 113 s. Music: ambient minimal piano + pads, 84 BPM, no vocals (`public/audio/bg_music.mp3`, mixed at 0.22, 3 s fade-out).
- Voiceover (requested): ElevenLabs "Frederick Surrey", eleven_multilingual_v2, files `public/audio/vo_<key>.mp3`.
- Playback file: `public/audio/composite_audio.mp3` (ffmpeg amix, VO delayed to each scene start + offset, normalize=0, -t 113).
- To change a line: edit `NARRATION` in content.ts, regenerate that vo file, update its `len`, and rebuild the composite.

## QA fix pass (render review)
- Captions now start at measured sentence boundaries (`cues` in content.ts, from ffmpeg silencedetect); proportional timing is only a fallback.
- Check (38.5 s) and wrong (53.5 s) scenes: a single push at 10.0 s scene time frames the feedback card centred (1.9× / 1.7×), with the left crop past the sidebar; earlier phases stay at full frame. Reveal/arabic/report pushes were re-offset so the sidebar is never cut mid-word.
- Diff: "Never interrupts" shows the full home still (contain, no crop); each principle gets a navy timing rule; all rows return to full strength at 8.6 s; a slow 1.035 push from 9.4 s.
- Opportunity and close: mascots sit near native size on an app-style pale tint disc with a gentle float, so the source art's visor detail reads as artwork on its own background; gold underline under "Check it." at 5.2 s.
- Pilot: gold rule draws from 6.6 s; measures are spotlighted one by one at 6.6 / 7.6 / 8.6 / 9.5 s.
