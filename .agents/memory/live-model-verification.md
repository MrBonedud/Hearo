---
name: Live model verification
description: Distinguishes configured credentials and listed models from successful live completions.
---

A configured AI secret confirms that the application can attempt provider requests; it does not confirm usable quota, billing, or model capacity. A successful model-list request also does not prove that a listed model can complete generation requests.

**Why:** On 2026-10-10 OpenAI recognized the configured key but had no available credits. Google subsequently listed models whose generation requests returned overload or not-found responses, while another listed model completed successfully.

**How to apply:** Check a minimal real completion on the exact configured model before semantic trials, including after a provider or model change. Keep structural tests clearly labeled. Report blocked semantic accuracy as unverified; when trials pass, limit claims to the tested cases rather than general language-model reliability.
