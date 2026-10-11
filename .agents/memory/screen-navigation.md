---
name: Screen navigation
description: Scroll/focus rules for screen changes in the single-page study flow and for in-page section controls.
---

Landing, sample, setup, session and review swap inside one document. Each screen change must reset the window to the top and move focus to the new screen's h1 (tabIndex -1), before paint. Any panel that replaces the button just pressed (e.g. guided sample steps) must likewise move focus to its heading and bring its start into view.

**Why:** QA found the report opening scrolled far down (the window kept the session's offset) and sample steps dropping keyboard focus to the body.

**How to apply:** Section jumps (how it works, saved studies) go through a scroll-then-focus helper, never timeouts; a jump that changes screen is deferred to the screen-change effect. Only show a section control on screens where that section exists — do not navigate home to find it, because going home resets the study.
