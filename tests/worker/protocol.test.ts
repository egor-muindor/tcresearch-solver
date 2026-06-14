import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import { createBoard, setState, serializeBoard } from '../../app/src/core/board';
import { encodeSolveRequest, decodeSolveRequest } from '../../app/src/worker/protocol';

const data = buildAspectData();

describe('worker protocol', () => {
  it('round-trips a solve request into a runnable SolveOptions', () => {
    const b = createBoard(2);
    setState(b, { q: -1, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
    const req = encodeSolveRequest({
      version: '4.2.2.0', addons: ['fm', 'mb', 'gt', 'tb', 'av'],
      board: serializeBoard(b),
      supply: [['air', 100], ['entropy', 100]], threshold: 50,
      budget: { maxNodes: 1000, maxTimeMs: 100 },
    });
    const opts = decodeSolveRequest(req);
    expect(opts.data.universe.size).toBe(data.universe.size);
    expect(opts.inventory.threshold).toBe(50);
    expect([...opts.inventory.supply]).toContainEqual(['air', 100]);
    expect(opts.board.radius).toBe(2);
  });
});
