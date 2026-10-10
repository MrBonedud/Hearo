# Hearo demo rehearsal

## Recorded-audio fallback

1. Open a study with the approved English reference PDF.
2. Turn off live checking while making the recording if you want to save checks.
3. Choose **Record audio alongside speech**, then start the normal study microphone.
4. Explain the topic. Captions come from finalized browser recognition results, not typed words.
5. Stop the study microphone, then stop recording. Download **both** audio and captions JSON.
6. Before the pitch, import those two matching files and confirm replay. Replacement of an existing draft requires approval.
7. Use the audio controls. Captions enter the same explanation/checking path at their recorded times.

Recording is optional and local. Nothing uploads audio to Hearo's API. Download
the take before reloading or leaving; recordings are not automatically saved.
Replay uses captured captions, **not fresh speech recognition**. Browser support
and permission requirements still apply. Checking replayed text needs working
AI access and remaining checking allowance. The key-free prepared example is
illustrative only, not a genuine learner assessment.

## Arabic speech trial

Open **Arabic speech rehearsal lab** inside a study. Type the exact sentence
you intend to say, select Arabic, and start a trial. Stop before reviewing and
download its trial JSON. Original browser output is read-only; any edited text
is separately labelled. Word error rate uses normalized tokens, and can exceed
100% when there are many insertions. A word-match score does not prove that an
AI verdict is correct, and a single trial does not certify a dialect.

Run real trials with the demo speakers and actual headset in the presentation
room. Test technical English terms within Arabic, silence, interruptions, and
mic denial. No real-speaker or noisy-room result is supplied by these tools.

## Transparent session score

Coverage = supported, partial, or contradicted objectives / all objectives.
Accuracy = supported objectives / demonstrated objectives.
Score = coverage × accuracy × 100. Partial understanding earns no mastery credit.
Zero demonstrated objectives yield zero, and missing assessments are identified
separately. This is a local practice rubric, not a calibrated academic grade.

## Model/text benchmark

The existing opt-in runner uses the real approved-PDF API and records the actual
successful model. See `scripts/study-live/README.md` for paid-run configuration.
The `--split legacy` selection is only ten authored cases, mostly load balancing,
not the full 76-case corpus. Provider calls may cost money.

After a run:

```sh
node scripts/study-live/demo-metrics.mjs generated-artifacts/hearo-demo-benchmark.json
```

The summary separates unavailable requests from comparable verdicts, identifies
planted contradictions and false red flags, and reports successful request p50/p95
round trips. Latency includes fallback and networking, not microphone processing.
Do not quote successful-only agreement without the availability count.

The in-app latency indicator measures the current check, including frontend
queue time; it is not the same measurement as the runner's HTTP round trip.

## Before presenting

- Verify the approved PDF, AI quota and remaining allowance.
- Download a real audio/captions take and test import/replay on the demo laptop.
- Confirm microphone permission, headphones, network, charger and display scaling.
- Run three timed rehearsals and a Q&A drill.
- Open the five-slide **Hearo — Hackathon Pitch** deck.

None of these physical checks is complete merely because this checklist exists.
