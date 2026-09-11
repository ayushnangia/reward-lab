/* Statistics on recorded outputs. No model inference or code execution. */
const OutputMath = (() => {
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  function ratio(a, n, k) {
    if (k > a) return 0;
    let p = 1;
    for (let i = 0; i < k; i++) p *= (a - i) / (n - i);
    return p;
  }
  function passK(n, c, k) {
    if (!Number.isInteger(k) || k < 1 || k > n) return null;
    return 1 - ratio(n - c, n, k);
  }
  function selection(rows, k, key) {
    if (
      k > rows.length ||
      k < 1 ||
      rows.some((r) => r[key] === null || r[key] === undefined)
    )
      return null;
    const groups = new Map();
    for (const row of rows) {
      const v = row[key];
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v).push(row.score);
    }
    let n = 0,
      prev = 0,
      value = 0;
    for (const [, scores] of [...groups].sort((a, b) => a[0] - b[0])) {
      n += scores.length;
      const cdf = ratio(n, rows.length, k);
      value += (cdf - prev) * mean(scores);
      prev = cdf;
    }
    return value;
  }
  function parseCSV(text) {
    const rows = [];
    let row = [],
      field = "",
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (quoted) quoted = false;
        else if (!field) quoted = true;
        else throw Error("Unexpected quote in CSV field.");
      } else if (c === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((c === "\n" || c === "\r") && !quoted) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        if (row.some((v) => v.length)) rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
    if (quoted) throw Error("Unclosed quoted field in CSV.");
    row.push(field);
    if (row.some((v) => v.length)) rows.push(row);
    if (rows.length < 2) throw Error("CSV needs a header and output rows.");
    const headers = rows.shift().map((s) => s.trim());
    if (new Set(headers).size !== headers.length)
      throw Error("CSV headers must be unique.");
    return rows.map((r, i) => {
      if (r.length !== headers.length)
        throw Error(
          `CSV row ${i + 2} has ${r.length} fields; expected ${headers.length}.`,
        );
      return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
    });
  }
  function parse(text, name = "outputs.json") {
    if (text.length > 5e6) throw Error("Use a file smaller than 5 MB.");
    text = text.replace(/^\uFEFF/, "");
    let data;
    if (name.toLowerCase().endsWith(".csv")) data = parseCSV(text);
    else if (/\.jsonl$/i.test(name))
      data = text
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((line, i) => {
          try {
            return JSON.parse(line);
          } catch {
            throw Error(`Invalid JSON on line ${i + 1}.`);
          }
        });
    else {
      try {
        data = JSON.parse(text);
      } catch {
        throw Error(
          "Expected JSON, JSONL, or CSV. Download the template to see the columns.",
        );
      }
    }
    return validate(data);
  }
  function validate(data) {
    const records = Array.isArray(data) ? data : data?.rows;
    if (!Array.isArray(records) || !records.length)
      throw Error("Provide a nonempty array of output rows.");
    if (records.length > 10000) throw Error("Use at most 10,000 output rows.");
    if (
      !Array.isArray(data) &&
      data.training_domains !== undefined &&
      (!Array.isArray(data.training_domains) ||
        data.training_domains.length > 50 ||
        data.training_domains.some(
          (d) => typeof d !== "string" || !d.trim() || d.length > 200,
        ))
    )
      throw Error(
        "training_domains must be an array of at most 50 nonempty domain names (up to 200 characters each).",
      );
    const rows = records.map((r, i) => {
      if (!r || typeof r !== "object")
        throw Error(`Row ${i + 1} is not an object.`);
      const required = ["checkpoint", "prompt_id", "prompt", "output"];
      for (const key of required)
        if (
          typeof r[key] !== "string" ||
          !r[key].trim() ||
          r[key].length > (key === "output" ? 20000 : 2000)
        )
          throw Error(
            `Row ${i + 1}: ${key} must be nonempty text (output ≤ 20,000 characters).`,
          );
      const num = (key, optional = false) => {
        if (
          optional &&
          (r[key] === undefined ||
            r[key] === null ||
            (typeof r[key] === "string" && !r[key].trim()))
        )
          return null;
        if (
          r[key] === null ||
          r[key] === undefined ||
          (typeof r[key] === "string" && !r[key].trim()) ||
          typeof r[key] === "boolean" ||
          !Number.isFinite(Number(r[key]))
        )
          throw Error(`Row ${i + 1}: ${key} must be a number.`);
        return Number(r[key]);
      };
      const score = num("score"),
        judge = num("judge_score", true),
        tokens = num("tokens", true);
      if (judge !== null && Math.abs(judge) > 1e6)
        throw Error(`Row ${i + 1}: judge_score must be within ±1,000,000.`);
      if (score < 0 || score > 1)
        throw Error(
          `Row ${i + 1}: score must be between 0 and 1. Normalize with a fixed, documented rubric before importing.`,
        );
      if (
        tokens !== null &&
        (!Number.isInteger(tokens) || tokens < 0 || tokens > 1e8)
      )
        throw Error(`Row ${i + 1}: tokens must be a nonnegative integer.`);
      const truth = r.correct;
      if (![true, false, "true", "false", 0, 1, "0", "1"].includes(truth))
        throw Error(
          `Row ${i + 1}: correct must be true or false; it is not inferred from score.`,
        );
      if (
        r.family !== undefined &&
        r.family !== null &&
        typeof r.family !== "string"
      )
        throw Error(`Row ${i + 1}: family must be text.`);
      for (const key of ["domain", "split"]) {
        if (
          r[key] !== undefined &&
          r[key] !== null &&
          (typeof r[key] !== "string" || r[key].length > 200)
        )
          throw Error(
            `Row ${i + 1}: ${key} must be text, at most 200 characters.`,
          );
      }
      const domain = r.domain?.trim() || null;
      const split = r.split?.trim().toLowerCase() || null;
      if (split && !["train", "validation", "test", "unknown"].includes(split))
        throw Error(
          `Row ${i + 1}: split must be train, validation, test, or unknown.`,
        );
      return {
        id: i,
        domain,
        split,
        checkpoint: r.checkpoint,
        prompt_id: r.prompt_id,
        prompt: r.prompt,
        output: r.output,
        score,
        correct: [true, "true", 1, "1"].includes(truth),
        judge_score: judge,
        tokens,
        family: r.family || null,
      };
    });
    const checkpoints = [...new Set(rows.map((r) => r.checkpoint))];
    if (checkpoints.length !== 2)
      throw Error(
        "Import exactly two checkpoints in one file so they can be compared.",
      );
    const allIds = [...new Set(rows.map((r) => r.prompt_id))],
      groups = new Map();
    for (const id of allIds) {
      const pair = checkpoints.map((cp) =>
        rows.filter((r) => r.prompt_id === id && r.checkpoint === cp),
      );
      if (pair.every((a) => a.length)) groups.set(id, pair);
    }
    if (!groups.size)
      throw Error("The two checkpoints have no matching prompt_id values.");
    for (const [id, pair] of groups) {
      for (const key of ["domain", "split"]) {
        if (new Set(pair.flat().map((r) => r[key])).size !== 1)
          throw Error(
            `Prompt ${id}: ${key} differs across rows. Use consistent metadata at both checkpoints.`,
          );
      }
      if (new Set(pair.flat().map((r) => r.prompt)).size !== 1)
        throw Error(
          `Prompt ${id}: prompt text differs across rows. Use the same evaluation prompt at both checkpoints.`,
        );
    }
    return {
      name: (!Array.isArray(data) && typeof data.name === "string"
        ? data.name
        : "Imported outputs"
      ).slice(0, 120),
      rows,
      checkpoints,
      groups,
      excluded: allIds.length - groups.size,
      synthetic: false,
      trainingDomains:
        !Array.isArray(data) && Array.isArray(data.training_domains)
          ? data.training_domains.map((d) => d.trim())
          : [],
    };
  }
  function summarize(data, promptId = null, k = 1) {
    const pairs =
      promptId === null
        ? [...data.groups.values()]
        : [data.groups.get(promptId)].filter(Boolean);
    if (!pairs.length) throw Error("Choose a matched prompt.");
    const maxK = Math.min(64, ...pairs.flatMap((p) => p.map((r) => r.length)));
    k = Math.max(1, Math.min(maxK, Math.round(Number(k) || 1)));
    const methods = [0, 1].map((index) => {
      const sets = pairs.map((p) => p[index]);
      const aggregate = (f) => {
        const vals = sets.map(f);
        return vals.some((v) => v === null) ? null : mean(vals);
      };
      const histogram = Array(11).fill(0);
      sets.forEach((rows) =>
        rows.forEach(
          (r) =>
            (histogram[Math.min(10, Math.floor(r.score * 10 + 1e-9))] +=
              1 / rows.length / sets.length),
        ),
      );
      const curves = Array.from({ length: maxK }, (_, i) => ({
        k: i + 1,
        pass: aggregate((r) =>
          passK(r.length, r.filter((x) => x.correct).length, i + 1),
        ),
        oracle: aggregate((r) => selection(r, i + 1, "score")),
        selected: aggregate((r) => selection(r, i + 1, "judge_score")),
      }));
      return {
        name: data.checkpoints[index],
        rows: sets.flat(),
        n: sets.reduce((s, r) => s + r.length, 0),
        histogram,
        score: aggregate((r) => mean(r.map((x) => x.score))),
        judge: aggregate((r) =>
          r.some((x) => x.judge_score === null)
            ? null
            : mean(r.map((x) => x.judge_score)),
        ),
        pass1: aggregate((r) => mean(r.map((x) => +x.correct))),
        passK: curves[k - 1].pass,
        poor: aggregate((r) => mean(r.map((x) => +(x.score < 0.3)))),
        tokens: aggregate((r) =>
          r.some((x) => x.tokens === null)
            ? null
            : mean(r.map((x) => x.tokens)),
        ),
        unique: aggregate(
          (r) => new Set(r.map((x) => x.output)).size / r.length,
        ),
        families: aggregate((r) =>
          r.some((x) => !x.family)
            ? null
            : new Set(r.map((x) => x.family)).size,
        ),
        oracle: curves[k - 1].oracle,
        selected: curves[k - 1].selected,
        curves,
      };
    });
    const promptRows = [...data.groups].map(([id, pair]) => ({
      id,
      prompt: pair[0][0].prompt,
      n: pair.map((r) => r.length),
      before: mean(pair[0].map((r) => +r.correct)),
      after: mean(pair[1].map((r) => +r.correct)),
      scoreBefore: mean(pair[0].map((r) => r.score)),
      scoreAfter: mean(pair[1].map((r) => r.score)),
    }));
    return { methods, maxK, k, prompts: pairs.length, promptRows };
  }
  return { parse, parseCSV, validate, passK, selection, summarize };
})();
if (typeof module !== "undefined") module.exports = OutputMath;
