---
name: Hearo source and workflow
description: Product scope, English reference choice, multilingual assessment, and incremental implementation rules.
---

Hearo is the product name; TRACE is visual guidance only. The team originally chose an Arabic-first learner experience with English technical terminology preserved.

**Why:** The team sees an underserved Arabic learning audience.

**How to apply:** Support readable Arabic and mixed-direction technical text; do not translate exact source evidence merely for presentation.

Hearo is for learning and explaining any subject. System design is only the current demo material, not the product's whole purpose.

**Why:** The team explicitly corrected topic-specific introduction copy: "we can explain everything."

**How to apply:** Describe the product generically while making the current demo's source restriction explicit.

On 2026-10-10 the team rejected the short authored reference and the proposed Arabic adaptation, then requested an existing English slide deck. Learners must be able to answer in Arabic, English, or both inside the app. This is not translation in chat or English-only answer checking.

**Why:** The team repeatedly clarified that either answer language should be checked for meaning against the same English reference.

**How to apply:** Keep this increment restricted to one reference PDF; verify its contents rather than its filename. Preserve attribution and distinguish exact source passages from Hearo-authored teaching aids. Public availability does not establish redistribution rights.

The earlier authored-demo learning loop was deliberately key-free and limited to matching known demo examples. That does not establish general language-model accuracy.

**Why:** The team approved a labelled limited demo, not fabricated claims of reliable Arabic understanding.

**How to apply:** Preserve other teammates' original demo work. Never present example matching or structural evidence checks as verified semantic assessment of arbitrary Arabic or English answers. Expose missing AI access honestly.

The Product & Engineering Instructions supplied on 2026-10-10 supersede the earlier requirement to stop for permission before every implementation step. Inspect current code, state one small increment, implement it, and verify it.

**Why:** The latest brief explicitly says to proceed with implementation rather than stop after writing a plan.

**How to apply:** Ask only about genuine blockers or consequential decisions. Preserve teammates' work and existing interfaces. Finish independent portions when an external service is missing; do not invent assessments or analytics.

Keep voice-service work in TypeScript unless the team authorizes a change; do not replace the existing stack based solely on a proposed architecture document.

**Why:** The team selected shared tooling, and the latest brief prioritizes the actual repository over architectural assumptions.

**How to apply:** Reuse the current app and services and avoid new infrastructure unless the next working increment requires it.

Keep this Replit project and its existing GitHub repository as the development foundation. Do not migrate to a new repository, replace the project, or disconnect/change the existing origin. Synchronization must preserve local and remote histories, teammate branches, uncommitted work and required ignored assets.

**Why:** The team explicitly rejected the proposed repository migration and requested publishing the existing application safely to the same repository.

**How to apply:** Inspect and protect work first, obtain approval before consequential remote operations, and never force-push, reset, clean or discard work. Verify synchronization and implementation before rewriting the README; independent teammate workspaces come after that baseline is agreed.

The team chose Google Gemini for answer checking after OpenAI provider access was blocked by unavailable API credits.

**Why:** The team explicitly requested replacing OpenAI with Gemini.

**How to apply:** Use Gemini for study assessments. Do not silently fall back to OpenAI; keep the same source restrictions and evidence validation regardless of provider.
