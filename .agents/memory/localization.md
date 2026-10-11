---
name: Hearo localization
description: Decisions for the Arabic-default bilingual interface of the learner web app — detection, copy, what stays untranslated, and test language.
---

Arabic is the default interface; a first visit from an English browser language gets English, and a saved choice in localStorage `hearo.lang` always wins. An inline head script applies lang/dir before first paint so there is no LTR flash.

**Why:** The user's localization spec (Jordanian Arabic first, English second) asked for this exact precedence and for runtime title/meta updates.

**How to apply:**
- New UI text needs both an English and a Jordanian-Arabic entry with matching placeholders; the i18n unit test enforces key and placeholder parity.
- Never translate learner text, source passages, API data, the brand name, PDF, or the offline-sample source narration; give learner text `dir="auto"` on its own block (not just `<bdi>`) so English text aligns left inside the RTL page.
- Arabic numbers use Western digits (`ar-JO-u-nu-latn`); UTC reset times keep a "UTC" suffix.
- Playwright runs with an en-US locale, so end-to-end tests see English; English copy that tests assert on must stay stable.
- In Arabic copy, avoid gluing و directly to a Latin word ("وHearo"); rephrase instead.
- The type scale is five primary sizes (12/14/16/20/30) with lg/2xl/4xl as aliases; only the landing headline uses a fluid display size.
