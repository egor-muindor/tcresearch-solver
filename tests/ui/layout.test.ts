import { describe, expect, it } from 'bun:test';
import { hexToPixel, pixelToHex, hexCorners } from '../../app/src/ui/layout';
import { statusLabel } from '../../app/src/ui/format';

describe('hex layout (flat-top)', () => {
  it('maps center to origin and round-trips', () => {
    expect(hexToPixel({ q: 0, r: 0 }, 20)).toEqual({ x: 0, y: 0 });
    const p = hexToPixel({ q: 2, r: -1 }, 20);
    expect(pixelToHex(p, 20)).toEqual({ q: 2, r: -1 });
  });
  it('produces 6 corners', () => {
    expect(hexCorners({ x: 0, y: 0 }, 20)).toHaveLength(6);
  });
  it('uses flat-top orientation', () => {
    const p = hexToPixel({ q: 1, r: 0 }, 10);
    expect(p.x).toBeCloseTo(15);
    expect(p.y).toBeCloseTo(Math.sqrt(3) * 5);
  });
});

describe('status labels (spec §8, human-readable RU)', () => {
  it('maps every status to a non-empty label', () => {
    for (const s of ['OPTIMAL', 'FEASIBLE_TIMEOUT', 'UNKNOWN_TIMEOUT', 'INFEASIBLE_INVENTORY', 'UNSAT_PROVEN', 'CANCELLED', 'INVALID_INPUT'] as const) {
      expect(statusLabel(s).length).toBeGreaterThan(0);
    }
  });
});
