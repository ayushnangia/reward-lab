# Compare your model outputs

Export responses from exactly two checkpoints using the same evaluation prompts and a fixed scoring rubric. Import CSV, JSON, or JSONL with the **Import output file** button. The page parses the file in memory; no upload, model call, code execution, or persistent storage occurs. Reloading clears the imported dataset.

## One row per recorded response

| Field         | Required | Meaning                                                                                                                          |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `checkpoint`  | Yes      | Checkpoint name. Exactly two distinct values; first appearance defines comparison order.                                         |
| `prompt_id`   | Yes      | Stable prompt identifier used to match checkpoints.                                                                              |
| `prompt`      | Yes      | Same prompt text for every row with this ID.                                                                                     |
| `output`      | Yes      | Response text; code is displayed, never executed.                                                                                |
| `score`       | Yes      | Independent evaluation on a fixed 0–1 scale. Do not substitute the training judge if you want to measure judge overoptimization. |
| `correct`     | Yes      | Explicit boolean correctness label, independent of the continuous score. CSV accepts true/false or 1/0.                          |
| `judge_score` | No       | Training/selection judge score; a common scale across both checkpoints, within ±1,000,000.                                       |
| `tokens`      | No       | Nonnegative integer output-token count from your tokenizer.                                                                      |
| `family`      | No       | Your label for a solution strategy. The workbench does not infer semantic equivalence.                                           |

JSON can be an array or `{ "name": "experiment name", "rows": [...] }`. JSONL uses one row object per line. CSV supports quoted commas, newlines, and doubled quote escaping. Limits: 5 MB, 10,000 rows, 20,000 characters per response.

```json
[
  {
    "checkpoint": "base",
    "prompt_id": "q1",
    "prompt": "What is 6 × 7?",
    "output": "36",
    "score": 0,
    "correct": false,
    "judge_score": 0.8,
    "tokens": 2,
    "family": "arithmetic error"
  },
  {
    "checkpoint": "base",
    "prompt_id": "q1",
    "prompt": "What is 6 × 7?",
    "output": "42",
    "score": 1,
    "correct": true,
    "judge_score": 0.7,
    "tokens": 2,
    "family": "direct"
  },
  {
    "checkpoint": "tuned",
    "prompt_id": "q1",
    "prompt": "What is 6 × 7?",
    "output": "42",
    "score": 1,
    "correct": true,
    "judge_score": 0.9,
    "tokens": 2,
    "family": "direct"
  },
  {
    "checkpoint": "tuned",
    "prompt_id": "q1",
    "prompt": "What is 6 × 7?",
    "output": "Six groups of seven give 42.",
    "score": 1,
    "correct": true,
    "judge_score": 0.95,
    "tokens": 9,
    "family": "explanation"
  }
]
```

The example above is constructed; the token counts are illustrative.

## Statistical interpretation

Every matched prompt receives equal weight, even when sample counts differ. Unmatched prompts are excluded and counted. Pass@k is computed per prompt as `1 − C(n−c,k)/C(n,k)` and then averaged. The maximum supported k is the smaller of 64 and the smallest response group in the current comparison. Independent draws from the same per-prompt policy are required for the usual unbiased-population interpretation. See [Chen et al.](https://arxiv.org/abs/2107.03374).

For each size-k subset of recorded candidates, the best-available curve selects the highest independent evaluation score. The judge-selected curve selects the highest judge score, breaking ties uniformly. The displayed value is the independent evaluation score of that selected response. The app computes these subset averages exactly by grouping score ties and using combinatorial probabilities. These are finite-pool statistics, not exact population guarantees.

Missing optional fields make the corresponding aggregate unavailable; the app does not silently restrict that metric to the rows that happened to include it. Exact text uniqueness uses raw response strings and is not semantic diversity. Family counts require supplied family labels. Token cost is k times average output tokens, excluding prompt tokens, tool calls, and judge cost.

The workbench cannot identify causal training effects, policy KL, token entropy, clipping rates, gradient variance, semantic novelty, or out-of-distribution generalization from these fields. Match sampling settings, use independent evaluation, evaluate difficult subgroups, repeat training seeds, and design uncertainty estimates at the appropriate experimental unit. A histogram valley alone does not establish lost reasoning ability.

## Example cases

All built-in responses, frequencies, quality labels, judge scores, token counts, and family labels are hand-authored. They demonstrate possible patterns; no named model or algorithm produced them. They are intentionally small and carry no confidence intervals.

The four examples show judge overoptimization, pass@1 gains with lost prompt coverage, a stronger tail with more poor attempts, and a more consistent improvement. The separate toy training lab implements algorithm mechanisms on 21 outputs; it is not an LLM training reproduction.

## Exports and links

Analysis export includes metrics, the current scope and budget, and prompt identifiers/text. It excludes response bodies. Example links include only the built-in case, prompt, and budget. Imported data is never encoded into public URLs.

## Domains, splits, and transfer

Two optional columns identify the evaluation destination:

| Column   | Values                                                                                    |
| -------- | ----------------------------------------------------------------------------------------- |
| `domain` | A nonempty domain name, such as `math` or `code`, up to 200 characters. Omit for unknown. |
| `split`  | `train`, `validation`, `test`, or `unknown`. Case is normalized. Omit for unknown.        |

Every row for a matched prompt must have identical domain and split metadata at both checkpoints. Mixed or missing labels within that prompt are rejected. Use distinct prompt IDs for distinct evaluation units. Do not use a `test` label to hide training overlap; the viewer cannot verify the provenance of your prompts.

A JSON object wrapper may include `training_domains`, an array of up to 50 domain names, alongside `name` and `rows`. For example, `"training_domains": ["math"]` records that the intervention trained on math. This lets the domain table distinguish evaluation in the same domain from another domain. It is descriptive metadata, not a verified causal claim. CSV and JSONL files without the wrapper leave the source unspecified.

The domain table always covers **all matched prompts**, independently of the response viewer's prompt filter. It averages each prompt's observed correctness first, then weights the prompts equally. The change is the paired difference between the two checkpoints. Improved and regressed counts are counts of prompts, not output samples.

For imported groups of at least five prompts, a deterministic percentile bootstrap resamples paired prompts with replacement 1,200 times. The 2.5th and 97.5th percentile endpoints form the displayed interval. The bootstrap conditions on these checkpoints and their recorded responses. It excludes training-seed uncertainty and within-prompt output-sampling uncertainty, and it can be unstable with few prompts. Related prompt variants need a clustered analysis outside this viewer. The built-in constructed fixtures have no inferential intervals.

For an actual transfer study, record model/checkpoint identifiers, intervention, source data, target benchmarks, train/test separation, decoding settings, token budget, verifier, and training seeds alongside the file. Keep the evaluation protocol fixed and report each domain separately. A validation set used for selection is not an untouched test set.
