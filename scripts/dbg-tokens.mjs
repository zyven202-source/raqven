/** Print contrast ratios of candidate oklch token values against the measured crop surfaces. */
function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const to8 = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  return [to8(lr), to8(lg), to8(lb)];
}
const lum = (rgb) => {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(rgb[0] / 255) + 0.7152 * f(rgb[1] / 255) + 0.0722 * f(rgb[2] / 255);
};
const ratio = (a, b) => {
  const la = lum(a),
    lb = lum(b);
  return ((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2);
};

const surfaceHint = [6, 72, 55]; // crop-0 card behind the hint
const surfaceBtn = [19, 71, 54]; // crop-1/2 glass-2 button fill

console.log(
  "--- hint candidates vs surface",
  surfaceHint,
  "(thin text: measured ≈ 0.87×nominal, aim nominal ≥5.4)",
);
for (const L of [0.76, 0.78, 0.79, 0.8, 0.81]) {
  const rgb = oklchToRgb(L, 0.045, 165);
  console.log(
    `  oklch(${L} 0.045 165) → rgb(${rgb}) nominal=${ratio(rgb, surfaceHint)} est.measured≈${(ratio(rgb, surfaceHint) * 0.866).toFixed(2)}`,
  );
}

console.log("--- negative candidates vs surface", surfaceBtn, "(bold glyphs: measured ≈ nominal)");
for (const L of [0.72, 0.76, 0.78, 0.79, 0.8]) {
  const rgb = oklchToRgb(L, 0.16, 26);
  console.log(`  oklch(${L} 0.16 26) → rgb(${rgb}) nominal=${ratio(rgb, surfaceBtn)}`);
}
// Chroma-reduced variants keep it from going pink:
for (const [L, C] of [
  [0.79, 0.14],
  [0.8, 0.13],
  [0.78, 0.15],
]) {
  const rgb = oklchToRgb(L, C, 26);
  console.log(`  oklch(${L} ${C} 26) → rgb(${rgb}) nominal=${ratio(rgb, surfaceBtn)}`);
}
