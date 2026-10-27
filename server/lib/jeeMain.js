// Rough JEE Main marks → percentile → rank conversion.
//
// Marks vs percentile: the 0–300 table published by SelfStudys from previous-year
// JEE Main results ("JEE Main 2025: Marks vs Percentile vs Rank", based on previous
// year analysis). Each pair is [marks out of 300, percentile]; values in between are
// interpolated. Percentiles are normalised per shift, so real results for the same
// marks vary by shift and year; this is only for a ballpark estimate.
//
// Candidates: NTA's JEE Main 2026 figure of 15,38,468 unique candidates who appeared
// (both sessions). Ranks are estimated as (100 − percentile)% of that number.
// Update both when newer official data is published.

const SOURCE = {
  table: "Previous-year JEE Main marks vs percentile (SelfStudys analysis of 2025 results)",
  candidates: "NTA JEE Main 2026: 15,38,468 unique candidates appeared",
};
const CANDIDATES = 1538468;

const MARKS_TO_PERCENTILE = [
  [0, 6.5998], [10, 20.9505], [20, 40.3469], [30, 59.84], [40, 73.0814], [50, 81.5758],
  [60, 87.0607], [70, 90.411], [80, 92.7623], [90, 94.3964], [100, 95.6434], [110, 96.6095],
  [120, 97.3543], [130, 97.9405], [140, 98.4077], [150, 98.7782], [160, 99.0699], [170, 99.2956],
  [180, 99.4803], [190, 99.624], [200, 99.7313], [210, 99.8078], [220, 99.8662], [230, 99.916],
  [240, 99.9466], [250, 99.9698], [280, 99.9975], [290, 99.9991], [300, 100],
];

function percentileFor(marks) {
  const m = Math.max(0, Math.min(300, marks));
  for (let i = 1; i < MARKS_TO_PERCENTILE.length; i++) {
    const [m1, p1] = MARKS_TO_PERCENTILE[i];
    if (m <= m1) {
      const [m0, p0] = MARKS_TO_PERCENTILE[i - 1];
      return p0 + ((m - m0) / (m1 - m0)) * (p1 - p0);
    }
  }
  return 100;
}

// The marks needed for a percentile (inverse of the above)
function marksFor(percentile) {
  const p = Math.max(0, Math.min(100, percentile));
  if (p <= MARKS_TO_PERCENTILE[0][1]) return 0;
  for (let i = 1; i < MARKS_TO_PERCENTILE.length; i++) {
    const [m1, p1] = MARKS_TO_PERCENTILE[i];
    if (p <= p1) {
      const [m0, p0] = MARKS_TO_PERCENTILE[i - 1];
      return m0 + ((p - p0) / (p1 - p0)) * (m1 - m0);
    }
  }
  return 300;
}

const rankFor = (percentile) => Math.max(1, Math.round(((100 - percentile) / 100) * CANDIDATES));

// Recent tests count more: weights 1, 2, 3 … for oldest → newest
function weightedMean(values) {
  let sum = 0, w = 0;
  values.forEach((v, i) => { sum += v * (i + 1); w += i + 1; });
  return w ? sum / w : null;
}
function stdDev(values) {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

const WINDOW = 6; // use the last six tests

// scorePcts: the student's test scores as % of max, oldest first
function predict(scorePcts) {
  if (!scorePcts.length) return null;
  const recent = scorePcts.slice(-WINDOW).map((p) => Math.max(0, Math.min(100, p)));
  const mean = weightedMean(recent);
  const marks = (mean / 100) * 300;
  // Fewer tests or bouncier scores → a wider range
  const sd = stdDev(recent);
  const spread = Math.min(45, Math.max(sd == null ? 25 : (sd / 100) * 300, recent.length < 3 ? 20 : 10));
  const low = Math.max(0, marks - spread), high = Math.min(300, marks + spread);
  const p = percentileFor(marks), pLow = percentileFor(low), pHigh = percentileFor(high);
  return {
    tests_used: recent.length,
    confidence: recent.length >= 5 ? "good" : recent.length >= 3 ? "fair" : "low",
    marks: Math.round(marks),
    marks_low: Math.round(low),
    marks_high: Math.round(high),
    percentile: Math.round(p * 100) / 100,
    percentile_low: Math.round(pLow * 100) / 100,
    percentile_high: Math.round(pHigh * 100) / 100,
    rank: rankFor(p),
    rank_best: rankFor(pHigh),
    rank_worst: rankFor(pLow),
  };
}

module.exports = { SOURCE, CANDIDATES, percentileFor, marksFor, rankFor, predict, WINDOW };
