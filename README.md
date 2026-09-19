# ρ

An interactive visualizer of reinforcement learning updates on finite reward distributions.

[Visualizer](https://ayushnangia.github.io/reward-lab/) · [Algorithms](https://ayushnangia.github.io/reward-lab/#algorithms/basics)

Pick a starting distribution and press **Play** or **Next step**. **Previous step** moves back through recorded updates; going forward replays them before computing another update. GRPO, PPO and TailRL appear first. **Advanced** contains the other methods, reward transformations, judge errors and optimizer settings. The **Speed** control runs from 0.25× to 4×. Drag the handle, select a labeled stop, or use the arrow keys. The value above the scale resets to 1×. Changes retime the current stage and preserve the run. Comparisons show three charts at a time with Previous/Next arrows for larger selections. Every selected method continues updating, including charts on other pages. The chart grid keeps three readable, aligned charts in one laptop view. The surrounding page retains its normal spacing and scrolls naturally. Nothing plays automatically. **Sound on** reveals listening controls and a volume slider. Taller bars play higher, louder notes as the cursor scans from reward 0 to 1. A bell rises then falls, two modes produce two pitch peaks, and zero bins are silent. **Start → Current** plays both distributions on the same scale, with a pause between them. **Listen** pauses the simulation and replays the current distribution; **Stop** ends listening. Clicking a chart selects the algorithm to hear.

The **System / Light / Dark** control follows the device theme by default and remembers a manual choice. Both pages, equations, editors, native controls and exported images use the selected palette.

The animation separates sampling, weighting and updating. Reward positions stay fixed; bar height is probability, on a shared 0–100% scale. The gray bars retain the starting distribution. Replay uses recorded updates. Pausing during a stage completes that pending update. A run stops at its chosen horizon. Setup links reopen at update zero; **Save image** exports the current distributions as a PNG with the experiment settings.

**Export video** records the live chart page from its current update. Click **Start recording**, then use the website's Play, Listen, policy, speed, sound, and volume controls normally. Click **Stop recording** to preview and download. Audio is captured directly from the website's output, including changes during recording. There is no separate simulation or soundtrack. The canvas targets 1920×1080 at 60 fps; actual frame rate depends on the browser and device. Keep the tab visible. Supported browsers export MP4, with WebM as a fallback. Everything runs locally without uploads or added runtime dependencies.

The Algorithms page starts with policies, rewards, baselines and gradients. Each method has a worked three-answer group: follow the scores, weights and changed probabilities with Previous step / Next step, or change the scores and reward map. These calculations use the existing numerical rules with a fixed balanced group; the main visualizer samples random groups. Chapters also explain score transformations, the relation to language models, paper sources and three runnable experiments. GRPO and PPO retain the clipping figure for both advantage signs.

**Edit shape** opens a visual starting-distribution editor beside the main controls. Choose a shape or draw across its bars with a mouse or touch. Arrow keys select and adjust bars; Home clears a bar and End sets its maximum weight. Heights in this editor are relative weights, with the selected reward's normalized probability shown above. **Use distribution** starts a new run; **Cancel** preserves the current run. **Paste samples** is optional. Custom weights are stored directly, preserving rare tails and exact zeros without rounding to sample counts. Initial support smoothing from Advanced still applies.

## What the bars mean

This is a one-state, one-step categorical bandit with 21 actions. Each action has a fixed original reward in [0, 1] and its own adjustable logit. Softmax turns finite logits into positive probabilities; zero-support actions are explicitly masked with negative-infinity base logits. The bell-shaped preset is discrete and bounded. Initial support smoothing adds f to every starting probability and renormalizes, making an absent action's probability f / (1 + 21f). It is applied once, not after every update.

Sorting rearranges unchanged values. Policy learning changes probabilities. A reward map changes training scores; all plotted rewards and evaluation metrics stay on the original scale. Group normal scores do not make the policy distribution Gaussian.

A language model shares parameters across tokens and prompts. A reward histogram does not determine its gradients, parameter coupling, generalization, or training trajectory. There is no text generation, token-level aggregation, temporal credit assignment, entropy bonus or reference-policy KL penalty here. These are mechanism demonstrations, not full training replications or a performance ranking. Equal sample counts do not imply equal computation; the learning rates are not tuned separately for a benchmark.

With a clean judge and a fixed strictly increasing map, expected reward, expected best-of-k and finite TailRL all favor the highest-reward action with initial support. This unrestricted bandit does not force the tradeoffs caused by shared parameters, multiple prompts or regularization. MaxRL instead treats every action meeting its success threshold equally. This is a statement about objectives, not a convergence guarantee for sampled finite-step updates.

Displayed metrics are exact sums under the current policy, using original rewards even when the judge is corrupted. Expected best-of-k assumes independent draws and an oracle selector. The interface's k control sets both PKPO's training target and the common evaluation budget; hold it fixed across compared runs. PPO/GRPO's inspector reports the peak **clipped-gradient fraction** across pre-step epoch evaluations: samples with nonzero advantages on the flat side of the surrogate. This differs from counting every ratio outside the symmetric clipping interval. KL is old-policy to updated-policy, across all actions.

## Sound mapping

The sound reads the displayed probability distribution, including replay. Reward maps to time and stereo position; probability maps to both pitch and note level. A high, strong note indicates a tall bar, regardless of its reward. Moving probability to a higher reward raises the pitch later in the scan and lowers it at the source. A higher mean alone need not move the distribution's peaks.

`audio.js` uses a fixed mapping, `f(p) = 130.81278265 × 2^(3√p)` Hz, with 100 ms per bin and an 85 ms rounded, decaying tone at 1×. Automatic scans follow the speed control by scaling note spacing and duration, leaving pitch and peak level unchanged. A speed change during a scan continues at the next reward bin, with a short fade on the previous tone. Manual **Listen** and **Start → Current** use the reference tempo for comparison. The square root expands the lower part of the probability range without rounding it into musical notes. Note peak gain is `0.02 + 0.14√p`: taller bars have stronger tones. The quiet floor keeps small positive bins represented; exact zeros get silence. The whole gain envelope scales with that peak, preserving its shape. These levels are fixed across policies and replay states; they are never normalized per scan. No samples, per-run pitch normalization, reverb or background music enter the sound. Read precise probabilities from the chart. The Volume control adjusts the master level, preserving the differences between notes.

The mapping and comparison controls draw on [Walker and Lowey’s Sonification Sandbox](https://www.resna.org/sites/default/files/legacy/conference/proceedings/2004/Papers/Research/TCS/Sonification.html) and [Highcharts’ sequential audio-chart controls](https://www.highcharts.com/docs/sonification/getting-started). The timbre, range and square-root scaling are design choices here, not findings from those sources or a validated perceptual study. Native offline rendering checks silent gaps, rare-tail signal, stronger audio energy for taller bars and bounded amplitude; browser checks verify both comparison passes against the recorded policies.

## Methods

| Method                                                            | Implemented mechanism                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [GRPO](https://arxiv.org/abs/2402.03300)                          | Group-standardized advantages inside a clipped multi-epoch surrogate; reference KL coefficient β = 0                |
| [PPO](https://arxiv.org/abs/1707.06347)                           | Clipped probability-ratio surrogate, repeated epochs and learned scalar baseline                                    |
| [TailRL](https://arxiv.org/abs/2609.02987)                        | Centered finite-group tail weights; with n samples the mean-gradient convention implements order T = n − 1          |
| [RLOO](https://arxiv.org/abs/2402.14740)                          | Leave-one-out baseline and a categorical policy-gradient step                                                       |
| [MaxRL](https://arxiv.org/abs/2602.02710)                         | Binary judged success ≥ 0.9, centered and divided by the group success rate; no-success groups skipped              |
| [PKPO](https://arxiv.org/abs/2505.15201)                          | Continuous best-of-k leave-one-out-minus-one estimator, equation 33; k = 1 uses RLOO                                |
| [REINFORCE](https://link.springer.com/article/10.1007/BF00992696) | Sampled policy gradient without a baseline                                                                          |
| [A2C](https://arxiv.org/abs/1602.01783)                           | Synchronous one-step actor–critic; the linked paper supplies actor–critic foundations, not an A2C replication claim |
| [TRPO](https://arxiv.org/abs/1502.05477)                          | Categorical Fisher, conjugate gradients, exact KL evaluation and backtracking                                       |
| Elite                                                             | Top-20% likelihood heuristic with cutoff ties; not a full cross-entropy method                                      |

MaxRL bypasses continuous reward maps. PPO and GRPO reuse groups for multiple epochs. TRPO uses its KL budget instead of the shared actor learning rate. All methods begin with the same distribution and use shared random uniforms. Once policies differ, they can sample different outcomes. Changing the visible methods does not change the underlying runs.

## Scientific review · 11 September 2026

The current interface, all ten algorithm chapters, their worked examples and experiment descriptions were checked against the numerical implementation and the linked sources. This includes dynamic status text, metric definitions, reward-map previews, audio labels, image captions and implementation caveats. Archived pages and saved sweeps are outside this review.

Source checks: REINFORCE's score-function estimator; RLOO §2.3; Mnih et al.'s terminal actor–critic specialization; PPO §3, equation 7; DeepSeekMath §§4.1.1–4.1.2; TRPO §§4–6 and Appendix C; MaxRL §4.3, Algorithm 1; TailRL §4 and Appendix C's centered estimator and mean-loss convention; PKPO §4.3, equation 33. The Elite link is context for quantile selection, not a claim that this heuristic reproduces CEM.

`verify.js` enumerates every four-sample group on a three-action policy and compares expected REINFORCE, A2C, RLOO, MaxRL, TailRL and PKPO gradients with numerical derivatives of their stated fixed-reward objectives. `verify-classics.js` checks clipping derivatives, active versus inactive clipping, repeated epochs, critic ordering and accepted TRPO steps. These finite checks do not establish LLM performance or convergence. GRPO's random group normalization is not labeled an unbiased expected-reward estimator.

Reward maps follow the formulas in `core.js`. [Box–Cox](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.boxcox.html) and [Yeo–Johnson](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.yeojohnson.html) are additionally rescaled to [0,1] here, with a user-selected λ. Group normal scores use tied midranks; frozen scores use a clipped initial mid-CDF. None guarantees a Gaussian distribution for discrete rewards.

This is an implementation and source review, not independent peer review or a validation of the papers' empirical results.

## Run and develop

```sh
git clone https://github.com/ayushnangia/reward-lab.git
cd reward-lab
python3 server.py --open-browser
```

Open http://127.0.0.1:8766. Python's standard library serves the local files; no install or build is needed to use them. Everything runs in the browser. Stop the server with Control-C.

```sh
npm test
npm ci
npx playwright install chromium
npm run test:browser  # local server running on port 8766
node scripts/render-visualizer-preview.cjs
npm run build
```

Equations are authored in LaTeX and rendered with KaTeX, including accessible MathML. Its renderer, fonts and MIT license are bundled in `assets/katex/`, so equations also work locally without a CDN.

Numerical tests need only Node.js. Browser tests and preview generation use Playwright. `CHROME_PATH` can select an installed browser; `PLAYWRIGHT_MODULE` can select an existing Playwright installation. `QA_URL` overrides the browser test's base URL. Screenshots and test exports go into ignored `.qa/`.

Checks include exact finite-batch expectations, probability normalization and support, derivatives, clipping for both advantage signs, actual GRPO clipping behavior, TRPO's nonlinear KL constraint, zero-signal groups, transforms and ties. Browser checks cover all method pages from 320 to 1440 pixels, actual plotted state, replay, bounded playback, opt-in sound, validation, shared setups and PNG export. Lesson checks cover all ten worked calculations, softmax probabilities, affine maps, ties, navigation and every experiment button.

| Current file                       | Purpose                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| `index.html` / `rho.css`           | Two-page structure and responsive styling                       |
| `visualizer.js`                    | Playback, SVG charts, settings, replay and export               |
| `audio.js` / `theme.js`            | Shared audio synthesis and appearance preferences               |
| `video.js` / `verify-video.js`    | Local video recording, synchronized sound and replay checks     |
| `algorithms.js`                    | Explanations, equations, implementation limits and edge cases   |
| `core.js`                          | Policies, reward maps, advantages, optimizers and exact metrics |
| `config.js` / `content.js`         | Shared validation, names and paper links                        |
| `verify*.js` / `qa-visualizer.cjs` | Numerical and browser checks                                    |
| `scripts/build.cjs`                | Explicit public asset list and cache versions                   |

To add a method, put its numerical rule in `core.js`, add names and a paper source in `content.js`, and an explanation in `algorithms.js`. Add a numerical check that distinguishes the rule from an incorrect implementation. The guide and comparison selector use this data directly.

Older research-note, output-viewer and sweep sources remain in the repository for reference; the current entry point and public build do not load them. Their existing numerical checks remain runnable. The old saved sweep predates the clipped GRPO update and is not evidence about the current visualizer.

## Writing style

Use literal headings and direct explanations. Avoid decorative taglines, metaphorical hooks and promotional filler. Use typography, spacing and layout for the visual style. Preserve the technical detail and worked examples.

## Hosting and design

`npm run build` replaces the generated `docs/` directory with only the current public assets. GitHub Pages serves `main:/docs`. This app needs static hosting, not a GPU or training server. A [Hugging Face static Space](https://huggingface.co/docs/hub/spaces-sdks-static) could serve the same generated files with `sdk: static` and `app_file: index.html` in its README configuration; it is optional.

The repeated comparison panels draw on [Mike Bostock's algorithm visualizations](https://bost.ocks.org/mike/algorithms/). The equation controls follow the explanatory approach of [Distill's momentum article](https://distill.pub/2017/momentum/). The [TailRL project page](https://zanette-labs.github.io/TailRL-website/) also informed the research presentation. The implementation and graphics are original; there is no affiliation.

MIT license. Contributions should preserve the distinction between a mathematical mechanism, a finite demonstration and an empirical result.
