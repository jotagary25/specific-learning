/** SVG polyline points for 0–100 scores in a `width` × `height` box, oldest first. */
export function sparklinePoints(scores: readonly number[], width: number, height: number): string {
  if (scores.length === 0) return "";
  const step = scores.length > 1 ? width / (scores.length - 1) : 0;
  return scores
    .map((score, index) => {
      const x = scores.length > 1 ? index * step : width / 2;
      const y = height - (Math.min(100, Math.max(0, score)) / 100) * height;
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(" ");
}
