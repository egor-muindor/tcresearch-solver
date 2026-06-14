// run: bun tests/bench/solver.bench.ts
import { buildAspectData } from '../../app/src/data/aspects';
import { makeInventory, DEFAULT_THRESHOLD } from '../../app/src/core/inventory';
import { createBoard, setState, type Board } from '../../app/src/core/board';
import { solve, budgetForRadius } from '../../app/src/core/solver';

const data = buildAspectData();
const inv = makeInventory([...data.universe].map((a) => [a, 100] as [string, number]), DEFAULT_THRESHOLD);

function bench(label: string, radius: number, build: () => Board) {
  const t0 = Date.now();
  const r = solve({ data, board: build(), inventory: inv, budget: budgetForRadius(radius), now: () => Date.now() });
  console.log(label, r.status, 'cost=', r.cost, 'nodes=', r.stats.nodes, 'ms=', Date.now() - t0);
}

bench('R2/2-anchor', 2, () => {
  const b = createBoard(2);
  setState(b, { q: -1, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
  setState(b, { q: 1, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
  return b;
});

bench('R3/3-anchor', 3, () => {
  const b = createBoard(3);
  setState(b, { q: -2, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
  setState(b, { q: 2, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
  setState(b, { q: 0, r: 2 }, { kind: 'ANCHOR', aspect: 'fire' });
  return b;
});

bench('R4/4-anchor', 4, () => {
  const b = createBoard(4);
  setState(b, { q: -3, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
  setState(b, { q: 3, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
  setState(b, { q: 0, r: 3 }, { kind: 'ANCHOR', aspect: 'fire' });
  setState(b, { q: 0, r: -3 }, { kind: 'ANCHOR', aspect: 'water' });
  return b;
});

bench('R5/4-anchor', 5, () => {
  const b = createBoard(5);
  setState(b, { q: -4, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
  setState(b, { q: 4, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
  setState(b, { q: 0, r: 4 }, { kind: 'ANCHOR', aspect: 'fire' });
  setState(b, { q: 0, r: -4 }, { kind: 'ANCHOR', aspect: 'water' });
  return b;
});
