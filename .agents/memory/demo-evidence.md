---
name: Demo evidence boundaries
description: Honest interpretation of recorded-caption replay, human speech trials and small paid text benchmarks.
---

Recorded-audio replay is a presentation fallback using captured captions, not an independent fresh speech-recognition result.

**Why:** The team approved pitch copy explicitly distinguishing captured-caption playback from fresh recognition and refusing unverified speech-reliability claims.

**How to apply:** Label replay visibly. Do not count synthetic browser audio fixtures, scripted captions, edited transcripts or text-only semantic cases as real-speaker trials. Actual Arabic microphone reliability still needs intended versus observed human speech on the demo hardware.

Keep availability failures and environment interruptions beside successful-only verdict measurements.

**Why:** A development benchmark had valid successful verdicts alongside model failures and two transport failures around an API restart; quoting only successful agreement would misrepresent readiness.

**How to apply:** Do not restart the measured service while a benchmark is active. Preserve interrupted results and disclose interference; separate successful verdict denominators, failed requests and follow-up formatting failures. Small authored subsets support descriptive results only, not population accuracy or speech certification.
