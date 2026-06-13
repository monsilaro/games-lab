// Small canvas/color helpers for the papercraft renderer (rounded rects, paper
// tints). Kept game-local — promote to packages/shared only if a 2nd game needs it.

function parse(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Blend a hex color toward white by `t` (0..1), returns a CSS `rgb()` string. */
export function lighten(hex: string, t: number): string {
  const c = parse(hex);
  return `rgb(${mix(c[0]!, 255, t)},${mix(c[1]!, 255, t)},${mix(c[2]!, 255, t)})`;
}
/** Blend a hex color toward black by `t` (0..1), returns a CSS `rgb()` string. */
export function darken(hex: string, t: number): string {
  const c = parse(hex);
  return `rgb(${mix(c[0]!, 0, t)},${mix(c[1]!, 0, t)},${mix(c[2]!, 0, t)})`;
}
/** `#rrggbb` → 0xRRGGBB int (for THREE.Color / confetti seeds). */
export function hexToInt(hex: string): number {
  const c = parse(hex);
  return (c[0]! << 16) | (c[1]! << 8) | c[2]!;
}

/** Trace a rounded rectangle path (does not fill/stroke). */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
