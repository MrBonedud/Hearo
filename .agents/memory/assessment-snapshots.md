---
name: Assessment snapshots
description: Keeping asynchronous feedback, drafts, and final reports truthful while the learner continues explaining.
---

Live feedback can remain visible for a previously checked prefix when the learner only appends words. Replacing earlier words invalidates that feedback. A saved report must match the entire current explanation exactly; otherwise preserve a draft without attaching an older assessment.

**Why:** Learners continue speaking and editing while AI requests are running. Pairing a newer explanation with an older result misrepresents their understanding and can make recovery restore the wrong report.

**How to apply:** Capture each request's input, reject responses for replaced text or a different source, and keep requests serialized. Flush the final speech results before freezing the explanation for its final report. Provider failures must leave the learner's text recoverable.

An AI service failure pauses automatic grading until the learner explicitly retries. A new source/session clears the previous error.

**Why:** Continuing to type while a provider quota is exhausted otherwise sends another failing request for every revised snapshot.

**How to apply:** Keep editing and transcription available while paused; show the service error and retry control without pretending that newer words have been checked.

Speech beyond a checking limit must remain available as explicitly unassessed text, never silently discarded or included in the reported coverage.

**Why:** A microphone can emit its final words after the learner clicks Finish, including words beyond the input limit.

**How to apply:** Stop transcription gracefully, retain excess words with the draft and report export, and clearly identify which text was actually checked.
