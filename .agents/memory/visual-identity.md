---
name: Hearo visual identity
description: Decisions and pitfalls from the light-theme Hearo mascot redesign of the learner web app.
---

The user's pasted "HEARO COMPLETE VISUAL IDENTITY" spec (attached_assets) is the design source of truth: light theme, mascot poses from the user's own images (never regenerate them), only float/fade/pulse/progress/hover motion, no parallax.

**Why:** The user asked for an exact token-and-placement implementation while forbidding logic, API, routing, or dependency changes.

**How to apply:**
- Do not add UI for features that do not exist (search, streaks, profile, library, language toggle); the spec mentions them but they would be fake.
- Where spec colours fail 4.5:1 contrast (white on #EF4444, subtle grey body text), keep the hue for fills and use a darker shade for text, then note the deviation.
- `dir="auto"` takes its direction from the first strong character, including bilingual labels like "كلماتك · Your words"; give such labels their own `dir` so learner text decides alignment.
- Page-level CSS grids that contain the concept map need an explicit `minmax(0, 1fr)` column, or the fixed-width graph widens the whole page on phones.
- Content revealed only on scroll-into-view stays invisible in full-page captures and print; prefer mount fades for below-the-fold sections.
