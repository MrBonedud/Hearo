# Hearo product film: narration script

- **Language:** English.
- **Voice:** synthetic voice-over, ElevenLabs "Frederick Surrey", model `eleven_multilingual_v2`.
- **Length:** 11 lines, about 88 s of speech in a 113 s film.
- **Source of truth:** `NARRATION` in `artifacts/hearo-product-film/src/components/video/content.ts`. Edit the text there. The film builds its subtitles from that text, sentence by sentence.
- **Audio files:** `artifacts/hearo-product-film/public/audio/vo_<scene>.mp3`. If you change a line, you must regenerate its file (see README, "Change a narration line").

Times are seconds from the start of the film. "Speech" is when the voice-over file plays. Each caption starts at the listed sentence start and stays up until the next one.

| # | Scene | Speech | Sentence starts (captions) | Line |
|---|---|---|---|---|
| 1 | Opening | 0.9–5.3 | 0.9 | What if you could see what someone understands, just by hearing them explain it? |
| 2 | Problem | 7.5–19.7 | 7.5 · 10.2 · 15.8 | Reading a lecture feels like learning. But rereading and highlighting rarely show what a learner actually understands. A wrong idea can sit unnoticed until an exam exposes it. |
| 3 | Opportunity | 21.5–28.6 | 21.5 · 25.3 | Explaining in your own words is where the gaps surface. The hard part is checking that explanation against the source. |
| 4 | Meet Hearo | 30.0–37.4 | 30.0 · 31.4 · 33.8 | This is Hearo. A learner opens an approved source. Hearo verifies it, and prepares a map of its key concepts. |
| 5 | Explain | 39.0–50.8 | 39.0 · 43.1 | The learner explains, aloud or by typing. Hearo stays silent, checks the meaning against the lecture, and marks the concept supported, citing the exact lines. |
| 6 | Catch a wrong idea | 54.0–61.9 | 54.0 · 57.2 | When an idea goes wrong, Hearo catches it. The source sits right beside the learner's own words, so the correction is concrete. |
| 7 | Two languages | 67.0–71.3 | 67.0 | Explanations in Arabic or English are checked against the same English source. |
| 8 | Report | 76.0–80.4 | 76.0 | At the end, a report shows coverage and accuracy, ready to download. |
| 9 | What's different | 84.0–91.8 | 84.0 · 86.8 · 90.0 | Every verdict cites its source. AI notes are labeled apart from source text. And Hearo never interrupts. |
| 10 | Proposed pilot | 95.0–102.1 | 95.0 · 97.9 | Hearo is an early, working product. We'd like to propose a focused pilot, with success measures we define together. |
| 11 | Close | 105.5–109.3 | 105.5 | Hearo. Learn by explaining. Master by teaching. |

## How the sentence starts were set

- **Measured starts:** for scenes 2–6, 9 and 10, the sentence starts were measured from the pauses in each voice-over file (`cues` in `content.ts`).
- **Single-sentence scenes:** scenes 1, 7, 8 and 11 have no measured starts. Their captions are timed by text length. Scenes 1, 7 and 8 are one sentence each, so this makes no difference to them.
- **Scene 11:** the line is three short sentences, so its caption changes are estimated, not measured.

## Claims check

Every claim in the narration is either something the footage shows or a description of the proposal:

- **Shown in the footage:** source verification, the concept map, silent checking with citations, catching a contradiction, Arabic input, and the downloadable report.
- **The proposal (scene 10):** it is described as a proposal. The film says plainly that Hearo is an early product.

The narration contains no metrics, customers, partners or outcomes.
