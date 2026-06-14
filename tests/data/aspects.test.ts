import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAspectData, iconLatin, AspectDataError } from '../../app/src/data/aspects';

// Canonical undirected edge set (each edge endpoints sorted, list sorted). Generated from the
// ported dictionaries; frozen as the normative fixture (spec §2.1).
const EXPECTED_EDGES = [
  'air--aura','air--flight','air--light','air--motion','air--senses','air--tree','air--void','air--weather',
  'armor--earth','armor--tool','aura--magic','beast--cloth','beast--flesh','beast--life','beast--man','beast--motion',
  'cheatiness--greed','cheatiness--mine','cloth--tool','cold--entropy','cold--fire','craft--man','craft--tool',
  'crop--harvest','crop--man','crop--plant','crystal--earth','crystal--metal','crystal--order','darkness--eldritch',
  'darkness--light','darkness--void','death--entropy','death--flesh','death--life','death--soul','death--undead',
  'earth--life','earth--metal','earth--mine','earth--plant','earth--travel','eldritch--void','electricity--energy',
  'electricity--mechanism','energy--fire','energy--magic','energy--order','energy--radioactivity','entropy--exchange',
  'entropy--poison','entropy--stupidity','entropy--taint','entropy--trap','entropy--void','envy--hunger','envy--senses',
  'exchange--order','fire--light','fire--mind','fire--nether','fire--weapon','fire--wrath','flesh--lust','flight--motion',
  'flight--pride','gluttony--hunger','gluttony--void','greed--hunger','greed--man','harvest--tool','heal--life',
  'heal--order','hunger--life','hunger--lust','hunger--void','life--plant','life--slime','life--soul','life--water',
  'light--radioactivity','magic--nether','magic--taint','magic--void','magnetism--metal','magnetism--travel','man--mind',
  'man--mine','man--tool','mechanism--motion','mechanism--tool','mind--soul','mind--stupidity','motion--order',
  'motion--trap','motion--travel','motion--undead','order--time','order--tool','plant--tree','poison--water',
  'pride--void','senses--soul','slime--water','sloth--soul','sloth--trap','time--void','tool--weapon','water--weather',
  'weapon--wrath',
];

describe('buildAspectData (defaults: 4.2.2.0 + fm/mb/gt)', () => {
  const data = buildAspectData();

  it('has 61 aspects in the universe', () => {
    expect(data.universe.size).toBe(61);
  });

  it('has exactly 6 primals with no combinations', () => {
    expect(data.primals.size).toBe(6);
    for (const p of data.primals) expect(data.combinations.has(p)).toBe(false);
  });

  it('builds exactly the canonical normative edge set (110 undirected edges)', () => {
    const edges = new Set<string>();
    for (const [a, nbrs] of data.adjacency) for (const b of nbrs) edges.add([a, b].sort().join('--'));
    const sorted = [...edges].sort();
    // Frozen reference edge set for 4.2.2.0 + fm/mb/gt (spec §2.1). Detects swapped/missing edges, not just count.
    expect(sorted).toEqual(EXPECTED_EDGES);
    expect(sorted).toHaveLength(110);
  });

  it('connects compound to each direct component (undirected)', () => {
    // magic = void + energy
    expect(data.adjacency.get('magic')!.has('void')).toBe(true);
    expect(data.adjacency.get('void')!.has('magic')).toBe(true);
    expect(data.adjacency.get('magic')!.has('energy')).toBe(true);
    // addon: electricity = energy + mechanism
    expect(data.adjacency.get('electricity')!.has('energy')).toBe(true);
    expect(data.adjacency.get('mechanism')!.has('electricity')).toBe(true);
  });

  it('does NOT connect siblings (shared parent is not an edge)', () => {
    // light = air+fire, energy = order+fire: both children of fire, but not linked to each other
    expect(data.adjacency.get('light')?.has('energy') ?? false).toBe(false);
    // primals are not linked to each other
    expect(data.adjacency.get('air')?.has('earth') ?? false).toBe(false);
  });

  it('includes every recipe component in the universe', () => {
    for (const [, [c1, c2]] of data.combinations) {
      expect(data.universe.has(c1)).toBe(true);
      expect(data.universe.has(c2)).toBe(true);
    }
  });

  it('has a latin translation and an existing color icon for every aspect', () => {
    const root = resolve(import.meta.dir, '../..');
    for (const a of data.universe) {
      const latin = iconLatin(data, a);
      expect(typeof latin).toBe('string');
      expect(existsSync(resolve(root, 'aspects/color', `${latin}.png`))).toBe(true);
    }
  });
});

describe('startup validation (fail loudly)', () => {
  it('throws AspectDataError naming the aspect on a self-referential recipe', () => {
    expect(() =>
      buildAspectData({ overrideCombinations: { foo: ['foo', 'air'] }, addons: [] }),
    ).toThrow(/foo/);
  });

  it('throws on a cycle (a<-b<-a)', () => {
    expect(() =>
      buildAspectData({ overrideCombinations: { acomp: ['bcomp', 'air'], bcomp: ['acomp', 'fire'] }, addons: [] }),
    ).toThrow(AspectDataError);
  });

  it('throws when a component is undefined (not primal, not a compound key)', () => {
    expect(() =>
      buildAspectData({ overrideCombinations: { x: ['air', 'doesnotexist'] }, addons: [] }),
    ).toThrow(/doesnotexist/);
  });

  it('throws when an aspect lacks a translation', () => {
    expect(() =>
      buildAspectData({ overrideCombinations: { untranslated: ['air', 'fire'] }, addons: [] }),
    ).toThrow(/untranslated/);
  });
});
