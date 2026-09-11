/* Transcribed factual table values, not browser-generated training results.
   Yang et al., arXiv:2602.01365v1, Tables 3 and 4, CC BY 4.0.
   Rows: training domain. Columns: evaluation domain. Each pair: step 1, final.
   No interpolation, pooled baseline, or inferred error bars. */
const TransferEvidence = {
  source: "https://arxiv.org/html/2602.01365v1#S2",
  domains: ["Math", "Science", "Logic", "Puzzle"],
  benchmarks: ["MATH500", "GPQA", "Logic test", "Puzzle test"],
  results: [
    [
      [40.6, 66.3],
      [10.66, 19.61],
      [21.29, 30.3],
      [2.05, 5.85],
    ],
    [
      [41.8, 62.6],
      [9.64, 36.92],
      [22.29, 25.92],
      [1.54, 3.85],
    ],
    [
      [36.4, 60.6],
      [8.12, 21.5],
      [21.14, 97.7],
      [2.82, 6.21],
    ],
    [
      [40.2, 58.4],
      [10.66, 29.2],
      [20.14, 32.9],
      [2.31, 29.04],
    ],
  ],
};
if (typeof module !== "undefined") module.exports = TransferEvidence;
