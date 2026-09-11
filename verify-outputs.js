const assert = require("node:assert/strict");
const M = require("./output-math.js");
const near = (a, b) => assert(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const rows = [
  { score: 0, judge_score: 1 },
  { score: 0.4, judge_score: 1 },
  { score: 1, judge_score: 0 },
  { score: 0.8, judge_score: 0.5 },
];
function subsets(items, k) {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  return [
    ...subsets(items.slice(1), k - 1).map((v) => [items[0], ...v]),
    ...subsets(items.slice(1), k),
  ];
}
for (let k = 1; k <= rows.length; k++) {
  const sets = subsets(rows, k),
    average = (key) =>
      sets.reduce((sum, s) => {
        const best = Math.max(...s.map((r) => r[key])),
          ties = s.filter((r) => r[key] === best);
        return sum + ties.reduce((a, r) => a + r.score, 0) / ties.length;
      }, 0) / sets.length;
  near(M.selection(rows, k, "score"), average("score"));
  near(M.selection(rows, k, "judge_score"), average("judge_score"));
  near(
    M.passK(4, 1, k),
    sets.filter((s) => s.some((r) => r.score === 1)).length / sets.length,
  );
}
assert.equal(M.passK(4, 1, 5), null);
assert.equal(
  M.selection([{ score: 0.5, judge_score: null }], 1, "judge_score"),
  null,
);
const row = (id, checkpoint, correct, extra = {}) => ({
  prompt_id: id,
  checkpoint,
  prompt: "test " + id,
  output: "answer",
  score: +correct,
  correct,
  ...extra,
});
// Prompt weighting must not become sample-count weighting.
const data = M.validate([
  row("easy", "before", true),
  row("easy", "after", true),
  ...Array.from({ length: 9 }, () => row("hard", "before", false)),
  ...Array.from({ length: 9 }, () => row("hard", "after", false)),
  row("missing", "before", true),
]);
const summary = M.summarize(data);
near(summary.methods[0].pass1, 0.5);
near(summary.methods[0].histogram[0], 0.5);
assert.equal(data.excluded, 1);
assert.equal(summary.maxK, 1);
assert.equal(summary.methods[0].tokens, null);
const csv =
  'checkpoint,prompt_id,prompt,output,score,correct\r\nbefore,p,task,"a, b\nline ""two""",0.5,false\r\nafter,p,task,ok,1,true\r\n';
const parsed = M.parse(csv, "test.csv");
assert.equal(parsed.rows[0].output, 'a, b\nline "two"');
assert.equal(parsed.rows[1].correct, true);
assert.throws(
  () => M.parse(csv.replace("0.5", "1.5"), "test.csv"),
  /between 0 and 1/,
);
assert.throws(
  () => M.validate([row("x", "a", true), row("y", "b", true)]),
  /no matching/,
);
assert.throws(
  () =>
    M.validate([
      row("x", "a", true),
      row("x", "b", true, { prompt: "different" }),
    ]),
  /differs/,
);
assert.throws(
  () => M.validate([row("x", "a", true), row("x", "b", "maybe")]),
  /number|true or false/,
);
const jsonl =
  JSON.stringify(row("x", "a", false)) +
  "\n" +
  JSON.stringify(row("x", "b", true));
assert.equal(M.parse(jsonl, "test.jsonl").rows.length, 2);
console.log(
  "PASS: exhaustive subset selection with judge ties, finite-sample pass@k, equal prompt weighting, unmatched prompts, optional data, CSV quoting/newlines, JSONL, and validation.",
);

const E = require("./output-examples.js");
const collapse = M.summarize(E.create("collapse"));
assert(collapse.methods[1].pass1 > collapse.methods[0].pass1);
assert(
  collapse.methods[1].curves.at(-1).pass <
    collapse.methods[0].curves.at(-1).pass,
);
const overfit = M.summarize(E.create("judge"));
assert(overfit.methods[1].judge > overfit.methods[0].judge);
assert(overfit.methods[1].pass1 < overfit.methods[0].pass1);
assert(
  overfit.methods[1].curves.at(-1).selected <
    overfit.methods[1].curves.at(-1).oracle,
);
console.log(
  "PASS: constructed examples exhibit the stated judge and retry tradeoffs.",
);

const namedAll = M.validate([
  row("all", "a", true),
  row("all", "b", true),
  row("else", "a", false),
  row("else", "b", false),
]);
near(M.summarize(namedAll, "all").methods[0].pass1, 1);
near(M.summarize(namedAll).methods[0].pass1, 0.5);
