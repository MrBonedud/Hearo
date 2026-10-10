---
name: Assessment snapshots
description: Keeping asynchronous feedback, drafts, and final reports truthful while the learner continues explaining.
---

Live feedback can remain visible for a previously checked prefix when the learner only appends words. Replacing earlier words invalidates that feedback. A saved report must match the entire current explanation exactly; otherwise preserve a draft without attaching an older assessment.

**Why:** Learners continue speaking and editing while AI requests are running. Pairing a newer explanation with an older result misrepresents their understanding and can make recovery restore the wrong report.

**How to apply:** Capture each request's input, reject responses for replaced text or a different source, and keep requests serialized. Flush the final speech results before freezing the explanation for its final report. Provider failures must leave the learner's text recoverable.

An assessment belongs to the study activation that requested it, not just its PDF and explanation. Starting or reopening a study creates a fresh ownership scope, including reopening the originating saved study. Do not reuse pending or cached results across those scopes.

**Why:** Two saved studies can deliberately contain identical explanations for the same verified PDF. Attaching an old response to the newly active study changes its report without a check owned by that study.

**How to apply:** Scope response acceptance, failures, and request-cache keys to the activation while retaining serialized transport. Preserve saved reports when reopening them, but require a fresh request for a new check.

An AI service failure pauses automatic grading until the learner explicitly retries. A new source/session clears the previous error.

**Why:** Continuing to type while a provider quota is exhausted otherwise sends another failing request for every revised snapshot.

**How to apply:** Keep editing and transcription available while paused; show the service error and retry control without pretending that newer words have been checked.

Speech beyond a checking limit must remain available as explicitly unassessed text, never silently discarded or included in the reported coverage.

**Why:** A microphone can emit its final words after the learner clicks Finish, including words beyond the input limit.

**How to apply:** Stop transcription gracefully, retain excess words with the draft and report export, and clearly identify which text was actually checked.
