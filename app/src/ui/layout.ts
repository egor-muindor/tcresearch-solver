import type { Hex } from '../core/hex';

export interface Pixel { x: number; y: number; }

// flat-top axial layout (redblobgames)
export function hexToPixel(h: Hex, size: number): Pixel {
  return { x: size * 1.5 * h.q, y: size * Math.sqrt(3) * (h.r + h.q / 2) };
}

export function pixelToHex(p: Pixel, size: number): Hex {
  const q = (2 / 3 * p.x) / size;
  const r = (-1 / 3 * p.x + Math.sqrt(3) / 3 * p.y) / size;
  return roundHex(q, r);
}

function roundHex(qf: number, rf: number): Hex {
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

export function hexCorners(center: Pixel, size: number): Pixel[] {
  const corners: Pixel[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 180 * (60 * i); // flat-top
    corners.push({ x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) });
  }
  return corners;
}
