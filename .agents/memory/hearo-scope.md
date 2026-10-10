---
name: Hearo scope and approvals
description: Team-approved product direction and incremental permission boundaries.
---

Hearo is the product name; TRACE is visual guidance only. The team wants an Arabic-first UI, with mixed Arabic/English technical text displayed correctly rather than a full bilingual UI.

**Why:** The team sees an underserved Arabic learning audience and explicitly chose one UI language.

**How to apply:** Use Arabic for the learner experience while preserving English terminology where useful.

The demo topic is introductory system design. Use one Hearo-authored approved PDF rather than arbitrary document ingestion; there was no supplied source PDF. Upload must reject a different document rather than checking it against unrelated reference material. Clearly distinguish authored demo material from a textbook or externally validated source.

**Why:** The team wants to demonstrate PDF upload without accidentally selecting a different reference document.

**How to apply:** Keep reference content unified and derive the PDF from it. Ask before expanding upload scope.

The voice-service language is TypeScript. The README remains the baseline architecture and working agreement, except for changes explicitly approved by the team.

**Why:** The team selected shared frontend tooling and wants to control architecture changes.

**How to apply:** Do not independently replace the voice stack or broaden product scope.

Explain the planned changes, affected files, and reason before each small implementation step, then wait for explicit approval. General access to frontend, voice, AI, shared, and startup files is not blanket approval to change them. Feature merging also needs explicit team-leader approval.

**Why:** The team explicitly repeated “yes, but ask us for permission first.”

**How to apply:** Deliver the approved step only, describe what is ready and what remains unchanged, and request permission for the next step.
