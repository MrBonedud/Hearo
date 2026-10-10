---
name: Live model verification
description: Distinguishes configured credentials and listed models from successful live completions.
---

A configured AI secret confirms that the application can attempt provider requests; it does not confirm usable quota, billing, or model capacity. A successful model-list request also does not prove that a listed model can complete generation requests.

**Why:** On 2026-10-10 OpenAI recognized the configured key but had no available credits. Google subsequently listed models whose generation requests returned overload or not-found responses, while another listed model completed successfully.

**How to apply:** Check a minimal real completion on the exact configured model before semantic trials, including after a provider or model change. Keep structural tests clearly labeled. Report blocked semantic accuracy as unverified; when trials pass, limit claims to the tested cases rather than general language-model reliability.

The team authorized OpenAI-first checking with Gemini as the fallback, rather than parallel duplicate assessments.

**Why:** The team explicitly requested: "use both, if openAI doesn't work use gemini."

**How to apply:** Fail over when a provider request or grounded-output validation fails. Preserve the same reference and transcript; never fabricate an assessment when both fail. Disclose both providers in the app's privacy copy.

When the team announces a new API key, collect it through the secure secret form rather than treating the existing saved key as the new credential.

**Why:** Reusing the old saved key missed an explicit new-key handoff.

**How to apply:** Request the new credential securely, reload the API after it is saved, and verify the intended primary provider rather than counting a fallback response as primary-provider success. Never read or print the key.

Keep held-out bilingual evaluation explanations separate from checker prompt development. Independent automated fixture review is useful but is not native-speaker certification, and literal evidence validation does not establish semantic question relevance.

**Why:** The bilingual model-change evaluation uses an authored sample and a separate machine rubric review. Feeding those examples into the checker or describing machine review as human approval would overstate what later results demonstrate.

**How to apply:** Do not tune on held-out explanations. Retire and independently replace a held-out case if used for tuning. Keep question-focus judgments explicitly pending until independently reviewed, and report sample disagreements rather than calibrated accuracy.
