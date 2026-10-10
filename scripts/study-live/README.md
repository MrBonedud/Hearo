# Opt-in model-change regression evaluation

This suite checks **76 authored cases**: the original ten, 54 equivalent
explanations (nine per objective), and 12 incomplete/contradiction controls.
It covers all six objectives in the unchanged English source pack. Dialect
labels describe these particular examples, not all speakers: formal Arabic,
Jordanian, Egyptian, Gulf, Moroccan Maghrebi, and mixed Arabic-English.
Twelve paraphrases are held out from checker prompt development.

The fixtures are evaluation-only. Neither the checker nor the authored Arabic
demo imports them. Do not add their explanations to the model prompt, tune the
prompt on the held-out split, or change gold verdicts to match a candidate run.
If a held-out case is used to tune a prompt, retire it from that split before
the next experiment and arrange independent review of its replacement.

`corpus-review.json` records a separate model's independent source/rubric
review and the reviewed corpus digest. It is **not human review**. An offline
test makes any corpus edit invalidate that review record until re-reviewed.
The approved PDF and `shared/topic-packs/system-design.json` (original Arabic
pack) are never edited or replaced by the evaluation.

## Free checks

```sh
node --test scripts/study-live/*.test.mjs
node scripts/verify-study-live.mjs --list
node scripts/verify-study-live.mjs --list --split heldout
```

Running the script with no arguments only prints help. Tests use synthetic
responses and cannot establish semantic accuracy of any live model.

## Paid runs

Run against a development API, not a public production endpoint. Pause other
assessment clients to avoid sharing its IP throttle or public daily budget.
The server source token expires in two hours; expired/quota-limited requests
are recorded as availability failures, not semantic disagreements.
The runner preserves the server's anonymous budget cookie in memory (never in
reports) and stops when a daily allowance is exhausted. It does not create a
fresh allowance for each case. A full 76-case experiment needs an explicitly
configured development allowance sufficient for the run; otherwise select a
smaller concept/split and compare that identical subset across models.

Configure the **server** model with the non-secret `STUDY_OPENAI_MODEL` or
`STUDY_GEMINI_MODEL` environment variable, then restart the existing API
workflow. Defaults and fallback order stay unchanged. Model selection is not
accepted from HTTP request fields. The actual successful provider/model are
returned as `X-Hearo-Checker` and `X-Hearo-Model`, including fallback.

For an isolated Gemini comparison, enable only Gemini in the development
server's configuration. Do not disable the app's production fallback merely
for this test. If both providers remain enabled, the runner pins the **actual**
successful checker; it stops at the first successful response from a different
checker rather than labeling fallback results as the requested model.

Set these runner inputs (they are not provider credentials):

```sh
export STUDY_API_BASE="https://<development-domain>/api"
export TEST_APPROVED_PDF="/path/to/original/LargeScaleWebApps.pdf"
export STUDY_EXPECT_CHECKER="Gemini"
export STUDY_EXPECT_MODEL="<exact server model ID>"
node scripts/verify-study-live.mjs --live --output generated-artifacts/model-a.json
```

Change the server model and runner's expected model, restart the API once,
then run the same selection:

```sh
node scripts/verify-study-live.mjs --live \
  --baseline generated-artifacts/model-a.json \
  --output generated-artifacts/model-b.json
```

Only `--live` permits network calls. One default full run has 76 evaluation
HTTP attempts; the server may make multiple provider calls on fallback.
No automatic retry is enabled. `--retries 1` or `--retries 2` explicitly
allows additional attempts on 429/503, which can incur additional cost.
Daily-budget denials are never retried.
Use `--concept ID` or `--split acceptance|heldout|control|legacy` to reduce
cost. Baseline/candidate case selections must be identical.

The runner locally verifies the PDF's bytes/digest before uploading it,
uses the normal upload/prepare/evaluate flow, and never writes source tokens
or credentials to reports. Outputs are new JSON files exclusively under
ignored `generated-artifacts/`; existing reports cannot be overwritten.

## Interpretation and independent question review

Every response is checked for:

- Expected verdict and `not_demonstrated` for unmentioned objectives.
- Original, contiguous student quotations (never translated evidence).
- Nonempty, objective-owned source IDs for substantive verdicts.
- Exact server-pack source text and slide numbers, server-owned objective
  IDs/labels/descriptions/edges, and matching map status.
- Null/empty evidence for `not_demonstrated`.
- A nonempty follow-up with exactly one Arabic or English question mark,
  and a 600-character maximum. This is only a structural check.

The report groups equivalent variants and shows disagreements in their full
verdict vectors, including held-out results. It stores every transcript,
question and returned assessment alongside HTTP status, actual model, fallback
flag and attempt count. Review generated reports as potentially sensitive if
you add private examples; current corpus contains only authored study text.

**Punctuation does not establish question focus.** Each live run also writes
`<output>.question-review.json` with every returned question, objective,
transcript and literal evidence. An independent reviewer should:

1. Set `reviewer` to their role or review method; do not claim human review
   for a model review.
2. Set each row's `focus` and `evidenceSufficiency` to `pass` or `fail`.
3. Provide a rationale: does the question ask one relevant, focused thing
   about the objective's gap, contradiction or practice need? Do the quotes
   actually substantiate the verdict, beyond being literal?
4. Leave the original question/evidence/transcript unchanged.

Attach the review **without provider calls**:

```sh
node scripts/verify-study-live.mjs --review \
  generated-artifacts/model-a.json generated-artifacts/model-a.question-review.json \
  --output generated-artifacts/model-a.reviewed.json
```

The tool rejects missing/duplicate/pending review rows and stale questions or
evidence. A machine-only run remains explicitly `pending` semantic review,
even when all structural checks pass. Semantic failures get a failing exit
code when attaching or comparing reviewed runs.

Compare two stored runs, reviewed or not, without spending on providers:

```sh
node scripts/verify-study-live.mjs --compare \
  generated-artifacts/model-a.reviewed.json generated-artifacts/model-b.reviewed.json \
  --output generated-artifacts/comparison.json
```

Comparisons require matching source, corpus digest, ordered case selection,
schema and complete case records. They report verdict disagreements, changed
student/source evidence, rendered source quotations, question wording,
invariant failures, semantic review judgments and unavailable cases. Valid
source selections and question wording can change without being regressions.
Arabic/English equivalents are **not** required to quote identical strings.
Failed requests never count as a language disagreement.

There is no accuracy percentage or calibrated confidence estimate.
Counts describe only this small authored regression sample; disagreement is a
review signal, not proof that one model is correct. A passing structural suite
does not establish provider availability, native-speaker quality, or general
Arabic/English reliability. Retain the two live run reports and review files
when making a model-change decision.
