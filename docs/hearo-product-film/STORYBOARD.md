# Hearo product film: storyboard

Times are seconds from the start of the rendered film (113.0 s, 1920×1080, 30 fps). Scene lengths come from `SCENE_DURATIONS` in `content.ts`. Event times inside scenes are the values set in the source; in the real-time render they can land up to about 0.2 s late.

The narration line for each scene is in [NARRATION.md](NARRATION.md). Captions sit in a dark box at the bottom centre, below the footage window.

## Arc

| Brief beat | Film scenes | Time |
|---|---|---|
| 1. Hook | Opening | 0.0–7.0 |
| 2. Problem | Problem | 7.0–21.0 |
| 3. Opportunity / turn | Opportunity | 21.0–29.5 |
| 4. Product reveal | Meet Hearo | 29.5–38.5 |
| 5–6. Core workflow and proof | Explain · Catch · Two languages · Report | 38.5–83.5 |
| 7. Differentiators | What's different | 83.5–94.5 |
| 8. Proposed next step | Pilot | 94.5–105.0 |
| 9. Close | Close | 105.0–113.0 |

## Scenes

### 1 · Opening (0.0–7.0)

- **Picture:** navy field. Hearo's waving mascot inside soft listening rings, the wordmark "Hearo" set large in serif, and "Learn by explaining." Eyebrow: "Listen-first learning".
- **Voice-over:** from 0.9 s.
- **Evidence:** none. This is the brand opener; the mascot artwork comes from the app.

### 2 · Problem (7.0–21.0)

- **Picture:** paper-white field. The headline "Reading feels like *learning.*" appears. Then "Rereading." and "Highlighting." are struck through in red.
- **Example note:** a learner's note card follows: "Caching also speeds up writes *automatically*, so writes never need to be sent to the DBMS." The word "automatically" is underlined in red, with "Sounds right. Isn't. And nobody notices — until an exam does."
- **Evidence:** the note is the same wrong claim that Hearo catches later in the real footage (scene 6).

### 3 · Opportunity (21.0–29.5)

- **Picture:** navy field. "Explain it." then "*Check it.*" in gold. The thinking mascot sits on a pale disc with a gentle float.
- **Timed events:**
  - 26.2: a gold underline draws under "Check it."
  - 27.3: the disc grows slightly.

### 4 · Meet Hearo (29.5–38.5): real capture, normal speed

- **Footage:** clip1, source 0.2–9.2 s at 1×. The app's home screen, then the approved lecture PDF is chosen and shows "Source verified". "Prepare" is clicked at about 35.3, and the concept map appears at about 37.8.
- **Side notes:**
  - 33.1: "The approved lecture PDF is **verified** by fingerprint."
  - 36.0: "Hearo prepares a **concept map** — six ideas, none assessed yet."
- **Camera:** a slow push to 1.12× from 36.3.
- **Disclosure:** `REAL CAPTURE · NORMAL SPEED`

### 5 · Explain (38.5–53.5): real capture with a live AI check

- **Footage:** clip2.
  - 38.5–42.5: source 1.0–13.0 at 3×. An English explanation of scaling out versus scaling up is typed.
  - 42.5–53.5: source 19.6–30.6 at 1×. The live check result arrives at about 43.8. At about 47.3 the map node "Scale out vs. scale up" turns green **Supported**. The feedback card then shows the learner's words and the AI assessment, and at about 52.5 "Citations & confidence" opens with lecture lines S04-01..03.
  - The cut is source 13.0–19.6: the silent pause plus the AI check, 6.6 s.
- **Side notes:**
  - 39.7: "Speak or type. Hearo stays silent and checks when you pause."
  - 44.5: "Supported."
  - 49.5: "Citations: lecture lines S04-01…03, slide 4."
- **Camera:** at 48.5, one push to 1.9× centres the feedback card.
- **Disclosure:** `REAL CAPTURE · TYPING AT 3× · ~7 S PAUSE-AND-CHECK WAIT CUT · LIVE AI CHECK`

### 6 · Catch a wrong idea (53.5–66.5): real capture with a live AI check

- **Footage:** clip3.
  - 53.5–56.7: source 1.0–7.4 at 2×. The wrong caching sentence is added.
  - 56.7–65.8: source 32.8–41.9 at 1×. The result returns at about 57.8. At about 61.3 "Caching and consistency" turns red **Contradicted**, and at about 65.0 the card shows the lecture's Source line beside You (the learner's words).
  - The cut is source 7.4–32.8: about 25 s of pause detection and a slow AI response.
- **Side notes:**
  - 55.0: "A confident but wrong sentence about caching."
  - 60.0: "Contradicted."
  - 63.1: "Source next to You — the exact lecture line beside the learner's words."
- **Camera:** at 63.5, one push to 1.7× centres the contradiction card.
- **Disclosure:** `REAL CAPTURE · TYPING AT 2× · ~26 S WAIT FOR A SLOW AI RESPONSE CUT`

### 7 · Two languages (66.5–75.5): real capture with a live AI check

- **Footage:** clip5, with the app in Arabic (right to left).
  - 66.5–69.7: source 1.0–10.5 at 3×. An Arabic explanation of load balancing is typed.
  - 69.7–75.1: source 24.2–31.8 at 1.4×. The check returns at about 69.9. At about 72.4 "Load balancing" turns green **Supported**. At about 74.8 the feedback card quotes the Arabic words, with the AI assessment in English against the English lecture.
  - The cut is source 10.5–24.2: pause plus AI check, 13.7 s.
- **Side notes:**
  - 67.4: "Full right-to-left Arabic interface."
  - 70.7: "موازنة الأحمال — load balancing turns Supported."
  - 73.1: "Checked against the same English lecture."
- **Camera:** a push to 1.1× from 70.5.
- **Disclosure:** `REAL CAPTURE · TYPING AT 3× · ~14 S PAUSE-AND-CHECK WAIT CUT · RESULT AT 1.4×`

### 8 · Report (75.5–83.5): real capture

- **Footage:** clip4, source 1.0–10.8 at 1.3×.
  - At about 75.8, "Finish & see report" opens the session reflection.
  - It shows a local rubric score of 16.7/100, coverage 2/6, accuracy 1/2, and verdict chips.
  - At about 80.3 the view scrolls to the report's concept map.
  - At about 82.4 the "Download report" button appears. It downloads a plain-text `.txt` report.
- **Side notes:**
  - 77.1: "Coverage 2/6 · accuracy 1/2 — from this demo session."
  - 79.8: "Download as a plain-text report."
- **Camera:** a push to 1.08× from 75.8.
- **Disclosure:** `REAL CAPTURE · 1.3× · SCORE IS A LOCAL RUBRIC, NOT AN ACADEMIC GRADE`

### 9 · What's different (83.5–94.5): real stills

- **Picture:** three principles in a column, each activated in time with the narration:
  - "Cites its source", with the citations card
  - "Keeps AI apart", with the Source-vs-You card
  - "Never interrupts", with the full home screen, shown uncropped
- **Timed events:**
  - A navy rule fills under the active row.
  - 92.1: all rows return to full strength.
  - From 92.9: a slow push.
- **Label:** `STILLS FROM THE RUNNING APP`

### 10 · Pilot (94.5–105.0): proposal

- **Picture:** navy field.
  - Headline: "A focused *pilot.*"
  - Body: "With [Recipient company]: one course, real learners, success measures agreed up front."
  - Status line: `EARLY WORKING PRODUCT · NO OUTCOME STUDIES OR CUSTOMERS YET`
  - "Measures to define together": Coverage, Accuracy, Reliability, Learner view.
- **Timed events:**
  - From 101.1: a gold rule draws.
  - The measures are highlighted in turn at 101.1, 102.1, 103.1 and 104.0.
- **Evidence:** these are proposed measures, not results.

### 11 · Close (105.0–113.0)

- **Picture:** navy field.
  - The thumbs-up mascot on a pale disc.
  - The wordmark "Hearo" and "Learn by explaining. *Master by teaching.*"
  - The call to action "Let's book a 30-minute live demo."
  - The placeholders `[Your name · Role] · [email@domain · meeting link]`
- **Audio:** the music fades out over the last 3 s.
- **End:** the film ends on this card.
