/**
 * Deterministic local placeholder art for demo media when the remote sample
 * source is unreachable (offline, blocked network). Monochrome gradients with
 * a lens motif so failed loads still look intentional in both colorways.
 */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function placeholderDataUrl(seed: string, width: number, height: number): string {
  const h = hashSeed(seed);
  const base = 24 + (h % 36); // 24-59: dark neutral
  const lift = base + 26 + ((h >> 8) % 22);
  const angle = (h >> 16) % 360;
  const cx = 25 + ((h >> 4) % 50);
  const cy = 25 + ((h >> 12) % 50);
  const r = Math.min(width, height) * 0.22;
  const gray = (v: number) => `rgb(${v},${v},${v})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0" stop-color="${gray(base)}"/>
      <stop offset="1" stop-color="${gray(lift)}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${(cx / 100) * width}" cy="${(cy / 100) * height}" r="${r}" fill="none" stroke="${gray(lift + 24)}" stroke-opacity="0.5" stroke-width="${Math.max(2, r / 22)}"/>
  <circle cx="${(cx / 100) * width}" cy="${(cy / 100) * height}" r="${r * 0.55}" fill="${gray(Math.max(base - 12, 8))}" fill-opacity="0.6"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
