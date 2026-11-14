import { describe, expect, it } from 'vitest';
import {
  centipawnLossToAccuracy,
  clampCentipawns,
  computeGameAccuracy,
  MATE_CLAMP_CP,
} from '@/lib/stockfish/engine';

describe('stockfish ACPL and accuracy helpers', () => {
  it('clamps mate scores and extreme centipawns', () => {
    expect(clampCentipawns(0, 3)).toBe(MATE_CLAMP_CP);
    expect(clampCentipawns(0, -2)).toBe(-MATE_CLAMP_CP);
    expect(clampCentipawns(2500)).toBe(MATE_CLAMP_CP);
    expect(clampCentipawns(-2500)).toBe(-MATE_CLAMP_CP);
  });

  it('converts ACPL to bounded accuracy percentage', () => {
    expect(centipawnLossToAccuracy(0)).toBe(100);
    expect(centipawnLossToAccuracy(25)).toBeGreaterThan(30);
    expect(centipawnLossToAccuracy(200)).toBeLessThan(10);
  });

  it('computes per-side ACPL from White-POV evaluations', () => {
    // 2 plies: White drops 30cp (20 -> -10), Black gains/loses 0cp (-10 -> -10)
    const result = computeGameAccuracy(
      [{ evalCp: 20 }, { evalCp: -10 }, { evalCp: -10 }],
      ['e4', 'e5'],
    );
    expect(result.white.acpl).toBe(30);
    expect(result.black.acpl).toBe(0);
    expect(result.black.accuracy).toBe(100);
    expect(result.plies).toHaveLength(2);
  });
});
