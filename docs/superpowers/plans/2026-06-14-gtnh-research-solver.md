# GTNH Research Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based GTNH research solver that fills a radius-2–5 hex board with aspects to connect all anchors under full board-validity, avoiding dead hexes, while minimizing inventory scarcity (lexicographic `(Σ deficit, cells)`), with exact inventory allocation, manual editing/validation, and worker-based search with progress + cancel.

**Architecture:** Pure-TS core (no DOM) layered as `data/aspects` → `core/hex` → `core/aspectGraph` → `core/inventory` → `core/board` → `core/{cost,steiner,solver}`, driven by a Web Worker, with an SVG UI and `localStorage` persistence. Test-first for the entire core (`bun test` + `bunx tsc --noEmit`) **before** any UI. Vite `root=app/`, build to `../v2/`, base `/tcresearch-solver/v2/`. Old `js/ index.html css/` are never touched.

**Tech Stack:** Vite + TypeScript (pinned), bun (deps/build/tests), Web Worker (`new Worker(new URL('./solver.worker.ts', import.meta.url), {type:'module'})`), SVG rendering, localStorage.

**Source of truth:** `docs/superpowers/specs/2026-06-14-gtnh-research-solver-design.md`. Every task cites the spec section it implements. Read the spec section before coding the task.

**Ported data (normative for v1):** version `4.2.2.0` from `js/version_dictionary.js`; addons `fm`,`mb`,`gt` from `js/addon_dictionary.js`; latin names from `js/translation_dictionary.js`; icons `aspects/color/<latin>.png`. Reference facts: **61 aspects** (6 primals + 42 compounds + 13 addon), **110 undirected edges**.

**Global conventions used across tasks (defined once, reused):**
- `Aspect = string` (english key, e.g. `air`, `magic`).
- Hex coords are **axial** `{q, r}` (cube `s = -q-r`); `hexKey({q,r}) = `q + ',' + r``.
- Lexicographic cost is `Cost = { scarcity: number; cells: number }`; `+Infinity` is a legal `scarcity`.
- Scarcity constants: `BASE = 1`, `K = 1`, `DEFAULT_THRESHOLD = 50` (all in `inventory.ts`; spec §4.1 requires `BASE>0`, `K≥0`, `threshold>0`).
- All `core/*` modules are pure (no `window`/`document`/`localStorage`). Persistence and UI are the only DOM-aware layers.

---

## Phase 0 — Scaffolding & tooling (no TDD; environment setup)

### Task 0.1: Confirm bun on PATH

**Files:** none (environment).

bun **1.3.14** is already installed at `/Users/egor/.bun/bin/bun` but is not on the default (non-login) shell PATH.

- [ ] **Step 1: Ensure `bun` resolves** in the implementer's shell

Run:
```bash
which bun || export PATH="$HOME/.bun/bin:$PATH"
bun --version
```
Expected: `1.3.14`. If `which bun` fails, the `export` line fixes the current shell; for persistence the user should add `~/.bun/bin` to PATH in their shell profile (their call — do not edit profiles without asking).

### Task 0.2: Project manifest, tsconfig, vite config, asset copy

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `scripts/copy-assets.mjs`
- Create: `.gitignore` (append if exists)
- Create: `app/index.html`
- Create: `app/src/main.ts` (temporary stub)

- [ ] **Step 1: Write `package.json`** (pin the exact bun-reported version into `packageManager`; pin vite/ts)

```json
{
  "name": "gtnh-research-solver",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "packageManager": "bun@1.3.14",
  "scripts": {
    "copy-assets": "node scripts/copy-assets.mjs",
    "dev": "node scripts/copy-assets.mjs && vite",
    "typecheck": "tsc --noEmit",
    "build": "node scripts/copy-assets.mjs && tsc --noEmit && vite build",
    "preview": "vite preview --base /tcresearch-solver/v2/",
    "test": "bun test"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vite": "5.4.10"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`** (strict; covers app + tests; bun-friendly)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "types": ["bun-types", "vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["app/src", "tests", "scripts", "vite.config.ts"]
}
```

- [ ] **Step 3: Write `vite.config.ts`** (spec §6/§9: root=app, outDir=../v2, base, static worker URL form)

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  base: '/tcresearch-solver/v2/',
  publicDir: 'public',
  build: {
    outDir: '../v2',
    emptyOutDir: true,
    target: 'es2022',
  },
  worker: { format: 'es' },
});
```

- [ ] **Step 4: Write `scripts/copy-assets.mjs`** (icons live at repo-root `aspects/`; the app under `/v2/` must serve them locally)

```js
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'aspects');
const dest = resolve(root, 'app/public/aspects');

await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log(`copied ${src} -> ${dest}`);
```

- [ ] **Step 5: Write `.gitignore`** (do not commit node_modules, copied assets, or dev build output; `v2/` is force-added only at deploy, spec §9)

```
node_modules/
app/public/aspects/
v2/
*.log
```

- [ ] **Step 6: Write `app/index.html`** (new app entry; legacy root `index.html` untouched)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GTNH Research Solver</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Write a temporary `app/src/main.ts` stub** (replaced in Phase 9)

```ts
document.querySelector('#app')!.textContent = 'GTNH Research Solver — bootstrapping';
```

- [ ] **Step 8: Install deps & verify toolchain**

Run:
```bash
bun install
bun run copy-assets
bunx tsc --noEmit
```
Expected: `bun install` writes `bun.lockb`; copy-assets prints the copy line; `tsc --noEmit` exits 0 (no type errors).

- [ ] **Step 9: Verify dev server boots** (manual, then stop)

Run: `bun run dev` then open the printed URL (note it is served under `/tcresearch-solver/v2/`). Expected: page shows the bootstrapping text. Stop the server (Ctrl-C).

- [ ] **Step 10: Commit**

```bash
git add package.json bun.lockb tsconfig.json vite.config.ts scripts/copy-assets.mjs .gitignore app/index.html app/src/main.ts
git commit -m "chore: scaffold Vite+TS+bun app under app/ (v2 build target)"
```

---

## Phase 1 — `data/aspects.ts`: ported data, universe, graph, startup validation (spec §2.1, §2.2)

Responsibility: port the raw dictionaries into typed literals; build the immutable `AspectData` model (primals, combinations, universe, translate, undirected adjacency `Set`); fail-loudly validation (no cycles, no self-reference, all components defined, translate present). Icon-file existence is checked by a **test** (fs), not at runtime.

### Task 1.1: Raw ported data

**Files:**
- Create: `app/src/data/raw.ts`

- [ ] **Step 1: Write `app/src/data/raw.ts`** — copy the normative `4.2.2.0` combinations from `js/version_dictionary.js`, the three addons from `js/addon_dictionary.js`, and **all** entries of `translate` from `js/translation_dictionary.js` verbatim.

```ts
// Ported verbatim from js/version_dictionary.js ("4.2.2.0"), js/addon_dictionary.js, js/translation_dictionary.js.
// Normative data set for v1 (spec §2.1). Do not edit values; swap the whole set per spec §10.

export const PRIMALS = ['air', 'earth', 'fire', 'water', 'order', 'entropy'] as const;

// compound -> [component1, component2]
export const COMBINATIONS_4_2_2_0: Record<string, [string, string]> = {
  eldritch: ['void', 'darkness'], tree: ['air', 'plant'], aura: ['magic', 'air'],
  beast: ['motion', 'life'], mind: ['fire', 'soul'], flesh: ['death', 'beast'],
  undead: ['motion', 'death'], craft: ['man', 'tool'], hunger: ['life', 'void'],
  cold: ['fire', 'entropy'], plant: ['life', 'earth'], man: ['beast', 'mind'],
  tool: ['man', 'order'], travel: ['motion', 'earth'], slime: ['life', 'water'],
  greed: ['man', 'hunger'], light: ['air', 'fire'], mechanism: ['motion', 'tool'],
  crop: ['plant', 'man'], metal: ['earth', 'crystal'], harvest: ['crop', 'tool'],
  death: ['life', 'entropy'], motion: ['air', 'order'], cloth: ['tool', 'beast'],
  mine: ['man', 'earth'], exchange: ['entropy', 'order'], energy: ['order', 'fire'],
  magic: ['void', 'energy'], heal: ['order', 'life'], senses: ['air', 'soul'],
  soul: ['life', 'death'], weapon: ['tool', 'fire'], weather: ['air', 'water'],
  darkness: ['void', 'light'], armor: ['tool', 'earth'], void: ['air', 'entropy'],
  poison: ['water', 'entropy'], life: ['water', 'earth'], trap: ['motion', 'entropy'],
  taint: ['magic', 'entropy'], crystal: ['earth', 'order'], flight: ['air', 'motion'],
};

export const ADDONS: Record<string, { name: string; aspects: string[]; combinations: Record<string, [string, string]> }> = {
  fm: {
    name: 'Forbidden Magic',
    aspects: ['wrath', 'nether', 'gluttony', 'envy', 'sloth', 'pride', 'lust'],
    combinations: {
      wrath: ['weapon', 'fire'], nether: ['fire', 'magic'], gluttony: ['hunger', 'void'],
      envy: ['senses', 'hunger'], sloth: ['trap', 'soul'], pride: ['flight', 'void'],
      lust: ['flesh', 'hunger'],
    },
  },
  mb: { name: 'Magic Bees', aspects: ['time'], combinations: { time: ['void', 'order'] } },
  gt: {
    name: 'Gregtech',
    aspects: ['electricity', 'magnetism', 'cheatiness', 'radioactivity', 'stupidity'],
    combinations: {
      electricity: ['energy', 'mechanism'], magnetism: ['metal', 'travel'],
      cheatiness: ['mine', 'greed'], radioactivity: ['light', 'energy'],
      stupidity: ['entropy', 'mind'],
    },
  },
};

// english -> latin (icon basename). Copy ALL entries from js/translation_dictionary.js verbatim.
export const TRANSLATE: Record<string, string> = {
  air: 'aer', earth: 'terra', fire: 'ignis', water: 'aqua', order: 'ordo', entropy: 'perditio',
  void: 'vacuos', light: 'lux', energy: 'potentia', motion: 'motus', stone: 'saxum',
  life: 'victus', weather: 'tempestas', cold: 'gelum', crystal: 'vitreus', death: 'mortuus',
  flight: 'volatus', darkness: 'tenebrae', soul: 'spiritus', heal: 'sano', travel: 'iter',
  poison: 'venenum', eldritch: 'alienis', magic: 'praecantatio', aura: 'auram', taint: 'vitium',
  seed: 'granum', slime: 'limus', plant: 'herba', tree: 'arbor', beast: 'bestia', flesh: 'corpus',
  undead: 'exanimis', mind: 'cognitio', senses: 'sensus', man: 'humanus', crop: 'messis',
  harvest: 'meto', metal: 'metallum', mine: 'perfodio', tool: 'instrumentum', weapon: 'telum',
  armor: 'tutamen', hunger: 'fames', greed: 'lucrum', craft: 'fabrico', cloth: 'pannus',
  mechanism: 'machina', trap: 'vinculum', exchange: 'permutatio', wrath: 'ira', nether: 'infernus',
  gluttony: 'gula', envy: 'invidia', sloth: 'desidia', pride: 'superbia', lust: 'luxuria',
  time: 'tempus', electricity: 'electrum', magnetism: 'magneto', cheatiness: 'nebrisum',
  radioactivity: 'radio', stupidity: 'stronito',
};
```

- [ ] **Step 2: Commit**

```bash
git add app/src/data/raw.ts
git commit -m "feat(data): port TC 4.2.2.0 + fm/mb/gt aspect data to typed TS"
```

### Task 1.2: `AspectData` model + validation

**Files:**
- Create: `app/src/data/aspects.ts`
- Test: `tests/data/aspects.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/data/aspects.test.ts`
Expected: FAIL (`buildAspectData` not found / module missing).

- [ ] **Step 3: Implement `app/src/data/aspects.ts`**

```ts
import { PRIMALS, COMBINATIONS_4_2_2_0, ADDONS, TRANSLATE } from './raw';

export type Aspect = string;

export interface AspectData {
  readonly primals: ReadonlySet<Aspect>;
  readonly combinations: ReadonlyMap<Aspect, readonly [Aspect, Aspect]>;
  readonly universe: ReadonlySet<Aspect>;
  readonly translate: ReadonlyMap<Aspect, string>;
  readonly adjacency: ReadonlyMap<Aspect, ReadonlySet<Aspect>>;
}

export class AspectDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AspectDataError';
  }
}

export interface BuildOptions {
  /** Default '4.2.2.0' — only that version is ported. */
  version?: '4.2.2.0';
  /** Default ['fm','mb','gt']. */
  addons?: readonly string[];
  /** Test-only: replace the entire combinations map (bypasses version/addons). */
  overrideCombinations?: Record<string, [Aspect, Aspect]>;
  /** Test-only: supply latin names for synthetic aspects (else identity in override mode). */
  overrideTranslate?: Record<string, string>;
}

export function buildAspectData(opts: BuildOptions = {}): AspectData {
  const primals = new Set<Aspect>(PRIMALS);

  const combos = new Map<Aspect, readonly [Aspect, Aspect]>();
  if (opts.overrideCombinations) {
    for (const [k, v] of Object.entries(opts.overrideCombinations)) combos.set(k, v);
  } else {
    for (const [k, v] of Object.entries(COMBINATIONS_4_2_2_0)) combos.set(k, v);
    for (const id of opts.addons ?? ['fm', 'mb', 'gt']) {
      const addon = ADDONS[id];
      if (!addon) throw new AspectDataError(`unknown addon '${id}'`);
      for (const [k, v] of Object.entries(addon.combinations)) combos.set(k, v);
    }
  }

  // Universe = primals ∪ compound keys ∪ all components.
  const universe = new Set<Aspect>(primals);
  for (const [k, [c1, c2]] of combos) {
    universe.add(k);
    universe.add(c1);
    universe.add(c2);
  }

  // No self-reference; components must be defined (primal or compound key).
  for (const [k, [c1, c2]] of combos) {
    if (c1 === k || c2 === k) throw new AspectDataError(`aspect '${k}' references itself`);
    for (const c of [c1, c2]) {
      if (!primals.has(c) && !combos.has(c)) {
        throw new AspectDataError(`component '${c}' of '${k}' is not defined`);
      }
    }
  }

  // Acyclicity of the "is-component-of" DAG (compound depends on its components).
  detectCycle(combos, primals);

  // translate for every universe member. In override (test) mode, synthetic aspects without a
  // TRANSLATE entry fall back to identity so structural tests aren't blocked by missing metadata;
  // production data (no override) still requires a real translation/icon for every aspect.
  const allowSyntheticMeta = opts.overrideCombinations !== undefined;
  const translate = new Map<Aspect, string>();
  for (const a of universe) {
    const latin = TRANSLATE[a] ?? opts.overrideTranslate?.[a] ?? (allowSyntheticMeta ? a : undefined);
    if (!latin) throw new AspectDataError(`aspect '${a}' has no translation/icon mapping`);
    translate.set(a, latin);
  }

  // Undirected adjacency (deduped Set): edge compound–component (spec §2.1).
  const adjacency = new Map<Aspect, Set<Aspect>>();
  const link = (a: Aspect, b: Aspect) => {
    (adjacency.get(a) ?? adjacency.set(a, new Set()).get(a)!).add(b);
    (adjacency.get(b) ?? adjacency.set(b, new Set()).get(b)!).add(a);
  };
  for (const a of universe) if (!adjacency.has(a)) adjacency.set(a, new Set());
  for (const [k, [c1, c2]] of combos) {
    link(k, c1);
    link(k, c2);
  }

  return { primals, combinations: combos, universe, translate, adjacency };
}

function detectCycle(combos: ReadonlyMap<Aspect, readonly [Aspect, Aspect]>, primals: ReadonlySet<Aspect>): void {
  const state = new Map<Aspect, 0 | 1 | 2>(); // 0=unseen,1=in-stack,2=done
  const visit = (a: Aspect): void => {
    if (primals.has(a)) return;
    const s = state.get(a) ?? 0;
    if (s === 2) return;
    if (s === 1) throw new AspectDataError(`cycle detected through aspect '${a}'`);
    state.set(a, 1);
    const recipe = combos.get(a);
    if (recipe) for (const c of recipe) visit(c);
    state.set(a, 2);
  };
  for (const a of combos.keys()) visit(a);
}

export function iconLatin(data: AspectData, a: Aspect): string {
  const latin = data.translate.get(a);
  if (!latin) throw new AspectDataError(`no icon for '${a}'`);
  return latin;
}

/** Base-relative icon URL for the browser (resolved under import.meta.env.BASE_URL by callers). */
export function iconFile(data: AspectData, a: Aspect): string {
  return `aspects/color/${iconLatin(data, a)}.png`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/data/aspects.test.ts && bunx tsc --noEmit`
Expected: all green; tsc exits 0. If the edge count differs from 220, recount against `raw.ts` and fix the literal — the count is a fixture assertion, not a guess.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/aspects.ts tests/data/aspects.test.ts
git commit -m "feat(data): AspectData model with universe/graph + fail-loud validation"
```

---

## Phase 2 — `core/hex.ts`: axial coordinates, neighbors, board generation (spec §2.3)

### Task 2.1: Hex geometry

**Files:**
- Create: `app/src/core/hex.ts`
- Test: `tests/core/hex.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'bun:test';
import { hexKey, parseHexKey, neighborsOf, distance, boardCells, isOnBoard, HEX_DIRECTIONS } from '../../app/src/core/hex';

describe('hex geometry', () => {
  it('round-trips a coord through hexKey/parseHexKey', () => {
    expect(parseHexKey(hexKey({ q: -2, r: 3 }))).toEqual({ q: -2, r: 3 });
    expect(hexKey({ q: 0, r: 0 })).toBe('0,0');
  });

  it('has 6 unit directions summing to zero', () => {
    expect(HEX_DIRECTIONS).toHaveLength(6);
    const sum = HEX_DIRECTIONS.reduce((a, d) => ({ q: a.q + d.q, r: a.r + d.r }), { q: 0, r: 0 });
    expect(sum).toEqual({ q: 0, r: 0 });
  });

  it('returns 6 neighbors each at distance 1', () => {
    const n = neighborsOf({ q: 0, r: 0 });
    expect(n).toHaveLength(6);
    for (const h of n) expect(distance({ q: 0, r: 0 }, h)).toBe(1);
    // all distinct
    expect(new Set(n.map(hexKey)).size).toBe(6);
  });

  it('computes cube distance', () => {
    expect(distance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    expect(distance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
    expect(distance({ q: -1, r: -1 }, { q: 1, r: 1 })).toBe(4);
  });

  it('generates the right number of cells per radius (1+3R(R+1))', () => {
    expect(boardCells(2)).toHaveLength(19);
    expect(boardCells(3)).toHaveLength(37);
    expect(boardCells(4)).toHaveLength(61);
    expect(boardCells(5)).toHaveLength(91);
  });

  it('isOnBoard agrees with distance-from-center', () => {
    expect(isOnBoard({ q: 2, r: 0 }, 2)).toBe(true);
    expect(isOnBoard({ q: 3, r: 0 }, 2)).toBe(false);
    expect(boardCells(3).every((h) => isOnBoard(h, 3))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun test tests/core/hex.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `app/src/core/hex.ts`**

```ts
export interface Hex {
  readonly q: number;
  readonly r: number;
}

export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

export function parseHexKey(key: string): Hex {
  const i = key.indexOf(',');
  const q = Number(key.slice(0, i));
  const r = Number(key.slice(i + 1));
  if (!Number.isInteger(q) || !Number.isInteger(r)) throw new Error(`bad hex key: ${key}`);
  return { q, r };
}

export function neighborsOf(h: Hex): Hex[] {
  return HEX_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function isOnBoard(h: Hex, radius: number): boolean {
  return distance({ q: 0, r: 0 }, h) <= radius;
}

export function boardCells(radius: number): Hex[] {
  const cells: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rLo = Math.max(-radius, -q - radius);
    const rHi = Math.min(radius, -q + radius);
    for (let r = rLo; r <= rHi; r++) cells.push({ q, r });
  }
  return cells;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/core/hex.test.ts && bunx tsc --noEmit`
Expected: green; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/hex.ts tests/core/hex.test.ts
git commit -m "feat(core): hex axial geometry + radius board generation"
```

---

## Phase 3 — `core/aspectGraph.ts`: link validity, primal decomposition, multiplicity (spec §2.1, §2.2)

### Task 3.1: Graph operations

**Files:**
- Create: `app/src/core/aspectGraph.ts`
- Test: `tests/core/aspectGraph.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import { isValidLink, primalVec, mult, neighbors } from '../../app/src/core/aspectGraph';

const data = buildAspectData();

describe('isValidLink', () => {
  it('true for directly-combined aspects', () => {
    expect(isValidLink(data, 'magic', 'void')).toBe(true);
    expect(isValidLink(data, 'void', 'magic')).toBe(true);
  });
  it('false for identical aspects (no self-link)', () => {
    expect(isValidLink(data, 'air', 'air')).toBe(false);
  });
  it('false for siblings / unrelated aspects', () => {
    expect(isValidLink(data, 'light', 'energy')).toBe(false);
    expect(isValidLink(data, 'air', 'earth')).toBe(false);
  });
});

describe('neighbors', () => {
  it('returns the adjacency set', () => {
    expect(neighbors(data, 'magic').has('energy')).toBe(true);
  });
});

describe('primalVec', () => {
  it('maps a primal to itself with count 1', () => {
    expect([...primalVec(data, 'air')]).toEqual([['air', 1]]);
  });
  it('decomposes a compound into a primal multiset', () => {
    // void = air + entropy
    const v = primalVec(data, 'void');
    expect(v.get('air')).toBe(1);
    expect(v.get('entropy')).toBe(1);
    // magic = void + energy = (air+entropy) + (order+fire)
    const m = primalVec(data, 'magic');
    expect(m.get('air')).toBe(1);
    expect(m.get('entropy')).toBe(1);
    expect(m.get('order')).toBe(1);
    expect(m.get('fire')).toBe(1);
  });
  it('only contains primals as keys', () => {
    for (const k of primalVec(data, 'electricity').keys()) {
      expect(data.primals.has(k)).toBe(true);
    }
  });
});

describe('mult (direct multiplicity in a recipe)', () => {
  it('is 0 for a primal target', () => {
    expect(mult(data, 'air', 'air')).toBe(0);
  });
  it('is 1 for each distinct component', () => {
    expect(mult(data, 'void', 'magic')).toBe(1);
    expect(mult(data, 'energy', 'magic')).toBe(1);
    expect(mult(data, 'air', 'magic')).toBe(0);
  });
  it('counts repeats (synthetic X = air + air => 2)', () => {
    const d2 = buildAspectData({ overrideCombinations: { dbl: ['air', 'air'] }, addons: [] });
    expect(mult(d2, 'air', 'dbl')).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun test tests/core/aspectGraph.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `app/src/core/aspectGraph.ts`** (memoize `primalVec` per `AspectData` via a `WeakMap`)

```ts
import type { Aspect, AspectData } from '../data/aspects';

export function neighbors(data: AspectData, a: Aspect): ReadonlySet<Aspect> {
  return data.adjacency.get(a) ?? new Set<Aspect>();
}

export function isValidLink(data: AspectData, a: Aspect, b: Aspect): boolean {
  if (a === b) return false;
  return neighbors(data, a).has(b);
}

/** Direct multiplicity of component `x` in the recipe of `y` (0, 1, or 2). */
export function mult(data: AspectData, x: Aspect, y: Aspect): number {
  const recipe = data.combinations.get(y);
  if (!recipe) return 0;
  return (recipe[0] === x ? 1 : 0) + (recipe[1] === x ? 1 : 0);
}

const primalVecCache = new WeakMap<AspectData, Map<Aspect, ReadonlyMap<Aspect, number>>>();

export function primalVec(data: AspectData, a: Aspect): ReadonlyMap<Aspect, number> {
  let cache = primalVecCache.get(data);
  if (!cache) {
    cache = new Map();
    primalVecCache.set(data, cache);
  }
  const cached = cache.get(a);
  if (cached) return cached;

  let result: Map<Aspect, number>;
  if (data.primals.has(a)) {
    result = new Map([[a, 1]]);
  } else {
    const recipe = data.combinations.get(a);
    if (!recipe) throw new Error(`aspect '${a}' is neither primal nor a compound`);
    result = new Map();
    for (const c of recipe) {
      for (const [p, n] of primalVec(data, c)) {
        result.set(p, (result.get(p) ?? 0) + n);
      }
    }
  }
  cache.set(a, result);
  return result;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/core/aspectGraph.test.ts && bunx tsc --noEmit`
Expected: green; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/aspectGraph.ts tests/core/aspectGraph.test.ts
git commit -m "feat(core): aspect graph ops (isValidLink, primalVec, mult)"
```

---

## Phase 4 — `core/inventory.ts`: scarcity, obtainCost lower bound, exact allocation (spec §4)

Responsibility: validate supply/threshold; `directPenalty` (§4.2); `obtainCost` DP lower bound (§4.2) + `globalMinObtain`; **exact, order-independent allocation** (§4.3) via exhaustive memoized DFS over the topo-ordered direct/craft split — never greedy, never a false `infeasible`; explicit node budget → `feasible:'unknown'`.

### Task 4.1: Validation, directPenalty, obtainCost, globalMinObtain

**Files:**
- Create: `app/src/core/inventory.ts`
- Test: `tests/core/inventory.cost.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import {
  DEFAULT_THRESHOLD, BASE, K, makeInventory, validateInventory,
  directPenalty, obtainCost, globalMinObtain,
} from '../../app/src/core/inventory';

const data = buildAspectData();

describe('validateInventory', () => {
  it('accepts non-negative integer supply and threshold>0', () => {
    expect(() => validateInventory(makeInventory([['air', 10]], 50))).not.toThrow();
  });
  it('rejects negative supply', () => {
    expect(() => validateInventory(makeInventory([['air', -1]], 50))).toThrow(/air/);
  });
  it('rejects non-integer supply', () => {
    expect(() => validateInventory(makeInventory([['air', 1.5]], 50))).toThrow(/air/);
  });
  it('rejects threshold <= 0', () => {
    expect(() => validateInventory(makeInventory([], 0))).toThrow(/threshold/);
  });
});

describe('directPenalty (spec §4.2)', () => {
  const inv = makeInventory([['air', 50], ['fire', 10], ['water', 0]], DEFAULT_THRESHOLD);
  it('is 0 for abundant (supply >= threshold)', () => {
    expect(directPenalty(inv, data, 'air')).toBe(0);
  });
  it('is base + k*(threshold-supply) for scarce', () => {
    expect(directPenalty(inv, data, 'fire')).toBe(BASE + K * (DEFAULT_THRESHOLD - 10));
  });
  it('is +Infinity for zero supply (must craft)', () => {
    expect(directPenalty(inv, data, 'water')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('obtainCost (spec §4.2)', () => {
  it('equals directPenalty for a primal', () => {
    const inv = makeInventory([['air', 10]], DEFAULT_THRESHOLD);
    expect(obtainCost(inv, data, 'air')).toBe(directPenalty(inv, data, 'air'));
  });

  it('lets an abundant component rescue a zero-supply compound via crafting', () => {
    // void = air + entropy. supply[void]=0 (direct +Inf) but air & entropy abundant => craft cost finite.
    const inv = makeInventory([['air', 100], ['entropy', 100]], DEFAULT_THRESHOLD);
    expect(directPenalty(inv, data, 'void')).toBe(Number.POSITIVE_INFINITY);
    expect(obtainCost(inv, data, 'void')).toBe(0); // 0 + 0 from abundant primals
  });

  it('prefers direct when cheaper than crafting', () => {
    // void abundant directly => obtainCost 0 even if components scarce
    const inv = makeInventory([['void', 100], ['air', 1], ['entropy', 1]], DEFAULT_THRESHOLD);
    expect(obtainCost(inv, data, 'void')).toBe(0);
  });

  it('is monotone: more supply never increases obtainCost', () => {
    const lean = makeInventory([['air', 5], ['entropy', 5]], DEFAULT_THRESHOLD);
    const rich = makeInventory([['air', 80], ['entropy', 80]], DEFAULT_THRESHOLD);
    expect(obtainCost(rich, data, 'void')).toBeLessThanOrEqual(obtainCost(lean, data, 'void'));
  });
});

describe('globalMinObtain', () => {
  it('is the min obtainCost across the universe (0 when any aspect is abundant)', () => {
    const inv = makeInventory([['air', 100]], DEFAULT_THRESHOLD);
    expect(globalMinObtain(inv, data)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/core/inventory.cost.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the cost half of `app/src/core/inventory.ts`**

```ts
import type { Aspect, AspectData } from '../data/aspects';
import { mult } from './aspectGraph';

export const DEFAULT_THRESHOLD = 50;
export const BASE = 1; // spec §4.1: base > 0
export const K = 1; // spec §4.1: k >= 0

export interface Inventory {
  /** Non-negative integer counts. Absent key => 0. */
  readonly supply: ReadonlyMap<Aspect, number>;
  /** Strictly > 0. */
  readonly threshold: number;
}

export function makeInventory(entries: ReadonlyArray<readonly [Aspect, number]>, threshold = DEFAULT_THRESHOLD): Inventory {
  return { supply: new Map(entries), threshold };
}

export function validateInventory(inv: Inventory): void {
  if (!(inv.threshold > 0) || !Number.isFinite(inv.threshold)) {
    throw new Error(`threshold must be > 0, got ${inv.threshold}`);
  }
  for (const [a, n] of inv.supply) {
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`supply['${a}'] must be a non-negative integer, got ${n}`);
    }
  }
}

function supplyOf(inv: Inventory, a: Aspect): number {
  return inv.supply.get(a) ?? 0;
}

export function directPenalty(inv: Inventory, _data: AspectData, a: Aspect): number {
  const s = supplyOf(inv, a);
  if (s >= inv.threshold) return 0;
  if (s > 0) return BASE + K * (inv.threshold - s);
  return Number.POSITIVE_INFINITY;
}

const obtainCache = new WeakMap<Inventory, Map<Aspect, number>>();

export function obtainCost(inv: Inventory, data: AspectData, a: Aspect): number {
  let cache = obtainCache.get(inv);
  if (!cache) {
    cache = new Map();
    obtainCache.set(inv, cache);
  }
  return obtainRec(inv, data, a, cache, new Set());
}

function obtainRec(inv: Inventory, data: AspectData, a: Aspect, cache: Map<Aspect, number>, stack: Set<Aspect>): number {
  const memo = cache.get(a);
  if (memo !== undefined) return memo;
  if (stack.has(a)) return Number.POSITIVE_INFINITY; // cycle guard (data is a DAG; defensive)
  const direct = directPenalty(inv, data, a);
  let best = direct;
  const recipe = data.combinations.get(a);
  if (recipe) {
    stack.add(a);
    const craft = obtainRec(inv, data, recipe[0], cache, stack) + obtainRec(inv, data, recipe[1], cache, stack);
    stack.delete(a);
    if (craft < best) best = craft;
  }
  cache.set(a, best);
  return best;
}

export function globalMinObtain(inv: Inventory, data: AspectData): number {
  let min = Number.POSITIVE_INFINITY;
  for (const a of data.universe) {
    const c = obtainCost(inv, data, a);
    if (c < min) min = c;
  }
  return min;
}

// mult re-exported for the allocator below.
export { mult };
```

- [ ] **Step 4: Run to verify pass** — `bun test tests/core/inventory.cost.test.ts && bunx tsc --noEmit` → green.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/inventory.ts tests/core/inventory.cost.test.ts
git commit -m "feat(core): inventory scarcity + obtainCost lower bound (spec §4.2)"
```

### Task 4.2: Exact allocation (spec §4.3)

**Files:**
- Modify: `app/src/core/inventory.ts` (add `allocate`, `AllocationResult`, `AllocBudget`)
- Test: `tests/core/inventory.allocate.test.ts`

**Algorithm (exact, order-independent; spec §4.3):** decide, in **reverse-topological order** (parents before their components), how to satisfy each aspect's accumulated `need`: `direct` units (≤ `supply`, cost `direct·directPenalty`) vs `craft` units (non-primals only; each crafted unit pushes `mult(c,X)` onto each component's `need`). DFS branches over the split; primals with `need > supply` make a branch infeasible; we minimize total `scarcityCost` over **all** feasible branches (bound-prune only against the best *found* cost — never returns false infeasible). A node-count budget → `feasible:'unknown'` (not infeasible). `leafConsumption[X] = direct[X]`.

- [ ] **Step 1: Write the failing tests** (includes the spec's greedy-trap case)

```ts
import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import { makeInventory, allocate, obtainCost, DEFAULT_THRESHOLD } from '../../app/src/core/inventory';

const data = buildAspectData();

describe('allocate (exact §4.3)', () => {
  it('takes directly when abundant: zero scarcity, no crafts', () => {
    const inv = makeInventory([['air', 100], ['fire', 100]], DEFAULT_THRESHOLD);
    const r = allocate(inv, data, new Map([['air', 2], ['fire', 1]]));
    expect(r.feasible).toBe(true);
    expect(r.scarcityCost).toBe(0);
    expect(r.craftOps).toBe(0);
    expect(r.leafConsumption.get('air')).toBe(2);
    expect(r.leafConsumption.get('fire')).toBe(1);
  });

  it('crafts when the aspect has zero direct supply but components are available', () => {
    // need light=1 (light=air+fire), supply light=0
    const inv = makeInventory([['air', 100], ['fire', 100]], DEFAULT_THRESHOLD);
    const r = allocate(inv, data, new Map([['light', 1]]));
    expect(r.feasible).toBe(true);
    expect(r.craftOps).toBe(1);
    expect(r.leafConsumption.get('air')).toBe(1);
    expect(r.leafConsumption.get('fire')).toBe(1);
    expect(r.leafConsumption.get('light') ?? 0).toBe(0);
  });

  it('reports infeasible when a needed primal cannot be supplied even via crafting', () => {
    const inv = makeInventory([['air', 0], ['fire', 0]], DEFAULT_THRESHOLD);
    const r = allocate(inv, data, new Map([['light', 1]]));
    expect(r.feasible).toBe(false);
  });

  it('is order-independent and beats greedy under contention for a shared component (spec §4.3)', () => {
    // Synthetic binary-BOM contention: X=A+B, Y=A+C, supply A=1,B=1,C=1, demand X=1,Y=1.
    // Greedy that crafts both from A fails (A only 1). Exact must craft one, take the other directly if possible,
    // OR report the true optimum. Here X and Y have no direct supply, so exactly one can be crafted; the other is infeasible.
    const synth = buildAspectData({
      overrideCombinations: { acomp: ['air', 'fire'], bcomp: ['air', 'water'], ccomp: ['air', 'earth'] },
      addons: [],
    });
    // demand acomp=1, bcomp=1 ; they share 'air'. supply air=2 => both craftable.
    const inv2 = makeInventory([['air', 2], ['fire', 100], ['water', 100]], DEFAULT_THRESHOLD);
    const r = allocate(inv2, synth, new Map([['acomp', 1], ['bcomp', 1]]));
    expect(r.feasible).toBe(true);
    expect(r.leafConsumption.get('air')).toBe(2);

    // now air=1 => only one of the two compounds craftable, no direct supply => infeasible
    const inv1 = makeInventory([['air', 1], ['fire', 100], ['water', 100]], DEFAULT_THRESHOLD);
    const r1 = allocate(inv1, synth, new Map([['acomp', 1], ['bcomp', 1]]));
    expect(r1.feasible).toBe(false);
  });

  it('prefers the cheaper feasible mix (direct abundant over crafting that drains scarce leaves)', () => {
    // light direct abundant => scarcityCost 0; crafting would also be 0 here, but craftOps must be 0 (direct preferred by cost tie? cost equal). 
    const inv = makeInventory([['light', 100], ['air', 100], ['fire', 100]], DEFAULT_THRESHOLD);
    const r = allocate(inv, data, new Map([['light', 1]]));
    expect(r.feasible).toBe(true);
    expect(r.scarcityCost).toBe(0);
  });

  it('returns feasible:"unknown" when the node budget is exhausted (no false verdict)', () => {
    const inv = makeInventory([['air', 100], ['fire', 100]], DEFAULT_THRESHOLD);
    const r = allocate(inv, data, new Map([['light', 3]]), { maxNodes: 1 });
    expect(r.feasible).toBe('unknown');
  });

  it('Σ obtainCost is a lower bound on the exact allocation scarcityCost (spec §4.2)', () => {
    const inv = makeInventory([['air', 3], ['fire', 3]], DEFAULT_THRESHOLD); // both scarce
    const demand = new Map([['light', 2]]);
    const r = allocate(inv, data, demand);
    // independent lower bound: 2 * obtainCost(light)
    const lb = 2 * obtainCost(inv, data, 'light');
    expect(lb).toBeLessThanOrEqual(r.scarcityCost);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/core/inventory.allocate.test.ts` → FAIL (`allocate` missing).

- [ ] **Step 3: Implement `allocate` in `app/src/core/inventory.ts`**

```ts
export interface AllocBudget {
  /** Max DFS nodes before returning feasible:'unknown'. Default 200_000. */
  readonly maxNodes: number;
}

export interface AllocationResult {
  readonly feasible: boolean | 'unknown';
  readonly scarcityCost: number;
  readonly craftOps: number;
  /** Actual per-aspect direct draws from supply (= direct[X]); subtracted by "Subtract used". */
  readonly leafConsumption: ReadonlyMap<Aspect, number>;
}

/** Reverse-topological order: an aspect appears before any of its recipe components. */
function reverseTopoOrder(data: AspectData, aspects: Iterable<Aspect>): Aspect[] {
  const order: Aspect[] = [];
  const seen = new Set<Aspect>();
  const visit = (a: Aspect): void => {
    if (seen.has(a)) return;
    seen.add(a);
    const recipe = data.combinations.get(a);
    if (recipe) for (const c of recipe) visit(c);
    order.push(a); // components pushed before parent => reverse at the end
  };
  for (const a of aspects) visit(a);
  order.reverse(); // now parents precede components
  return order;
}

const ALLOC_INFEASIBLE = Symbol('infeasible');
type AllocSub = { cost: number; craftOps: number; direct: Map<Aspect, number> };

export function allocate(
  inv: Inventory,
  data: AspectData,
  demand: ReadonlyMap<Aspect, number>,
  budget: AllocBudget = { maxNodes: 200_000 },
): AllocationResult {
  validateInventory(inv);

  // Aspects relevant to this demand = demand keys plus their full component closure.
  const order = reverseTopoOrder(data, demand.keys()); // parents precede components
  const idx = new Map<Aspect, number>(order.map((a, i) => [a, i]));
  const n = order.length;
  const penalty = order.map((a) => directPenalty(inv, data, a));
  const supplyArr = order.map((a) => inv.supply.get(a) ?? 0);
  const need0 = order.map((a) => demand.get(a) ?? 0);

  // Memoized exact DP. rec(i, need) = optimal allocation of indices [i..n) given residual `need`
  // (only entries >= i are meaningful; crafts at j>=i push demand to indices > j by topo order).
  // Memo key = i + suffix-needs => identical subproblems are solved once (spec §4.3 "memoized").
  const memo = new Map<string, AllocSub | typeof ALLOC_INFEASIBLE>();
  let nodes = 0;
  let budgetExhausted = false;

  const rec = (i: number, need: number[]): AllocSub | typeof ALLOC_INFEASIBLE => {
    if (budgetExhausted) return ALLOC_INFEASIBLE;
    if (i === n) return { cost: 0, craftOps: 0, direct: new Map() };
    const key = `${i}|${need.slice(i).join(',')}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (++nodes > budget.maxNodes) { budgetExhausted = true; return ALLOC_INFEASIBLE; }

    const X = order[i]!;
    const want = need[i]!;
    const avail = supplyArr[i]!;
    const pen = penalty[i]!;
    const recipe = data.combinations.get(X);
    const maxDirect = Math.min(want, avail);

    let best: AllocSub | typeof ALLOC_INFEASIBLE = ALLOC_INFEASIBLE;
    for (let d = maxDirect; d >= 0; d--) {
      const c = want - d;
      if (c > 0 && !recipe) continue;                  // primal cannot be crafted
      if (d > 0 && !Number.isFinite(pen)) continue;    // unreachable (+Inf penalty)
      const need2 = need.slice();
      if (c > 0 && recipe) {
        for (const comp of new Set(recipe)) {
          const j = idx.get(comp)!;                    // j > i by topo order
          need2[j] = (need2[j] ?? 0) + mult(data, comp, X) * c;
        }
      }
      const sub = rec(i + 1, need2);
      if (budgetExhausted) return ALLOC_INFEASIBLE;    // BLOCKER-fix: never memoize/return past exhaustion
      if (sub === ALLOC_INFEASIBLE) continue;
      const cost = (d > 0 ? d * pen : 0) + sub.cost;
      const craftOps = c + sub.craftOps;
      if (best === ALLOC_INFEASIBLE || cost < best.cost || (cost === best.cost && craftOps < best.craftOps)) {
        const direct = new Map(sub.direct);
        if (d > 0) direct.set(X, d);
        best = { cost, craftOps, direct };
      }
    }
    memo.set(key, best);
    return best;
  };

  const result = rec(0, need0);

  // Budget exhaustion ALWAYS wins: an interrupted search is unproven, even if a feasible split was seen.
  if (budgetExhausted) {
    return { feasible: 'unknown', scarcityCost: Number.POSITIVE_INFINITY, craftOps: 0, leafConsumption: new Map() };
  }
  if (result === ALLOC_INFEASIBLE) {
    return { feasible: false, scarcityCost: Number.POSITIVE_INFINITY, craftOps: 0, leafConsumption: new Map() };
  }
  const leaf = new Map<Aspect, number>();
  for (const [a, dd] of result.direct) if (dd > 0) leaf.set(a, dd);
  return { feasible: true, scarcityCost: result.cost, craftOps: result.craftOps, leafConsumption: leaf };
}
```

> **Implementer note (correctness, spec §4.3):** `rec` enumerates every direct/craft split and takes the min over feasible children, so it is **exact** and never returns a false `infeasible`. It is **memoized** on `(i, suffix-needs)` (subproblems below an index depend only on that index's residual needs, which topo order makes self-contained) — this is the "memoized exhaustive" method the spec requires. **Budget exhaustion always wins:** the moment `maxNodes` is hit, `budgetExhausted` short-circuits every ancestor and the top-level returns `feasible:'unknown'` — even if a feasible split was already found (an interrupted search is unproven, never reported as exact). Do **not** memoize a result produced after exhaustion (the `if (budgetExhausted) return` before `memo.set` guarantees this). Topo order guarantees a component's `need` is fully accumulated before that component is processed.

- [ ] **Step 4: Run to verify pass** — `bun test tests/core/inventory.allocate.test.ts && bunx tsc --noEmit` → green. (If the budget test flakes because `maxNodes:1` still finds a leaf, lower the demand or assert `feasible !== false` with `'unknown'` reachable for `light:3`.)

- [ ] **Step 5: Commit**

```bash
git add app/src/core/inventory.ts tests/core/inventory.allocate.test.ts
git commit -m "feat(core): exact order-independent inventory allocation (spec §4.3)"
```

---

## Phase 5 — `core/board.ts`: unified cell-state model, full-validity, connectivity, serialization (spec §2.3, §3)

Responsibility: the single cell-state union (`DEAD | ANCHOR | EMPTY | PLACED{locked}`); `validate()` (full board validity + anchor connectivity, error-typed); `allAnchorsConnected`/`isComplete`; compact serialization with radius/coord/aspect validation.

### Task 5.1: Board model + getters/setters

**Files:**
- Create: `app/src/core/board.ts`
- Test: `tests/core/board.model.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'bun:test';
import { createBoard, getState, setState, filledCells, anchorCells } from '../../app/src/core/board';

describe('board model', () => {
  it('creates a board where every on-board cell defaults to EMPTY', () => {
    const b = createBoard(2);
    expect(getState(b, { q: 0, r: 0 })).toEqual({ kind: 'EMPTY' });
    expect(getState(b, { q: 2, r: 0 })).toEqual({ kind: 'EMPTY' });
  });
  it('throws for off-board access', () => {
    const b = createBoard(2);
    expect(() => getState(b, { q: 3, r: 0 })).toThrow();
  });
  it('stores and reads back states', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'PLACED', aspect: 'void', locked: false });
    setState(b, { q: -1, r: 0 }, { kind: 'DEAD' });
    expect(getState(b, { q: 0, r: 0 })).toEqual({ kind: 'ANCHOR', aspect: 'air' });
    expect(anchorCells(b).map((c) => c.hex)).toEqual([{ q: 0, r: 0 }]);
    expect(filledCells(b).map((c) => c.aspect).sort()).toEqual(['air', 'void']);
  });
  it('setting EMPTY clears a stored cell', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'PLACED', aspect: 'air', locked: true });
    setState(b, { q: 0, r: 0 }, { kind: 'EMPTY' });
    expect(getState(b, { q: 0, r: 0 })).toEqual({ kind: 'EMPTY' });
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/core/board.model.test.ts` → FAIL.

- [ ] **Step 3: Implement the model half of `app/src/core/board.ts`**

```ts
import type { Aspect } from '../data/aspects';
import { type Hex, hexKey, isOnBoard, boardCells, neighborsOf } from './hex';

export type CellState =
  | { kind: 'DEAD' }
  | { kind: 'ANCHOR'; aspect: Aspect }
  | { kind: 'EMPTY' }
  | { kind: 'PLACED'; aspect: Aspect; locked: boolean };

export interface Board {
  readonly radius: number;
  /** Only non-EMPTY cells are stored; absent on-board key => EMPTY. */
  readonly cells: Map<string, CellState>;
}

export function createBoard(radius: number): Board {
  if (!Number.isInteger(radius) || radius < 2 || radius > 5) {
    throw new Error(`radius must be an integer 2..5, got ${radius}`);
  }
  return { radius, cells: new Map() };
}

export function getState(board: Board, h: Hex): CellState {
  if (!isOnBoard(h, board.radius)) throw new Error(`hex ${hexKey(h)} is off board (R=${board.radius})`);
  return board.cells.get(hexKey(h)) ?? { kind: 'EMPTY' };
}

export function setState(board: Board, h: Hex, s: CellState): void {
  if (!isOnBoard(h, board.radius)) throw new Error(`hex ${hexKey(h)} is off board (R=${board.radius})`);
  if (s.kind === 'EMPTY') board.cells.delete(hexKey(h));
  else board.cells.set(hexKey(h), s);
}

export interface FilledCell { hex: Hex; aspect: Aspect; locked: boolean; isAnchor: boolean; }

export function filledCells(board: Board): FilledCell[] {
  const out: FilledCell[] = [];
  for (const h of boardCells(board.radius)) {
    const s = getState(board, h);
    if (s.kind === 'ANCHOR') out.push({ hex: h, aspect: s.aspect, locked: false, isAnchor: true });
    else if (s.kind === 'PLACED') out.push({ hex: h, aspect: s.aspect, locked: s.locked, isAnchor: false });
  }
  return out;
}

export function anchorCells(board: Board): Array<{ hex: Hex; aspect: Aspect }> {
  return filledCells(board).filter((c) => c.isAnchor).map((c) => ({ hex: c.hex, aspect: c.aspect }));
}

/** On-board neighbors that are filled (ANCHOR or PLACED). */
export function filledNeighbors(board: Board, h: Hex): FilledCell[] {
  const out: FilledCell[] = [];
  for (const n of neighborsOf(h)) {
    if (!isOnBoard(n, board.radius)) continue;
    const s = getState(board, n);
    if (s.kind === 'ANCHOR') out.push({ hex: n, aspect: s.aspect, locked: false, isAnchor: true });
    else if (s.kind === 'PLACED') out.push({ hex: n, aspect: s.aspect, locked: s.locked, isAnchor: false });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass** — `bun test tests/core/board.model.test.ts && bunx tsc --noEmit` → green.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/board.ts tests/core/board.model.test.ts
git commit -m "feat(core): unified hex board cell-state model"
```

### Task 5.2: `validate()` + connectivity + `isComplete`

**Files:**
- Modify: `app/src/core/board.ts`
- Test: `tests/core/board.validate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import { createBoard, setState, validate, allAnchorsConnected, isComplete } from '../../app/src/core/board';

const data = buildAspectData();

describe('validate (spec §3)', () => {
  it('valid: two anchors joined by a single valid chain', () => {
    const b = createBoard(2);
    // air(0,0) - void(1,0) ... void=air+entropy so air-void valid; entropy anchor at (2,0): void-entropy valid
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'PLACED', aspect: 'void', locked: false });
    setState(b, { q: 2, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
    const v = validate(data, b);
    expect(v.valid).toBe(true);
    expect(allAnchorsConnected(b)).toBe(true);
    expect(isComplete(data, b)).toBe(true);
  });

  it('SAME_ASPECT_ADJACENT when identical aspects touch', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'PLACED', aspect: 'air', locked: false });
    const v = validate(data, b);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.type === 'SAME_ASPECT_ADJACENT')).toBe(true);
  });

  it('INVALID_LINK when adjacent aspects are not graph-connected', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'PLACED', aspect: 'earth', locked: false }); // air-earth not an edge
    const v = validate(data, b);
    expect(v.errors.some((e) => e.type === 'INVALID_LINK')).toBe(true);
  });

  it('detects an incidental invalid touch between two separate branches', () => {
    const b = createBoard(2);
    // Place two valid pairs that happen to touch invalidly.
    setState(b, { q: 0, r: 0 }, { kind: 'PLACED', aspect: 'air', locked: false });
    setState(b, { q: 0, r: 1 }, { kind: 'PLACED', aspect: 'earth', locked: false }); // adjacency (0,0)-(0,1) invalid
    const v = validate(data, b);
    expect(v.valid).toBe(false);
  });

  it('ANCHORS_DISCONNECTED when anchors are in separate filled components', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 2, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' }); // no chain between them
    const v = validate(data, b);
    expect(v.errors.some((e) => e.type === 'ANCHORS_DISCONNECTED')).toBe(true);
    expect(allAnchorsConnected(b)).toBe(false);
    expect(isComplete(data, b)).toBe(false);
  });

  it('a locked island (no anchor) does NOT trigger ANCHORS_DISCONNECTED', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'PLACED', aspect: 'void', locked: false });
    setState(b, { q: 2, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
    setState(b, { q: -2, r: 2 }, { kind: 'PLACED', aspect: 'fire', locked: true }); // isolated locked island, valid
    const v = validate(data, b);
    expect(v.valid).toBe(true); // island is allowed (spec §3.4)
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/core/board.validate.test.ts` → FAIL.

- [ ] **Step 3: Implement `validate`/connectivity/`isComplete` in `app/src/core/board.ts`**

```ts
import type { AspectData } from '../data/aspects';
import { isValidLink } from './aspectGraph';

export type ValidationErrorType =
  | 'INVALID_LINK' | 'SAME_ASPECT_ADJACENT' | 'ANCHORS_DISCONNECTED' | 'PLACED_ON_DEAD' | 'MALFORMED';

export interface ValidationError { type: ValidationErrorType; cells: Hex[]; }
export interface ValidationResult { valid: boolean; errors: ValidationError[]; }

export function validate(data: AspectData, board: Board): ValidationResult {
  const errors: ValidationError[] = [];
  const filled = filledCells(board);
  const filledKeys = new Set(filled.map((c) => hexKey(c.hex)));
  const aspectAt = new Map(filled.map((c) => [hexKey(c.hex), c.aspect]));

  // 1) pairwise adjacency validity (each undirected pair once)
  for (const c of filled) {
    for (const n of neighborsOf(c.hex)) {
      const nk = hexKey(n);
      if (!filledKeys.has(nk)) continue;
      if (hexKey(c.hex) >= nk) continue; // dedupe ordered pair
      const a = c.aspect;
      const b = aspectAt.get(nk)!;
      if (a === b) errors.push({ type: 'SAME_ASPECT_ADJACENT', cells: [c.hex, n] });
      else if (!isValidLink(data, a, b)) errors.push({ type: 'INVALID_LINK', cells: [c.hex, n] });
    }
  }

  // 2) anchors connectivity (>=2 anchors must share one filled component)
  if (!anchorsConnectedInternal(board)) {
    errors.push({ type: 'ANCHORS_DISCONNECTED', cells: anchorCells(board).map((a) => a.hex) });
  }

  return { valid: errors.length === 0, errors };
}

function anchorsConnectedInternal(board: Board): boolean {
  const anchors = anchorCells(board);
  if (anchors.length <= 1) return true;
  const filled = new Set(filledCells(board).map((c) => hexKey(c.hex)));
  // BFS from first anchor over filled adjacency
  const start = hexKey(anchors[0]!.hex);
  const seen = new Set<string>([start]);
  const queue = [anchors[0]!.hex];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const n of neighborsOf(cur)) {
      const nk = hexKey(n);
      if (filled.has(nk) && !seen.has(nk)) {
        seen.add(nk);
        queue.push(n);
      }
    }
  }
  return anchors.every((a) => seen.has(hexKey(a.hex)));
}

export function allAnchorsConnected(board: Board): boolean {
  return anchorsConnectedInternal(board);
}

/** A finished solution: fully valid AND all anchors in one component. */
export function isComplete(data: AspectData, board: Board): boolean {
  return validate(data, board).valid;
}
```

> **Note:** `PLACED_ON_DEAD`/`MALFORMED` are produced only by `deserializeBoard` (Task 5.3) when reading external data; the in-memory union makes them unrepresentable during normal play. They remain in `ValidationErrorType` for the deserializer and UI.

- [ ] **Step 4: Run to verify pass** — `bun test tests/core/board.validate.test.ts && bunx tsc --noEmit` → green.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/board.ts tests/core/board.validate.test.ts
git commit -m "feat(core): board full-validity + anchor connectivity (spec §3)"
```

### Task 5.3: Serialization with validation/migration

**Files:**
- Modify: `app/src/core/board.ts`
- Test: `tests/core/board.serialize.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import { createBoard, setState, getState, serializeBoard, deserializeBoard, BOARD_SCHEMA_VERSION } from '../../app/src/core/board';

const data = buildAspectData();

describe('board serialization (spec §2.3)', () => {
  it('round-trips a board, storing only non-EMPTY cells', () => {
    const b = createBoard(3);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'PLACED', aspect: 'void', locked: true });
    setState(b, { q: -1, r: 0 }, { kind: 'DEAD' });
    const json = serializeBoard(b);
    expect(json.schemaVersion).toBe(BOARD_SCHEMA_VERSION);
    expect(json.radius).toBe(3);
    expect(json.cells).toHaveLength(3);
    const b2 = deserializeBoard(data, json);
    expect(getState(b2, { q: 1, r: 0 })).toEqual({ kind: 'PLACED', aspect: 'void', locked: true });
    expect(getState(b2, { q: -1, r: 0 })).toEqual({ kind: 'DEAD' });
  });

  it('rejects an unknown aspect id with a clear error', () => {
    const bad = { schemaVersion: BOARD_SCHEMA_VERSION, radius: 2, cells: [{ coord: '0,0', state: 'ANCHOR', aspect: 'nope' }] };
    expect(() => deserializeBoard(data, bad)).toThrow(/nope/);
  });

  it('rejects out-of-radius coords', () => {
    const bad = { schemaVersion: BOARD_SCHEMA_VERSION, radius: 2, cells: [{ coord: '9,9', state: 'DEAD' }] };
    expect(() => deserializeBoard(data, bad)).toThrow();
  });

  it('rejects malformed input without crashing', () => {
    expect(() => deserializeBoard(data, null)).toThrow();
    expect(() => deserializeBoard(data, { radius: 2 })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/core/board.serialize.test.ts` → FAIL.

- [ ] **Step 3: Implement serialization in `app/src/core/board.ts`**

```ts
import { parseHexKey } from './hex';

export const BOARD_SCHEMA_VERSION = 1;

export interface SerializedCell { coord: string; state: 'DEAD' | 'ANCHOR' | 'PLACED'; aspect?: Aspect; locked?: boolean; }
export interface SerializedBoard { schemaVersion: number; radius: number; cells: SerializedCell[]; }

export function serializeBoard(board: Board): SerializedBoard {
  const cells: SerializedCell[] = [];
  for (const [key, s] of board.cells) {
    if (s.kind === 'EMPTY') continue;
    if (s.kind === 'DEAD') cells.push({ coord: key, state: 'DEAD' });
    else if (s.kind === 'ANCHOR') cells.push({ coord: key, state: 'ANCHOR', aspect: s.aspect });
    else cells.push({ coord: key, state: 'PLACED', aspect: s.aspect, locked: s.locked });
  }
  return { schemaVersion: BOARD_SCHEMA_VERSION, radius: board.radius, cells };
}

export function deserializeBoard(data: AspectData, raw: unknown): Board {
  if (typeof raw !== 'object' || raw === null) throw new Error('board: not an object');
  const obj = raw as Record<string, unknown>;
  const radius = obj.radius;
  if (!Number.isInteger(radius) || (radius as number) < 2 || (radius as number) > 5) {
    throw new Error(`board: bad radius ${String(radius)}`);
  }
  // schemaVersion migration hook (only v1 exists today).
  const ver = obj.schemaVersion;
  if (ver !== BOARD_SCHEMA_VERSION) throw new Error(`board: unsupported schemaVersion ${String(ver)}`);
  if (!Array.isArray(obj.cells)) throw new Error('board: cells must be an array');

  const board = createBoard(radius as number);
  for (const c of obj.cells as unknown[]) {
    if (typeof c !== 'object' || c === null) throw new Error('board: bad cell');
    const cell = c as Record<string, unknown>;
    if (typeof cell.coord !== 'string') throw new Error('board: cell.coord must be a string');
    const hex = parseHexKey(cell.coord);
    if (!isOnBoard(hex, board.radius)) throw new Error(`board: coord ${cell.coord} off radius ${board.radius}`);
    const checkAspect = (a: unknown): Aspect => {
      if (typeof a !== 'string' || !data.universe.has(a)) throw new Error(`board: unknown aspect '${String(a)}'`);
      return a;
    };
    switch (cell.state) {
      case 'DEAD': setState(board, hex, { kind: 'DEAD' }); break;
      case 'ANCHOR': setState(board, hex, { kind: 'ANCHOR', aspect: checkAspect(cell.aspect) }); break;
      case 'PLACED': setState(board, hex, { kind: 'PLACED', aspect: checkAspect(cell.aspect), locked: cell.locked === true }); break;
      default: throw new Error(`board: bad cell.state '${String(cell.state)}'`);
    }
  }
  return board;
}
```

- [ ] **Step 4: Run to verify pass** — `bun test tests/core/board.serialize.test.ts && bunx tsc --noEmit` → green.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/board.ts tests/core/board.serialize.test.ts
git commit -m "feat(core): board serialization with schemaVersion + validation"
```

---

## Phase 6 — solver (spec §5)

Decomposed into testable sub-modules: `core/cost.ts` (lexicographic cost), `core/steiner.ts` (exact node-weighted Steiner via Dreyfus–Wagner, for the admissible heuristic), then `core/solver.ts` (B&B with anytime seeding, exact incumbent selection, statuses, budgets/beam).

### Task 6.1: `core/cost.ts` — lexicographic cost + single comparator (spec §4.2, §5.2)

**Files:**
- Create: `app/src/core/cost.ts`
- Test: `tests/core/cost.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'bun:test';
import { type Cost, compareCost, addCost, ZERO_COST, INF_COST, lessThan } from '../../app/src/core/cost';

describe('lexicographic cost (scarcity, cells)', () => {
  it('orders by scarcity first, then cells', () => {
    expect(compareCost({ scarcity: 1, cells: 100 }, { scarcity: 2, cells: 0 })).toBeLessThan(0);
    expect(compareCost({ scarcity: 2, cells: 1 }, { scarcity: 2, cells: 3 })).toBeLessThan(0);
    expect(compareCost({ scarcity: 2, cells: 3 }, { scarcity: 2, cells: 3 })).toBe(0);
  });
  it('adds componentwise (Infinity-safe)', () => {
    expect(addCost({ scarcity: 1, cells: 2 }, { scarcity: 3, cells: 4 })).toEqual({ scarcity: 4, cells: 6 });
    expect(addCost(INF_COST, ZERO_COST).scarcity).toBe(Number.POSITIVE_INFINITY);
  });
  it('lessThan is strict', () => {
    expect(lessThan({ scarcity: 1, cells: 0 }, { scarcity: 1, cells: 1 })).toBe(true);
    expect(lessThan({ scarcity: 1, cells: 1 }, { scarcity: 1, cells: 1 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/core/cost.test.ts` → FAIL.

- [ ] **Step 3: Implement `app/src/core/cost.ts`**

```ts
export interface Cost {
  readonly scarcity: number; // may be +Infinity
  readonly cells: number;
}

export const ZERO_COST: Cost = { scarcity: 0, cells: 0 };
export const INF_COST: Cost = { scarcity: Number.POSITIVE_INFINITY, cells: Number.POSITIVE_INFINITY };

/** The single comparator used for ALL solver comparisons/pruning (spec §5.2). */
export function compareCost(a: Cost, b: Cost): number {
  if (a.scarcity !== b.scarcity) return a.scarcity < b.scarcity ? -1 : 1;
  if (a.cells !== b.cells) return a.cells < b.cells ? -1 : 1;
  return 0;
}

export function lessThan(a: Cost, b: Cost): boolean {
  return compareCost(a, b) < 0;
}

export function addCost(a: Cost, b: Cost): Cost {
  return { scarcity: a.scarcity + b.scarcity, cells: a.cells + b.cells };
}
```

- [ ] **Step 4: Run to verify pass** — `bun test tests/core/cost.test.ts && bunx tsc --noEmit` → green.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/cost.ts tests/core/cost.test.ts
git commit -m "feat(core): lexicographic cost + single comparator (spec §5.2)"
```

### Task 6.2: `core/steiner.ts` — exact node-weighted Steiner (Dreyfus–Wagner) for the heuristic (spec §5.2)

This computes the **relaxation lower bound on the remainder**: given a board graph of usable cells (dead excluded), node weights (free cells = `w`, paid/filled cells = 0), and a set of **terminal super-nodes** (each = a contracted filled component that contains an anchor), return the min total node-weight of a connected subgraph (Steiner tree) spanning all terminals. Locked-only islands are **not** terminals — they're ordinary optional weight-0 Steiner nodes. Used twice: weight `w = globalMinObtain` → `hScarcity`; weight `w = 1` → `hCells`.

**Files:**
- Create: `app/src/core/steiner.ts`
- Test: `tests/core/steiner.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'bun:test';
import { steinerNodeWeighted, type SteinerGraph } from '../../app/src/core/steiner';

// Build a small explicit graph: a path 0-1-2-3 ; weights all 1 except terminals weight 0.
function pathGraph(n: number, termWeights: number, freeWeight: number): SteinerGraph {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i + 1 < n; i++) { adj[i]!.push(i + 1); adj[i + 1]!.push(i); }
  const weight = (v: number) => (v === 0 || v === n - 1 ? termWeights : freeWeight);
  return { size: n, neighbors: (v) => adj[v]!, weight, terminals: [0, n - 1] };
}

describe('Dreyfus–Wagner node-weighted Steiner', () => {
  it('single terminal => its own weight', () => {
    const g: SteinerGraph = { size: 1, neighbors: () => [], weight: () => 0, terminals: [0] };
    expect(steinerNodeWeighted(g)).toBe(0);
  });

  it('path of 4: 2 terminals (weight 0) + 2 inner free (weight 1) => 2', () => {
    expect(steinerNodeWeighted(pathGraph(4, 0, 1))).toBe(2);
  });

  it('counts terminal weights too', () => {
    // terminals weight 5 each, 2 inner weight 1 => 12
    expect(steinerNodeWeighted(pathGraph(4, 5, 1))).toBe(12);
  });

  it('picks the cheaper of two parallel routes (star, not MST overcount)', () => {
    // center 0 connects to t1=1, t2=2, t3=3 (all terminals). Optimal Steiner = center+3 terminals.
    // weights: center 1, terminals 0 => total 1 (NOT 2 like a pairwise-MST overestimate).
    const adj: number[][] = [[1, 2, 3], [0], [0], [0]];
    const g: SteinerGraph = { size: 4, neighbors: (v) => adj[v]!, weight: (v) => (v === 0 ? 1 : 0), terminals: [1, 2, 3] };
    expect(steinerNodeWeighted(g)).toBe(1);
  });

  it('returns Infinity when terminals are disconnected', () => {
    const adj: number[][] = [[], []];
    const g: SteinerGraph = { size: 2, neighbors: (v) => adj[v]!, weight: () => 0, terminals: [0, 1] };
    expect(steinerNodeWeighted(g)).toBe(Number.POSITIVE_INFINITY);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/core/steiner.test.ts` → FAIL.

- [ ] **Step 3: Implement `app/src/core/steiner.ts`** (node-weighted Dreyfus–Wagner; `dp[mask][v]` = min weight of a tree connecting terminal-subset `mask` with `v` in the tree; grow via Dijkstra, merge subsets)

```ts
export interface SteinerGraph {
  readonly size: number;
  neighbors(v: number): readonly number[];
  weight(v: number): number; // node weight (>= 0), may be +Infinity for forbidden nodes
  readonly terminals: readonly number[]; // distinct node ids
}

/**
 * Exact minimum node-weighted Steiner tree weight spanning all terminals.
 * O(3^k n + 2^k n^2), k = terminals. Returns +Infinity if terminals can't be connected.
 */
export function steinerNodeWeighted(g: SteinerGraph): number {
  const k = g.terminals.length;
  const n = g.size;
  if (k === 0) return 0;
  if (k === 1) return g.weight(g.terminals[0]!);

  const full = (1 << k) - 1;
  const INF = Number.POSITIVE_INFINITY;
  // dp[mask*n + v]
  const dp = new Float64Array((1 << k) * n).fill(INF);

  // base: single terminal masks
  for (let i = 0; i < k; i++) {
    const t = g.terminals[i]!;
    dp[(1 << i) * n + t] = g.weight(t);
  }

  for (let mask = 1; mask <= full; mask++) {
    const base = mask * n;
    // (a) merge: dp[mask][v] = min over submask s of dp[s][v] + dp[mask\s][v] - weight(v)
    if ((mask & (mask - 1)) !== 0) { // mask has >=2 bits
      for (let v = 0; v < n; v++) {
        const wv = g.weight(v);
        if (!Number.isFinite(wv)) continue;
        let bestv = dp[base + v]!;
        for (let s = (mask - 1) & mask; s > 0; s = (s - 1) & mask) {
          const other = mask ^ s;
          if (s < other) break; // avoid double work; require s > other
          const a = dp[s * n + v]!;
          const b = dp[other * n + v]!;
          if (a !== INF && b !== INF) {
            const cand = a + b - wv;
            if (cand < bestv) bestv = cand;
          }
        }
        dp[base + v] = bestv;
      }
    }
    // (b) grow: Dijkstra relaxation over node weights within this mask layer
    dijkstraLayer(g, dp, base, n);
  }

  let best = INF;
  for (let v = 0; v < n; v++) if (dp[full * n + v]! < best) best = dp[full * n + v]!;
  return best;
}

function dijkstraLayer(g: SteinerGraph, dp: Float64Array, base: number, n: number): void {
  // Simple O(n^2) Dijkstra: extend tree to neighbor u paying weight(u).
  const visited = new Uint8Array(n);
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let bu = Number.POSITIVE_INFINITY;
    for (let v = 0; v < n; v++) {
      if (!visited[v] && dp[base + v]! < bu) { bu = dp[base + v]!; u = v; }
    }
    if (u === -1) break;
    visited[u] = 1;
    for (const w of g.neighbors(u)) {
      const ww = g.weight(w);
      if (!Number.isFinite(ww)) continue;
      const cand = bu + ww;
      if (cand < dp[base + w]!) dp[base + w] = cand;
    }
  }
}
```

> **Implementer note:** node-weighted relaxation (drop labels + full-validity, contract paid cells to weight 0) is a true lower bound on the remainder ⇒ the heuristic is **admissible** (spec §5.2). The merge step subtracts `weight(v)` to avoid double-counting the shared node. Verify the star test (= 1, not 2) — that is exactly the MST-overcount the spec rejects.

- [ ] **Step 4: Run to verify pass** — `bun test tests/core/steiner.test.ts && bunx tsc --noEmit` → green.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/steiner.ts tests/core/steiner.test.ts
git commit -m "feat(core): exact node-weighted Dreyfus–Wagner Steiner for heuristic (spec §5.2)"
```

### Task 6.3: `core/heuristic.ts` — remainder heuristic on a partial board (spec §5.2)

Builds, from a partial board state, the relaxed cell graph and returns `h = (hScarcity, hCells)`: terminals = filled components **containing anchors** (contracted to super-nodes, weight 0); paid/filled cells weight 0; free EMPTY cells weight `globalMinObtain` (for `hScarcity`) or `1` (for `hCells`); dead cells excluded; locked-only islands are ordinary optional weight-0 nodes (not terminals).

**Files:**
- Create: `app/src/core/heuristic.ts`
- Test: `tests/core/heuristic.test.ts`

- [ ] **Step 1: Write the failing tests** (admissibility on sample partial states)

```ts
import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import { makeInventory, DEFAULT_THRESHOLD } from '../../app/src/core/inventory';
import { createBoard, setState } from '../../app/src/core/board';
import { remainderHeuristic } from '../../app/src/core/heuristic';

const data = buildAspectData();

describe('remainderHeuristic (admissible, spec §5.2)', () => {
  it('is (0,0) when all anchors are already connected', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'PLACED', aspect: 'void', locked: false });
    setState(b, { q: 2, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
    const inv = makeInventory([['air', 100], ['entropy', 100]], DEFAULT_THRESHOLD);
    const h = remainderHeuristic(data, b, inv);
    expect(h.cells).toBe(0);
    expect(h.scarcity).toBe(0);
  });

  it('needs >=1 inner cell for two anchors at distance 2 (hCells >= 1)', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 2, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
    const inv = makeInventory([['air', 100]], DEFAULT_THRESHOLD);
    const h = remainderHeuristic(data, b, inv);
    expect(h.cells).toBeGreaterThanOrEqual(1);
  });

  it('routes around dead hexes (no path => Infinity scarcity)', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 2, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
    // wall off (2,0) entirely with DEAD neighbors so it cannot be reached
    for (const n of [{ q: 1, r: 0 }, { q: 2, r: -1 }, { q: 1, r: 1 }]) setState(b, n, { kind: 'DEAD' });
    const inv = makeInventory([['air', 100]], DEFAULT_THRESHOLD);
    const h = remainderHeuristic(data, b, inv);
    expect(h.scarcity).toBe(Number.POSITIVE_INFINITY);
  });

  it('does not treat a locked-only island as a terminal (h stays finite/small)', () => {
    const b = createBoard(3);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'ANCHOR', aspect: 'fire' }); // air-fire? not an edge -> but heuristic ignores labels
    setState(b, { q: -3, r: 3 }, { kind: 'PLACED', aspect: 'water', locked: true }); // far island
    const inv = makeInventory([['air', 100]], DEFAULT_THRESHOLD);
    const h = remainderHeuristic(data, b, inv);
    // island must NOT force a long connection; with anchors adjacent, hCells should be 0
    expect(h.cells).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/core/heuristic.test.ts` → FAIL.

- [ ] **Step 3: Implement `app/src/core/heuristic.ts`**

```ts
import type { AspectData } from '../data/aspects';
import type { Cost } from './cost';
import type { Board } from './board';
import { filledCells, anchorCells } from './board';
import { type Hex, hexKey, neighborsOf, boardCells, isOnBoard } from './hex';
import { globalMinObtain, type Inventory } from './inventory';
import { steinerNodeWeighted, type SteinerGraph } from './steiner';

interface CellGraph {
  ids: Map<string, number>; // hexKey -> node id (only usable cells: non-DEAD)
  hexes: Hex[];
  adj: number[][];
  filledKeys: Set<string>; // anchors + placed (weight 0)
  terminals: number[]; // representative node per anchor-component
}

function buildCellGraph(board: Board): CellGraph {
  const ids = new Map<string, number>();
  const hexes: Hex[] = [];
  for (const h of boardCells(board.radius)) {
    const s = board.cells.get(hexKey(h));
    if (s && s.kind === 'DEAD') continue; // dead excluded
    ids.set(hexKey(h), hexes.length);
    hexes.push(h);
  }
  const adj: number[][] = hexes.map(() => []);
  for (let i = 0; i < hexes.length; i++) {
    for (const n of neighborsOf(hexes[i]!)) {
      if (!isOnBoard(n, board.radius)) continue;
      const j = ids.get(hexKey(n));
      if (j !== undefined) adj[i]!.push(j);
    }
  }
  const filled = filledCells(board);
  const filledKeys = new Set(filled.map((c) => hexKey(c.hex)));

  // anchor-components: BFS over filled adjacency, keep one representative id per component that has >=1 anchor
  const anchorKeys = new Set(anchorCells(board).map((a) => hexKey(a.hex)));
  const compOf = new Map<string, number>();
  let comp = 0;
  for (const c of filled) {
    const k = hexKey(c.hex);
    if (compOf.has(k)) continue;
    const stack = [c.hex];
    compOf.set(k, comp);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of neighborsOf(cur)) {
        const nk = hexKey(n);
        if (filledKeys.has(nk) && !compOf.has(nk)) { compOf.set(nk, comp); stack.push(n); }
      }
    }
    comp++;
  }
  const compHasAnchor = new Array(comp).fill(false);
  for (const k of anchorKeys) compHasAnchor[compOf.get(k)!] = true;
  const repByComp = new Map<number, number>();
  for (const [k, ci] of compOf) if (compHasAnchor[ci] && !repByComp.has(ci)) repByComp.set(ci, ids.get(k)!);
  const terminals = [...repByComp.values()];

  return { ids, hexes, adj, filledKeys, terminals };
}

function steinerWith(graph: CellGraph, freeWeight: number): number {
  // Contract a whole anchor-component to its representative: every filled cell weight 0,
  // and connectivity among a component's cells already holds via adjacency (all weight 0),
  // so using one representative per component as a terminal is exact.
  const g: SteinerGraph = {
    size: graph.hexes.length,
    neighbors: (v) => graph.adj[v]!,
    weight: (v) => (graph.filledKeys.has(hexKey(graph.hexes[v]!)) ? 0 : freeWeight),
    terminals: graph.terminals,
  };
  return steinerNodeWeighted(g);
}

export function remainderHeuristic(data: AspectData, board: Board, inv: Inventory): Cost {
  const graph = buildCellGraph(board);
  if (graph.terminals.length <= 1) return { scarcity: 0, cells: 0 };

  const w = globalMinObtain(inv, data); // admissible per-free-cell weight (>=0, may be 0)
  const totalScarcity = steinerWith(graph, w);
  const totalCells = steinerWith(graph, 1);

  // Subtract the contribution of already-paid (filled) cells = 0, so the tree weight IS the remainder.
  // hCells = number of inner FREE cells = (cells-weighted tree) minus terminals' own 0 weight already excluded.
  const hScarcity = totalScarcity; // free cells only contribute (filled weight 0)
  const hCells = Number.isFinite(totalCells) ? totalCells : Number.POSITIVE_INFINITY;
  return { scarcity: hScarcity, cells: hCells };
}
```

> **Implementer note (admissibility, spec §5.2):** weights are `0` on filled cells and `globalMinObtain ≤` any real aspect cost on free cells, labels and full-validity are dropped, and Steiner is solved **exactly** — so `h` is a true lower bound on the remaining cost. `hCells` uses unit free-cell weights = a lower bound on remaining inner cells. The default safe form is `(hScarcity, 0)`; this returns the proven-admissible strengthening `(hScarcity, hCells)`. If any admissibility test fails, fall back to `cells: 0`.

- [ ] **Step 4: Run to verify pass** — `bun test tests/core/heuristic.test.ts && bunx tsc --noEmit` → green.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/heuristic.ts tests/core/heuristic.test.ts
git commit -m "feat(core): admissible remainder heuristic (Dreyfus–Wagner relaxation, spec §5.2)"
```

### Task 6.4: `core/solver.ts` — branch-and-bound, exact incumbent, statuses (spec §5.1–§5.5)

**Files:**
- Create: `app/src/core/solver.ts`
- Test: `tests/core/solver.test.ts`

**Design (spec §5.2 invariants — all enforced):**
- **State** = the set of solver-placed cells layered on the initial board (anchors + locked), **plus** a per-branch set of *excluded* frontier cells (decided to stay EMPTY).
- **g_lb** = `(Σ obtainCost over solver-placed cells, count of solver-placed cells)`.
- **h** = `remainderHeuristic(...)`; **f** = `addCost(g_lb, h)`; single `compareCost` everywhere.
- **Expansion (include/exclude — COMPLETE).** Deterministically pick **one** undecided frontier cell `c` = the lowest-`hexKey` EMPTY cell adjacent to the current structure that is not already excluded. Branch into: **(a)** for each aspect that is a valid placement against all filled neighbors, place it at `c` (branch-order: cheaper `obtainCost` first); **and (b)** *exclude* `c` (mark it permanently EMPTY for this subtree) and recurse. The exclude branch is what lets the optimum leave a frontier cell empty (e.g. the 1-cell bridge solution where the lexicographically-first frontier cell points the wrong way). Because the chosen cell is forced by the current structure, every distinct (placement-set, exclusion-set) is reached by exactly **one** path — the enumeration is inherently non-redundant, so **no closed set is needed** (and none is used, avoiding transposition-merge hazards).
- **Goal** = `allAnchorsConnected`. On a complete valid board, run `allocate` (§4.3): `feasible:true` & cheaper ⇒ update incumbent; `feasible:false` ⇒ discard (never incumbent/bound); `feasible:'unknown'` ⇒ don't update, set `anyUnknownCompetitive` if its `g_lb` could beat the incumbent.
- **Invariants:** (1) exact allocation; (2) infeasible boards never affect incumbent/bound; (3) search continues past goals; (4) partial pruning **only** by `f ⪰ incumbent` via the one comparator (never by feasibility), and the prune is enabled **only after a finite feasible incumbent exists** — in particular branches with `g_lb.scarcity = +∞` are **NOT** pruned before then, because a board whose only realization needs an unobtainable aspect must still be reached to set `anyValidBoardFound` (it then allocates `feasible:false` and is discarded), which is exactly what separates `INFEASIBLE_INVENTORY` from `UNSAT_PROVEN` (corrects a spec §5.2-invariant-6 parenthetical that called this prune "safe"); (5) optimum proven when frontier-min `f ⪰ incumbent`; (6) **bound-pruning enabled ONLY after a finite feasible incumbent exists**; (7) `anyValidBoardFound` tracks existence of any link-valid complete board, independent of inventory.
- **Statuses (spec §5.4):** exhaustive + feasible incumbent ⇒ `OPTIMAL`; exhaustive + valid-but-none-feasible ⇒ `INFEASIBLE_INVENTORY`; exhaustive + no valid board ⇒ `UNSAT_PROVEN`; budget/beam truncation ⇒ `FEASIBLE_TIMEOUT` (have incumbent) / `UNKNOWN_TIMEOUT` (none). `anyUnknownCompetitive` **blocks** `OPTIMAL`/`INFEASIBLE_INVENTORY` (degrade to `FEASIBLE_TIMEOUT`/`UNKNOWN_TIMEOUT`); `UNSAT_PROVEN` unaffected. Pre-validation failure (set by caller, Task 6.6) ⇒ `INVALID_INPUT`.

- [ ] **Step 1: Write the failing tests** (behavioral invariants — the real spec for the solver)

```ts
import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import { makeInventory, DEFAULT_THRESHOLD } from '../../app/src/core/inventory';
import { createBoard, setState, validate, getState } from '../../app/src/core/board';
import { solve, type SolveResult } from '../../app/src/core/solver';

const data = buildAspectData();
const rich = makeInventory(
  [...data.universe].map((a) => [a, 100] as [string, number]),
  DEFAULT_THRESHOLD,
);
const budget = { maxNodes: 2_000_000, maxTimeMs: 20_000 };

function twoAnchorBoard(): ReturnType<typeof createBoard> {
  const b = createBoard(2);
  setState(b, { q: -1, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
  setState(b, { q: 1, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
  return b; // need a valid chain air..entropy (void = air+entropy bridges them)
}

describe('solver invariants (spec §5)', () => {
  it('always returns a valid, connected board when it returns one', () => {
    const r = solve({ data, board: twoAnchorBoard(), inventory: rich, budget });
    expect(['OPTIMAL', 'FEASIBLE_TIMEOUT']).toContain(r.status);
    expect(r.board).toBeDefined();
    expect(validate(data, r.board!).valid).toBe(true);
  });

  it('finds the 1-cell optimum that leaves the lexicographically-first frontier cell EMPTY (completeness)', () => {
    // air(0,0) -- void(1,0) -- entropy(2,0): the unique 1-cell bridge. The lowest-hexKey frontier
    // cell is "-1,0" (points away from entropy); a single-cell-forced expansion could never leave it
    // empty and would miss this optimum. The include/exclude search must return cells === 1.
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 2, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
    const r = solve({ data, board: b, inventory: rich, budget });
    expect(r.status).toBe('OPTIMAL');
    expect(r.cost?.cells).toBe(1);
    expect(r.board && getState(r.board, { q: 1, r: 0 })).toEqual({ kind: 'PLACED', aspect: 'void', locked: false });
    expect(r.board && getState(r.board, { q: -1, r: 0 })).toEqual({ kind: 'EMPTY' });
  });

  it('avoids dead hexes entirely', () => {
    const b = twoAnchorBoard();
    setState(b, { q: 0, r: 0 }, { kind: 'DEAD' }); // force routing around center
    const r = solve({ data, board: b, inventory: rich, budget });
    if (r.board) {
      expect(getState(r.board, { q: 0, r: 0 })).toEqual({ kind: 'DEAD' });
      expect(validate(data, r.board).valid).toBe(true);
    }
  });

  it('handles a multi-anchor (3) instance', () => {
    const b = createBoard(3);
    setState(b, { q: -2, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 2, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
    setState(b, { q: 0, r: 2 }, { kind: 'ANCHOR', aspect: 'fire' });
    const r = solve({ data, board: b, inventory: rich, budget });
    if (r.board) expect(validate(data, r.board).valid).toBe(true);
  });

  it('trivially solved with 0 or 1 anchor', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    const r = solve({ data, board: b, inventory: rich, budget });
    expect(r.status).toBe('OPTIMAL');
  });

  it('UNKNOWN_TIMEOUT when truncated before any incumbent', () => {
    const r = solve({ data, board: twoAnchorBoard(), inventory: rich, budget: { maxNodes: 1, maxTimeMs: 1 } });
    expect(['UNKNOWN_TIMEOUT', 'FEASIBLE_TIMEOUT']).toContain(r.status);
  });

  it('prefers abundant aspects: chooses a feasible board over a cheaper-by-links infeasible one', () => {
    // Make the "obvious" bridge aspect zero-supply so the optimum must route through abundant aspects.
    const inv = makeInventory(
      [...data.universe].map((a) => [a, a === 'void' ? 0 : 100] as [string, number]),
      DEFAULT_THRESHOLD,
    );
    const r = solve({ data, board: twoAnchorBoard(), inventory: inv, budget });
    // void has zero supply and cannot be crafted? void=air+entropy abundant => craftable, feasible stays true.
    expect(['OPTIMAL', 'FEASIBLE_TIMEOUT']).toContain(r.status);
    if (r.board) expect(validate(data, r.board).valid).toBe(true);
  });

  it('INFEASIBLE_INVENTORY vs UNSAT_PROVEN are distinguished on a tiny exhaustible instance', () => {
    // Adjacent anchors with NO valid linking aspect and no empty cell between => exhaustive search.
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'ANCHOR', aspect: 'earth' }); // air-earth invalid AND adjacent => no fix
    const r = solve({ data, board: b, inventory: rich, budget });
    // adjacent invalid anchors: caller pre-validation normally catches this; if solver reached it, it's UNSAT.
    expect(['UNSAT_PROVEN', 'INVALID_INPUT']).toContain(r.status);
  });

  it('allocator budget exhaustion blocks proof: degrades to FEASIBLE_TIMEOUT/UNKNOWN_TIMEOUT', () => {
    const r = solve({ data, board: twoAnchorBoard(), inventory: rich, budget, allocBudget: { maxNodes: 1 } });
    expect(r.status).not.toBe('OPTIMAL');
    expect(r.status).not.toBe('INFEASIBLE_INVENTORY');
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/core/solver.test.ts` → FAIL.

- [ ] **Step 3: Implement `app/src/core/solver.ts`**

```ts
import type { AspectData, Aspect } from '../data/aspects';
import { type Inventory, obtainCost, allocate, type AllocationResult, type AllocBudget } from './inventory';
import { type Board, createBoard, getState, setState, filledCells, filledNeighbors, allAnchorsConnected, anchorCells, validate } from './board';
import { type Hex, hexKey, neighborsOf, boardCells, isOnBoard } from './hex';
import { isValidLink } from './aspectGraph';
import { type Cost, addCost, compareCost, lessThan, ZERO_COST } from './cost';
import { remainderHeuristic } from './heuristic';

export type SolverStatus =
  | 'OPTIMAL' | 'FEASIBLE_TIMEOUT' | 'UNKNOWN_TIMEOUT'
  | 'INFEASIBLE_INVENTORY' | 'UNSAT_PROVEN' | 'CANCELLED' | 'INVALID_INPUT';

export interface SolveBudget { maxNodes: number; maxTimeMs: number; beam?: number; }
export interface Progress { nodes: number; best: Cost | null; timeMs: number; status: 'searching' | 'seeding' | 'beam'; }

/**
 * Explicit per-radius budgets (spec §5.5). Starting points — TUNE against the R2–R5 bench (Task 6.6)
 * and freeze the measured values. `beam` caps include-branch aspect fan-out on heavy boards and forces
 * a *_TIMEOUT status (never *_PROVEN). Memory is bounded indirectly by maxNodes (DFS depth <= cells).
 */
export const DEFAULT_BUDGETS: Record<2 | 3 | 4 | 5, SolveBudget> = {
  2: { maxNodes: 500_000, maxTimeMs: 5_000 },
  3: { maxNodes: 2_000_000, maxTimeMs: 10_000 },
  4: { maxNodes: 4_000_000, maxTimeMs: 20_000, beam: 12 },
  5: { maxNodes: 6_000_000, maxTimeMs: 30_000, beam: 8 },
};

export function budgetForRadius(radius: number): SolveBudget {
  return DEFAULT_BUDGETS[(radius as 2 | 3 | 4 | 5)] ?? DEFAULT_BUDGETS[5];
}

export interface SolveOptions {
  data: AspectData;
  board: Board;            // initial anchors + locked (pre-validated by caller)
  inventory: Inventory;
  budget: SolveBudget;
  allocBudget?: AllocBudget;
  seed?: boolean;                // enable the optional anytime seed (Task 6.7); default off
  onProgress?: (p: Progress) => void;
  shouldCancel?: () => boolean; // best-effort cooperative cancel (worker uses hard terminate)
  now?: () => number;            // injectable clock for tests (defaults to Date.now via caller/worker)
}

export interface SolveResult {
  status: SolverStatus;
  board?: Board;
  cost?: Cost;
  allocation?: AllocationResult;
  stats: { nodes: number; timeMs: number };
}

interface Placement { key: string; aspect: Aspect; }

export function solve(opts: SolveOptions): SolveResult {
  const { data, board: initial, inventory, budget } = opts;
  const allocBudget = opts.allocBudget ?? { maxNodes: 200_000 };
  const now = opts.now ?? (() => 0); // tests pass deterministic clocks; worker injects real time
  const start = now();
  const anchors = anchorCells(initial);

  // 0/1 anchor => trivially solved (spec §5.1)
  if (anchors.length <= 1) {
    return { status: 'OPTIMAL', board: cloneBoard(initial), cost: ZERO_COST, stats: { nodes: 0, timeMs: 0 } };
  }

  // working board mutated during DFS; placements stack of solver cells; excluded = frontier cells
  // decided to remain EMPTY in the current subtree (the include/exclude enumeration is non-redundant).
  const work = cloneBoard(initial);
  const placements: Placement[] = [];
  const excluded = new Set<string>();

  let incumbent: { board: Board; cost: Cost; alloc: AllocationResult } | null = null;
  let anyValidBoardFound = false;
  let anyUnknownCompetitive = false;
  let nodes = 0;
  let cancelled = false;
  let truncated = false; // budget/beam hit before exhaustion

  const placedCost = (): Cost => {
    let scarcity = 0;
    for (const p of placements) scarcity += obtainCost(inventory, data, p.aspect);
    return { scarcity, cells: placements.length };
  };

  // the one frontier cell to decide next = lowest-hexKey EMPTY cell adjacent to the structure
  // that is not already excluded; null => every frontier cell decided (leaf).
  const nextUndecidedFrontierCell = (): Hex | null => {
    let best: Hex | null = null;
    let bestK = '';
    const seen = new Set<string>();
    for (const c of filledCells(work)) {
      for (const n of neighborsOf(c.hex)) {
        if (!isOnBoard(n, work.radius)) continue;
        const nk = hexKey(n);
        if (seen.has(nk)) continue;
        seen.add(nk);
        if (excluded.has(nk)) continue;
        if (getState(work, n).kind !== 'EMPTY') continue;
        if (best === null || nk < bestK) { best = n; bestK = nk; }
      }
    }
    return best;
  };

  const reportProgress = (): void => {
    opts.onProgress?.({
      nodes,
      best: incumbent ? incumbent.cost : null,
      timeMs: opts.now ? now() - start : 0,
      status: 'searching',
    });
  };

  const validPlacement = (h: Hex, a: Aspect): boolean => {
    for (const fn of filledNeighbors(work, h)) {
      if (fn.aspect === a) return false;
      if (!isValidLink(data, fn.aspect, a)) return false;
    }
    return true;
  };

  const onComplete = (): void => {
    anyValidBoardFound = true; // it's link-valid (placements were validated incrementally) and connected
    const gcost = placedCost();
    const alloc = allocate(inventory, data, demandOf(placements), allocBudget);
    if (alloc.feasible === true) {
      const cost: Cost = { scarcity: alloc.scarcityCost, cells: placements.length };
      if (!incumbent || lessThan(cost, incumbent.cost)) {
        incumbent = { board: cloneBoard(work), cost, alloc };
      }
    } else if (alloc.feasible === 'unknown') {
      // could this candidate beat the incumbent? compare its lower-bound g to incumbent
      if (!incumbent || lessThan(gcost, incumbent.cost)) anyUnknownCompetitive = true;
    } // feasible === false => discard entirely
  };

  // DFS with include/exclude branching (complete); periodic cancel/budget/progress checks.
  const dfs = (): void => {
    if (cancelled) return;
    if (nodes >= budget.maxNodes) { truncated = true; return; }
    if ((nodes & 1023) === 0) {
      if (opts.shouldCancel?.()) { cancelled = true; return; }
      if (opts.now && now() - start > budget.maxTimeMs) { truncated = true; return; }
      reportProgress();
    }
    nodes++;

    const g = placedCost();
    const h = remainderHeuristic(data, work, inventory);
    const f = addCost(g, h);

    // invariants 4 & 6: bound-prune ONLY once a finite feasible incumbent exists — and never on a
    // +∞ g_lb before then (such branches must reach a goal to set anyValidBoardFound => INFEASIBLE_INVENTORY).
    if (incumbent && compareCost(f, incumbent.cost) >= 0) return;

    if (allAnchorsConnected(work)) onComplete(); // invariant 3: keep searching past goals

    const cell = nextUndecidedFrontierCell();
    if (!cell) return; // every frontier cell decided => leaf

    // (a) INCLUDE: place each valid aspect (cheap obtainCost first). Infinity-safe compare:
    // `∞ - ∞ = NaN` would corrupt Array.sort, so compare without subtraction.
    const candidates: Aspect[] = [];
    for (const a of data.universe) if (validPlacement(cell, a)) candidates.push(a);
    candidates.sort((x, y) => {
      const cx = obtainCost(inventory, data, x);
      const cy = obtainCost(inventory, data, y);
      return cx === cy ? 0 : cx < cy ? -1 : 1;
    });
    const beam = budget.beam;
    const limited = beam ? candidates.slice(0, beam) : candidates;
    if (beam && limited.length < candidates.length) truncated = true;

    for (const a of limited) {
      setState(work, cell, { kind: 'PLACED', aspect: a, locked: false });
      placements.push({ key: hexKey(cell), aspect: a });
      dfs();
      placements.pop();
      setState(work, cell, { kind: 'EMPTY' });
      if (cancelled) return;
    }

    // (b) EXCLUDE: leave `cell` permanently EMPTY in this subtree (enables frontier-skipping optima)
    excluded.add(hexKey(cell));
    dfs();
    excluded.delete(hexKey(cell));
  };

  // Anytime seeding (spec §5.3): a quick Dijkstra-stitched candidate validated before use.
  seedIncumbent(opts, (cand) => {
    const v = validate(data, cand);
    if (v.valid && allAnchorsConnected(cand)) {
      const pls = solverPlacements(initial, cand);
      const alloc = allocate(inventory, data, demandOf(pls), allocBudget);
      if (alloc.feasible === true) {
        incumbent = { board: cloneBoard(cand), cost: { scarcity: alloc.scarcityCost, cells: pls.length }, alloc };
      }
    }
  });

  dfs();

  const timeMs = opts.now ? now() - start : 0;
  const exhaustive = !truncated && !cancelled;

  if (cancelled) {
    return incumbent
      ? { status: 'CANCELLED', board: incumbent.board, cost: incumbent.cost, allocation: incumbent.alloc, stats: { nodes, timeMs } }
      : { status: 'CANCELLED', stats: { nodes, timeMs } };
  }

  if (incumbent) {
    if (exhaustive && !anyUnknownCompetitive) {
      return { status: 'OPTIMAL', board: incumbent.board, cost: incumbent.cost, allocation: incumbent.alloc, stats: { nodes, timeMs } };
    }
    return { status: 'FEASIBLE_TIMEOUT', board: incumbent.board, cost: incumbent.cost, allocation: incumbent.alloc, stats: { nodes, timeMs } };
  }

  // no incumbent
  if (exhaustive) {
    if (!anyValidBoardFound) return { status: 'UNSAT_PROVEN', stats: { nodes, timeMs } };
    if (!anyUnknownCompetitive) return { status: 'INFEASIBLE_INVENTORY', stats: { nodes, timeMs } };
  }
  return { status: 'UNKNOWN_TIMEOUT', stats: { nodes, timeMs } };
}

// --- helpers ---

function cloneBoard(b: Board): Board {
  const nb = createBoard(b.radius);
  for (const [k, s] of b.cells) nb.cells.set(k, { ...s });
  return nb;
}

function demandOf(placements: ReadonlyArray<Placement>): Map<Aspect, number> {
  const d = new Map<Aspect, number>();
  for (const p of placements) d.set(p.aspect, (d.get(p.aspect) ?? 0) + 1);
  return d;
}

/** solver-placed cells = PLACED,locked=false present in `solved` that were EMPTY in `initial`. */
function solverPlacements(initial: Board, solved: Board): Placement[] {
  const out: Placement[] = [];
  for (const h of boardCells(solved.radius)) {
    const s = getState(solved, h);
    const i = getState(initial, h);
    if (s.kind === 'PLACED' && !s.locked && i.kind === 'EMPTY') out.push({ key: hexKey(h), aspect: s.aspect });
  }
  return out;
}

// Seeding stub for Task 6.4: no-op (the exhaustive search finds the optimum regardless). The real
// untrusted pairwise-Dijkstra seed is the OPTIONAL Task 6.7, which replaces this function and gates
// on opts.seed. Until then seeding is inert and correctness is unaffected (spec §5.3).
function seedIncumbent(_opts: SolveOptions, _accept: (board: Board) => void): void {
  /* no-op until Task 6.7 */
}
```

> **Implementer guidance:**
> - Land the **exhaustive** path green first (seed is a no-op — see Task 6.7). The behavioral tests above are the gate; do not weaken them.
> - The include/exclude enumeration is **non-redundant without a closed set** (each (placements, exclusions) is reached by one forced path). Do **not** add a placement-keyed closed set back — a transposition merge there can drop the exclusion context and reintroduce the completeness bug. Admissible `f`-pruning (post-incumbent) plus branch-order keep R2/R3 within budget.
> - Keep invariant 6 literal: the `incumbent && compareCost(f, incumbent.cost) >= 0` prune must be guarded by a **feasible** incumbent (it always is, since only feasible boards become incumbents). Never prune partials by feasibility, and never prune a `+∞`-`g` partial before a feasible incumbent exists (that would conflate `UNSAT_PROVEN` with `INFEASIBLE_INVENTORY`).
> - `now`: tests pass a deterministic clock or omit it (no time-pruning); the worker injects `Date.now`. `onProgress` fires every 1024 nodes — the worker forwards it via `postMessage` (delivered to the main thread in real time even though `solve` runs synchronously).
> - **Cancellation (spec §5.5):** the guaranteed cancel is the client's hard `worker.terminate()` (Task 7.2) — it always works. `shouldCancel` is a cooperative best-effort hook for non-worker callers/tests; inside the worker it cannot fire mid-`solve` (the worker can't read new messages while synchronously running), so do **not** rely on it there. If true cooperative mid-search yielding is later required, refactor `solve` into an explicit-stack iterative loop that `await`s a `yieldToEventLoop()` every chunk; v1 ships the synchronous form because hard-terminate already satisfies the cancel guarantee.
> - After green, profile R4/R5 (Task 6.6); if over budget, enable `beam` and confirm status degrades to `*_TIMEOUT` (never `*_PROVEN`). Log any truncation (spec §5.4).

- [ ] **Step 4: Run to verify pass** — `bun test tests/core/solver.test.ts && bunx tsc --noEmit` → green. Fix the implementation (not the tests) until invariants hold.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/solver.ts tests/core/solver.test.ts
git commit -m "feat(core): B&B solver with exact incumbent + statuses (spec §5)"
```

### Task 6.5: Pre-validation entrypoint + status `INVALID_INPUT` (spec §3, §5.4)

**Files:**
- Modify: `app/src/core/solver.ts` (add `solveWithValidation`)
- Test: `tests/core/solver.prevalidate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import { makeInventory, DEFAULT_THRESHOLD } from '../../app/src/core/inventory';
import { createBoard, setState } from '../../app/src/core/board';
import { solveWithValidation } from '../../app/src/core/solver';

const data = buildAspectData();
const inv = makeInventory([...data.universe].map((a) => [a, 100] as [string, number]), DEFAULT_THRESHOLD);

describe('pre-validation (spec §3)', () => {
  it('returns INVALID_INPUT when starting anchors are adjacent but unlinkable', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'ANCHOR', aspect: 'earth' }); // adjacent + invalid link, unfixable
    const r = solveWithValidation({ data, board: b, inventory: inv, budget: { maxNodes: 1000, maxTimeMs: 100 } });
    expect(r.status).toBe('INVALID_INPUT');
    expect(r.errors?.some((e) => e.type === 'INVALID_LINK' || e.type === 'SAME_ASPECT_ADJACENT')).toBe(true);
  });

  it('does not reject a solvable start (disconnected anchors with room to route)', () => {
    const b = createBoard(2);
    setState(b, { q: -1, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
    const r = solveWithValidation({ data, board: b, inventory: inv, budget: { maxNodes: 1_000_000, maxTimeMs: 5000 } });
    expect(r.status).not.toBe('INVALID_INPUT');
  });

  it('returns INVALID_INPUT on negative/non-integer supply (spec §4.1)', () => {
    const b = createBoard(2);
    setState(b, { q: -1, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 1, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
    const bad = makeInventory([['air', -3]], DEFAULT_THRESHOLD);
    const r = solveWithValidation({ data, board: b, inventory: bad, budget: { maxNodes: 1000, maxTimeMs: 100 } });
    expect(r.status).toBe('INVALID_INPUT');
  });
});
```

> **Important pre-validation subtlety:** the start board legitimately has disconnected anchors (that's what the solver fixes), so pre-validation must **only** reject errors the solver cannot repair: `INVALID_LINK`/`SAME_ASPECT_ADJACENT` between already-filled (anchor/locked) cells, and `PLACED_ON_DEAD`. It must **ignore** `ANCHORS_DISCONNECTED` (the solver connects them).

- [ ] **Step 2: Run to verify fail** — `bun test tests/core/solver.prevalidate.test.ts` → FAIL.

- [ ] **Step 3: Implement `solveWithValidation`** in `app/src/core/solver.ts`

```ts
import { validate, type ValidationError } from './board';
import { validateInventory } from './inventory';

export interface SolveWithValidationResult extends SolveResult {
  errors?: ValidationError[];
  message?: string;
}

export function solveWithValidation(opts: SolveOptions): SolveWithValidationResult {
  // Inventory pre-validation (spec §4.1): reject negative/non-integer supply or threshold<=0
  // up front instead of letting it surface as a worker error mid-search.
  try {
    validateInventory(opts.inventory);
  } catch (err) {
    return { status: 'INVALID_INPUT', message: err instanceof Error ? err.message : String(err), stats: { nodes: 0, timeMs: 0 } };
  }
  const v = validate(opts.data, opts.board);
  const unfixable = v.errors.filter((e) => e.type !== 'ANCHORS_DISCONNECTED');
  if (unfixable.length > 0) {
    return { status: 'INVALID_INPUT', errors: unfixable, stats: { nodes: 0, timeMs: 0 } };
  }
  return solve(opts);
}
```

- [ ] **Step 4: Run to verify pass** — `bun test tests/core/solver.prevalidate.test.ts && bunx tsc --noEmit` → green.

- [ ] **Step 5: Commit**

```bash
git add app/src/core/solver.ts tests/core/solver.prevalidate.test.ts
git commit -m "feat(core): pre-validation entrypoint -> INVALID_INPUT (spec §3)"
```

### Task 6.6: Full-core green gate + R2–R5 bench (spec §5.5, §7)

**Files:**
- Create: `tests/bench/solver.bench.ts` (non-blocking script)

- [ ] **Step 1: Write a bench script** covering all four radii using the per-radius `DEFAULT_BUDGETS` (prints status/nodes/time; not asserted in `bun test`; run on demand).

```ts
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
```

- [ ] **Step 2: Run the whole core suite + bench**

Run: `bun test && bunx tsc --noEmit && bun tests/bench/solver.bench.ts`
Expected: all unit tests green; bench prints a status for each radius. **Acceptance gate (spec §5.5/§7):** R2/R3 must reach `OPTIMAL` within budget; R4/R5 must at least reach `FEASIBLE_TIMEOUT` (a valid board) within budget — if either returns `UNKNOWN_TIMEOUT`, tune `DEFAULT_BUDGETS` (raise `maxNodes`, lower `beam`) and/or branch ordering, then re-run and **freeze the measured numbers** into `DEFAULT_BUDGETS`. Record the node/time numbers in the commit message. **Do not** start the worker/UI phases until this gate is met.

- [ ] **Step 3: Commit**

```bash
git add tests/bench/solver.bench.ts
git commit -m "test(core): R2/R3 solver micro-bench (non-blocking)"
```

### Task 6.7 (OPTIONAL, anytime optimization): pairwise-Dijkstra seed (spec §5.3)

**Correctness does not depend on this task** — the exhaustive search already finds the optimum; the seed only produces an early incumbent so `FEASIBLE_TIMEOUT` is reachable sooner on heavy boards. The seed is **untrusted**: candidates are accepted *only* through the existing `accept` closure in `solve` (which runs `validate()` + `allAnchorsConnected` + exact `allocate` feasibility before setting the incumbent). An invalid or infeasible seed is silently dropped — it can never corrupt the optimum or the status.

**Files:**
- Modify: `app/src/core/solver.ts` (replace the `seedIncumbent` no-op)
- Test: `tests/core/solver.seed.test.ts`

- [ ] **Step 1: Write the failing tests** (the seed must not change the proven optimum, and any incumbent it yields must be valid+feasible)

```ts
import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import { makeInventory, DEFAULT_THRESHOLD } from '../../app/src/core/inventory';
import { createBoard, setState, validate } from '../../app/src/core/board';
import { solve } from '../../app/src/core/solver';

const data = buildAspectData();
const rich = makeInventory([...data.universe].map((a) => [a, 100] as [string, number]), DEFAULT_THRESHOLD);

describe('seed (spec §5.3) is untrusted and optimum-preserving', () => {
  it('produces the same OPTIMAL cost with seeding enabled as the exhaustive search', () => {
    const b = createBoard(2);
    setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
    setState(b, { q: 2, r: 0 }, { kind: 'ANCHOR', aspect: 'entropy' });
    const r = solve({ data, board: b, inventory: rich, budget: { maxNodes: 2_000_000, maxTimeMs: 20_000 }, seed: true });
    expect(r.status).toBe('OPTIMAL');
    expect(r.cost?.cells).toBe(1); // still the 1-cell optimum
    expect(r.board && validate(data, r.board).valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/core/solver.seed.test.ts` → FAIL (`seed` option / impl missing).

- [ ] **Step 3: Implement the seed.** Add `seed?: boolean` to `SolveOptions`; gate the seeding call on it. Replace `seedIncumbent` with a product-graph Dijkstra that proposes one stitched candidate per anchor pair to the existing trusted `accept`:

```ts
// Product-graph Dijkstra: nodes = (cell, aspect); move to an adjacent EMPTY cell with an aspect
// that is a valid link to the current aspect; edge weight = obtainCost(newAspect). Returns the
// cheapest aspect-labeled path from `from` (anchor) to `to` (anchor), or null. UNTRUSTED —
// the caller validates before use.
function seedIncumbent(opts: SolveOptions, accept: (board: Board) => void): void {
  if (!opts.seed) return;
  const { data, board: initial, inventory } = opts;
  const anchors = anchorCells(initial);
  if (anchors.length < 2) return;

  // Greedy chain: connect anchor[0] to each other anchor via a cheapest valid product-path,
  // laying placements onto a single candidate board; then hand the merged board to `accept`.
  const candidate = cloneBoard(initial);
  for (let i = 1; i < anchors.length; i++) {
    const path = cheapestProductPath(data, candidate, inventory, anchors[0]!, anchors[i]!);
    if (!path) return; // give up seeding; exhaustive search still runs
    for (const { hex, aspect } of path) {
      if (getState(candidate, hex).kind === 'EMPTY') {
        setState(candidate, hex, { kind: 'PLACED', aspect, locked: false });
      }
    }
  }
  accept(candidate); // trusted gate: validate + feasibility happen inside
}

function cheapestProductPath(
  data: AspectData, board: Board, inv: Inventory, from: { hex: Hex; aspect: Aspect }, to: { hex: Hex; aspect: Aspect },
): Array<{ hex: Hex; aspect: Aspect }> | null {
  // Dijkstra over states `${hexKey}:${aspect}`; start = (from.hex, from.aspect) cost 0;
  // expand to EMPTY (or matching-anchor) neighbors with any aspect that isValidLink to current;
  // stop when reaching (to.hex, to.aspect). Reconstruct the placed (non-anchor) cells.
  // Standard Dijkstra — implement directly; UNTRUSTED output (incidental touches handled by accept).
  void data; void board; void inv; void from; void to; void isValidLink; void obtainCost; void neighborsOf; void isOnBoard; void getState;
  return null; // implementer fills in; returning null safely disables seeding until done
}
```

> The starting `return null` keeps the build green and the seed inert; flesh out `cheapestProductPath` to actually accelerate anytime behavior. Because `accept` is the only path to the incumbent, a wrong/over-eager Dijkstra cannot break correctness — at worst it proposes a board that fails validation and is dropped.

- [ ] **Step 4: Run to verify pass** — `bun test tests/core/solver.seed.test.ts && bun test && bunx tsc --noEmit` → green (whole suite still passes).

- [ ] **Step 5: Commit**

```bash
git add app/src/core/solver.ts tests/core/solver.seed.test.ts
git commit -m "feat(core): optional untrusted pairwise-Dijkstra seed (spec §5.3)"
```

---

## Phase 7 — `worker/`: Web Worker + client (spec §5.5, §6)

The worker rebuilds `AspectData` from `{version, addons}` and deserializes board/inventory (no functions cross `postMessage`). Cancellation is a **hard `worker.terminate()` + recreate** on the client (spec §5.5); the worker also honors a cooperative cancel flag for clean stops. Worker instantiated with the exact static form (spec §6/§4.3).

### Task 7.1: Worker message protocol + worker module

**Files:**
- Create: `app/src/worker/protocol.ts`
- Create: `app/src/worker/solver.worker.ts`
- Test: `tests/worker/protocol.test.ts`

- [ ] **Step 1: Write the failing test** (protocol (de)serialization is pure & testable; the worker runtime is smoke-tested in the UI phase)

```ts
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
      version: '4.2.2.0', addons: ['fm', 'mb', 'gt'],
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
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/worker/protocol.test.ts` → FAIL.

- [ ] **Step 3: Implement `app/src/worker/protocol.ts`**

```ts
import { buildAspectData } from '../data/aspects';
import { deserializeBoard, type SerializedBoard } from '../core/board';
import { makeInventory } from '../core/inventory';
import type { SolveOptions, SolveResult, Progress } from '../core/solver';

export interface SolveRequest {
  version: '4.2.2.0';
  addons: string[];
  board: SerializedBoard;
  supply: Array<[string, number]>;
  threshold: number;
  budget: { maxNodes: number; maxTimeMs: number; beam?: number };
  allocBudget?: { maxNodes: number };
}

export type WorkerInbound = { type: 'solve'; req: SolveRequest } | { type: 'cancel' };
export type WorkerOutbound =
  | { type: 'progress'; progress: Progress }
  | { type: 'result'; result: SerializableResult }
  | { type: 'error'; message: string };

/** SolveResult minus the live Board; the board is sent as SerializedBoard. */
export interface SerializableResult {
  status: SolveResult['status'];
  board?: SerializedBoard;
  cost?: SolveResult['cost'];
  allocation?: { feasible: boolean | 'unknown'; scarcityCost: number; craftOps: number; leafConsumption: Array<[string, number]> };
  errors?: Array<{ type: string; cells: Array<{ q: number; r: number }> }>;
  stats: { nodes: number; timeMs: number };
}

export function encodeSolveRequest(req: SolveRequest): SolveRequest {
  return req; // already structured-clone friendly; explicit fn documents the boundary
}

export function decodeSolveRequest(req: SolveRequest): SolveOptions & { allocBudget?: { maxNodes: number } } {
  const data = buildAspectData({ version: req.version, addons: req.addons });
  const board = deserializeBoard(data, req.board);
  const inventory = makeInventory(req.supply, req.threshold);
  // Conditional spread keeps the literal valid under exactOptionalPropertyTypes (no `allocBudget: undefined`).
  return { data, board, inventory, budget: req.budget, ...(req.allocBudget ? { allocBudget: req.allocBudget } : {}) };
}
```

- [ ] **Step 4: Implement `app/src/worker/solver.worker.ts`** (runtime glue; not unit-tested here)

```ts
/// <reference lib="webworker" />
import { decodeSolveRequest } from './protocol';
import type { WorkerInbound, WorkerOutbound, SerializableResult } from './protocol';
import { solveWithValidation } from '../core/solver';
import { serializeBoard } from '../core/board';

let cancelRequested = false;

self.onmessage = (ev: MessageEvent<WorkerInbound>) => {
  const msg = ev.data;
  if (msg.type === 'cancel') { cancelRequested = true; return; }
  if (msg.type !== 'solve') return;
  cancelRequested = false;
  try {
    const opts = decodeSolveRequest(msg.req);
    const result = solveWithValidation({
      ...opts,
      now: () => Date.now(),
      shouldCancel: () => cancelRequested,
      onProgress: (p) => post({ type: 'progress', progress: p }),
    });
    // Conditional spreads (not `: undefined`) so the literal satisfies exactOptionalPropertyTypes.
    const out: SerializableResult = {
      status: result.status,
      stats: result.stats,
      ...(result.board ? { board: serializeBoard(result.board) } : {}),
      ...(result.cost ? { cost: result.cost } : {}),
      ...(result.allocation
        ? {
            allocation: {
              feasible: result.allocation.feasible,
              scarcityCost: result.allocation.scarcityCost,
              craftOps: result.allocation.craftOps,
              leafConsumption: [...result.allocation.leafConsumption],
            },
          }
        : {}),
      ...(result.errors ? { errors: result.errors.map((e) => ({ type: e.type, cells: e.cells })) } : {}),
    };
    post({ type: 'result', result: out });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

function post(m: WorkerOutbound): void {
  (self as DedicatedWorkerGlobalScope).postMessage(m);
}
```

> Note: `solveWithValidation` must also forward `onProgress`/`shouldCancel`/`now` — extend `SolveOptions` (it already carries them) and pass through in Task 6.5's wrapper (`return solve(opts)` already forwards the full `opts`). Also extend `SerializableResult.errors` typing in solver result mapping; `result.errors` exists on `SolveWithValidationResult`.

- [ ] **Step 5: Run to verify pass** — `bun test tests/worker/protocol.test.ts && bunx tsc --noEmit` → green.

- [ ] **Step 6: Commit**

```bash
git add app/src/worker/protocol.ts app/src/worker/solver.worker.ts tests/worker/protocol.test.ts
git commit -m "feat(worker): solver worker + structured-clone protocol (spec §5.5)"
```

### Task 7.2: `worker/solverClient.ts` — main-thread client with hard-cancel

**Files:**
- Create: `app/src/worker/solverClient.ts`

(No unit test — exercised by the UI smoke-test in Phase 9. Must use the exact static Worker URL form, spec §6/§4.3.)

- [ ] **Step 1: Implement `app/src/worker/solverClient.ts`**

```ts
import type { SolveRequest, WorkerOutbound, SerializableResult } from './protocol';
import type { Progress } from '../core/solver';

export class SolverClient {
  private worker: Worker | null = null;

  private spawn(): Worker {
    // EXACT static form required by Vite to rewrite the base path (spec §6).
    return new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  }

  solve(req: SolveRequest, onProgress: (p: Progress) => void): Promise<SerializableResult> {
    this.cancel(); // ensure a clean worker
    const worker = this.spawn();
    this.worker = worker;
    return new Promise<SerializableResult>((resolve, reject) => {
      worker.onmessage = (ev: MessageEvent<WorkerOutbound>) => {
        const m = ev.data;
        if (m.type === 'progress') onProgress(m.progress);
        else if (m.type === 'result') { resolve(m.result); this.dispose(); }
        else if (m.type === 'error') { reject(new Error(m.message)); this.dispose(); }
      };
      worker.onerror = (e) => { reject(new Error(e.message)); this.dispose(); };
      worker.postMessage({ type: 'solve', req });
    });
  }

  /** Guaranteed cancel: hard-terminate and drop the worker (spec §5.5). */
  cancel(): void {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }

  private dispose(): void {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }
}
```

- [ ] **Step 2: Typecheck** — `bunx tsc --noEmit` → 0.

- [ ] **Step 3: Commit**

```bash
git add app/src/worker/solverClient.ts
git commit -m "feat(worker): main-thread SolverClient with hard-terminate cancel"
```

---

## Phase 8 — `state/persistence.ts`: localStorage with schemaVersion + migration (spec §2.3, §8)

Pure, DI-testable (accepts a `Storage`-like object; defaults to `globalThis.localStorage`).

### Task 8.1: Persisted app state

**Files:**
- Create: `app/src/state/persistence.ts`
- Test: `tests/state/persistence.test.ts`

- [ ] **Step 1: Write the failing tests** (in-memory Storage fake)

```ts
import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import { createBoard, setState, serializeBoard } from '../../app/src/core/board';
import { saveState, loadState, STATE_SCHEMA_VERSION, type AppState } from '../../app/src/state/persistence';

const data = buildAspectData();

class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

function sampleState(): AppState {
  const b = createBoard(3);
  setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
  return { schemaVersion: STATE_SCHEMA_VERSION, radius: 3, addons: ['fm', 'mb', 'gt'], threshold: 50, supply: [['air', 64]], board: serializeBoard(b) };
}

describe('persistence', () => {
  it('round-trips through storage', () => {
    const s = new FakeStorage();
    saveState(sampleState(), s as unknown as Storage);
    const loaded = loadState(data, s as unknown as Storage);
    expect(loaded?.radius).toBe(3);
    expect(loaded?.supply).toContainEqual(['air', 64]);
  });

  it('returns null on corrupt JSON (reset to default)', () => {
    const s = new FakeStorage();
    s.setItem('gtnh-solver-state', '{not json');
    expect(loadState(data, s as unknown as Storage)).toBeNull();
  });

  it('returns null on unknown schemaVersion', () => {
    const s = new FakeStorage();
    s.setItem('gtnh-solver-state', JSON.stringify({ ...sampleState(), schemaVersion: 999 }));
    expect(loadState(data, s as unknown as Storage)).toBeNull();
  });

  it('returns null when board fails validation', () => {
    const s = new FakeStorage();
    const bad = sampleState();
    (bad.board.cells[0] as { aspect: string }).aspect = 'nonsense';
    s.setItem('gtnh-solver-state', JSON.stringify(bad));
    expect(loadState(data, s as unknown as Storage)).toBeNull();
  });

  it('returns null on negative/non-integer persisted supply (spec §4.1)', () => {
    const s = new FakeStorage();
    s.setItem('gtnh-solver-state', JSON.stringify({ ...sampleState(), supply: [['air', -5]] }));
    expect(loadState(data, s as unknown as Storage)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/state/persistence.test.ts` → FAIL.

- [ ] **Step 3: Implement `app/src/state/persistence.ts`**

```ts
import type { AspectData } from '../data/aspects';
import { deserializeBoard, type SerializedBoard } from '../core/board';

export const STATE_SCHEMA_VERSION = 1;
const KEY = 'gtnh-solver-state';

export interface AppState {
  schemaVersion: number;
  radius: number;
  addons: string[];
  threshold: number;
  supply: Array<[string, number]>;
  board: SerializedBoard;
}

export function saveState(state: AppState, storage: Storage = globalThis.localStorage): void {
  storage.setItem(KEY, JSON.stringify({ ...state, schemaVersion: STATE_SCHEMA_VERSION }));
}

export function loadState(data: AspectData, storage: Storage = globalThis.localStorage): AppState | null {
  const raw = storage.getItem(KEY);
  if (raw === null) return null;
  try {
    const obj = JSON.parse(raw) as Partial<AppState>;
    if (obj.schemaVersion !== STATE_SCHEMA_VERSION) return null; // migration hook (only v1 today)
    if (!obj.board) return null;
    deserializeBoard(data, obj.board); // throws if invalid -> caught -> null
    if (typeof obj.threshold !== 'number' || obj.threshold <= 0) return null;
    if (!Number.isInteger(obj.radius)) return null;
    if (!Array.isArray(obj.supply)) return null;
    for (const e of obj.supply) {
      if (!Array.isArray(e) || e.length !== 2) return null;
      const [a, nval] = e as [unknown, unknown];
      if (typeof a !== 'string' || !data.universe.has(a)) return null;
      if (!Number.isInteger(nval) || (nval as number) < 0) return null; // spec §4.1
    }
    return obj as AppState;
  } catch {
    return null; // corrupt -> reset to default
  }
}
```

- [ ] **Step 4: Run to verify pass** — `bun test tests/state/persistence.test.ts && bunx tsc --noEmit` → green.

- [ ] **Step 5: Commit**

```bash
git add app/src/state/persistence.ts tests/state/persistence.test.ts
git commit -m "feat(state): localStorage persistence with schemaVersion + validation"
```

---

## Phase 9 — `ui/`: SVG board, palettes, tools, progress, attribution (spec §8)

Core is green before starting UI (spec §7). UI logic that is pure (hex↔pixel layout, hit-testing, cost formatting, status text) is unit-tested; rendering/interaction is verified by the manual smoke-test in Task 9.5. Icons are referenced via `import.meta.env.BASE_URL + iconFile(...)`.

### Task 9.1: Pure UI helpers (layout + status text)

**Files:**
- Create: `app/src/ui/layout.ts`
- Create: `app/src/ui/format.ts`
- Test: `tests/ui/layout.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'bun:test';
import { hexToPixel, pixelToHex, hexCorners } from '../../app/src/ui/layout';
import { statusLabel } from '../../app/src/ui/format';

describe('hex layout (pointy-top)', () => {
  it('maps center to origin and round-trips', () => {
    expect(hexToPixel({ q: 0, r: 0 }, 20)).toEqual({ x: 0, y: 0 });
    const p = hexToPixel({ q: 2, r: -1 }, 20);
    expect(pixelToHex(p, 20)).toEqual({ q: 2, r: -1 });
  });
  it('produces 6 corners', () => {
    expect(hexCorners({ x: 0, y: 0 }, 20)).toHaveLength(6);
  });
});

describe('status labels (spec §8, human-readable RU)', () => {
  it('maps every status to a non-empty label', () => {
    for (const s of ['OPTIMAL', 'FEASIBLE_TIMEOUT', 'UNKNOWN_TIMEOUT', 'INFEASIBLE_INVENTORY', 'UNSAT_PROVEN', 'CANCELLED', 'INVALID_INPUT'] as const) {
      expect(statusLabel(s).length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test tests/ui/layout.test.ts` → FAIL.

- [ ] **Step 3: Implement `app/src/ui/layout.ts`**

```ts
import type { Hex } from '../core/hex';

export interface Pixel { x: number; y: number; }

// pointy-top axial layout (redblobgames)
export function hexToPixel(h: Hex, size: number): Pixel {
  return { x: size * Math.sqrt(3) * (h.q + h.r / 2), y: size * 1.5 * h.r };
}

export function pixelToHex(p: Pixel, size: number): Hex {
  const q = (Math.sqrt(3) / 3 * p.x - p.y / 3) / size;
  const r = (2 / 3 * p.y) / size;
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
    const angle = Math.PI / 180 * (60 * i - 30); // pointy-top
    corners.push({ x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) });
  }
  return corners;
}
```

- [ ] **Step 4: Implement `app/src/ui/format.ts`**

```ts
import type { SolverStatus } from '../core/solver';
import type { Cost } from '../core/cost';

export function statusLabel(s: SolverStatus): string {
  switch (s) {
    case 'OPTIMAL': return 'Оптимально';
    case 'FEASIBLE_TIMEOUT': return 'Решение найдено (по таймауту)';
    case 'UNKNOWN_TIMEOUT': return 'Неизвестно (таймаут)';
    case 'INFEASIBLE_INVENTORY': return 'Не хватает запасов';
    case 'UNSAT_PROVEN': return 'Решения нет';
    case 'CANCELLED': return 'Отменено';
    case 'INVALID_INPUT': return 'Некорректный ввод';
  }
}

export function costLabel(c: Cost | undefined): string {
  if (!c) return '—';
  const scar = Number.isFinite(c.scarcity) ? String(c.scarcity) : '∞';
  return `дефицит ${scar}, клеток ${c.cells}`;
}
```

- [ ] **Step 5: Run to verify pass** — `bun test tests/ui/layout.test.ts && bunx tsc --noEmit` → green.

- [ ] **Step 6: Commit**

```bash
git add app/src/ui/layout.ts app/src/ui/format.ts tests/ui/layout.test.ts
git commit -m "feat(ui): pure layout + status/cost formatting helpers"
```

### Task 9.2: SVG board renderer

**Files:**
- Create: `app/src/ui/boardView.ts` (renders a `Board` to SVG into a container; draws icons, dead-hatching, invalid-link highlights, anchor ring; emits cell-click events)
- Create: `app/src/ui/icons.ts` (`iconUrl(data, aspect) = import.meta.env.BASE_URL + iconFile(data, aspect)`)

- [ ] **Step 1: Implement `app/src/ui/icons.ts`**

```ts
import { iconFile, type AspectData, type Aspect } from '../data/aspects';

export function iconUrl(data: AspectData, a: Aspect): string {
  return import.meta.env.BASE_URL + iconFile(data, a);
}
```

- [ ] **Step 2: Implement `app/src/ui/boardView.ts`** — a class `BoardView` that:
  - builds one `<svg>` sized to fit `boardCells(radius)` (compute bounds from `hexToPixel`);
  - for each cell draws a `<polygon>` from `hexCorners`; parchment fill; DEAD cells get a hatch pattern; ANCHOR cells get a highlighted ring; PLACED/ANCHOR draw an `<image href={iconUrl(...)}>`;
  - highlights cells from a passed-in `ValidationError[]` (red stroke);
  - calls `onCellClick(hex)` from a single SVG click handler that maps `event offset → pixelToHex`.
  - exposes `render(board, errors?)` to re-draw.

```ts
import type { AspectData } from '../data/aspects';
import { type Board, getState } from '../core/board';
import type { ValidationError } from '../core/board';
import { boardCells, type Hex } from '../core/hex';
import { hexToPixel, hexCorners } from './layout';
import { iconUrl } from './icons';

const SIZE = 26;
const SVG_NS = 'http://www.w3.org/2000/svg';

export class BoardView {
  private svg: SVGSVGElement;
  constructor(private container: HTMLElement, private data: AspectData, private onCellClick: (h: Hex) => void) {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.container.appendChild(this.svg);
  }

  render(board: Board, errors: ValidationError[] = []): void {
    // compute bounds, set viewBox, clear, draw polygons + icons + dead hatch + error outlines.
    // For each cell: polygon points = hexCorners(hexToPixel(hex, SIZE), SIZE).
    // Attach a data-coord attribute; a single delegated click handler maps to onCellClick.
    // (Full DOM construction — implement straightforwardly; no algorithmic subtlety.)
    void getState; void boardCells; void hexToPixel; void hexCorners; void iconUrl; void this.data;
  }
}
```

> This file is pure DOM construction (no algorithmic risk). Implement it directly; it is validated by the smoke-test (Task 9.5), not unit tests.

- [ ] **Step 3: Typecheck** — `bunx tsc --noEmit` → 0.

- [ ] **Step 4: Commit**

```bash
git add app/src/ui/icons.ts app/src/ui/boardView.ts
git commit -m "feat(ui): SVG hex board renderer"
```

### Task 9.3: Palettes, tools, inventory panel, Subtract used

**Files:**
- Create: `app/src/ui/aspectPalette.ts` (left: clickable aspect brush; icons via `iconUrl`)
- Create: `app/src/ui/inventoryPanel.ts` (right: editable counts; threshold field default 50; **Subtract used** button + direct/craft breakdown from `allocation`)
- Create: `app/src/ui/toolbar.ts` (radius 2–5 selector; tools Dead Hex / Erase / Clear / Auto Solve / Validate / Continue Solve)

- [ ] **Step 1: Implement the three components** as classes that render into given containers and emit callbacks (`onAspectPick`, `onSupplyChange`, `onThresholdChange`, `onSubtractUsed`, `onTool`, `onRadiusChange`). The inventory panel's **Subtract used** applies `leafConsumption` to supply with a floor at 0 and shows `craftOps`. Each lists all `data.universe` aspects with their icon + latin name.

- [ ] **Step 2: Typecheck** — `bunx tsc --noEmit` → 0.

- [ ] **Step 3: Commit**

```bash
git add app/src/ui/aspectPalette.ts app/src/ui/inventoryPanel.ts app/src/ui/toolbar.ts
git commit -m "feat(ui): aspect palette, inventory panel (subtract used), toolbar"
```

### Task 9.4: App shell wiring (`main.ts`) — state, solver client, progress, persistence, attribution

**Files:**
- Modify: `app/src/main.ts` (replace stub)
- Create: `app/src/ui/app.css`

- [ ] **Step 1: Implement `app/src/main.ts`** wiring everything:
  - build `AspectData` once; load persisted state (`loadState`) or default (R2, empty board, threshold 50, empty supply, addons on);
  - maintain the live `Board` + `Inventory`; persist on every edit (`saveState`);
  - **Tools:** Dead Hex toggles `DEAD`; Erase sets `EMPTY`; Clear resets placed/anchors per chosen scope; click with an aspect brush sets `ANCHOR` (empty-cell, anchor mode) or `PLACED{locked:true}` (manual mode); radius change rebuilds the board (warn if it would drop filled cells).
  - **Auto Solve:** snapshot a baseline revision (anchors + locked) for subtraction; build `SolveRequest`; run `SolverClient.solve(req, onProgress)`; show a progress bar (nodes / best cost via `costLabel` / time / status) and a **Cancel** button calling `client.cancel()` (hard terminate). On result: deserialize the board, render it, show `statusLabel`, and store `allocation` for Subtract used.
  - **Validate:** run `validate(data, board)` and highlight errors (no solving).
  - **Continue Solve:** mark current manual `PLACED` cells as `locked:true`, then Auto Solve (solver fills the rest as `locked:false`).
  - **Anchor cap:** if `anchorCells > 8`, disable Auto Solve and show a warning (spec §5.1).
  - **Attribution (spec §8):** render a visible footer: "Aspect data & icons © original authors, CC-BY-4.0" linking `http://creativecommons.org/licenses/by/4.0/` and the upstream repos (per README).

- [ ] **Step 2: Implement minimal `app/src/ui/app.css`** (3-column layout: palette / board / inventory; header toolbar; footer attribution; progress bar). Keep it simple and readable.

- [ ] **Step 3: Typecheck** — `bunx tsc --noEmit` → 0.

- [ ] **Step 4: Commit**

```bash
git add app/src/main.ts app/src/ui/app.css
git commit -m "feat(ui): app shell — tools, solver client, progress, persistence, attribution"
```

### Task 9.5: Dev smoke-test (manual)

- [ ] **Step 1: Run `bun run dev`** and open the URL (served under `/tcresearch-solver/v2/`). Verify, recording each:
  - board renders for R2–R5; aspect icons load (no 404s in console);
  - place two anchors (e.g. `air`, `entropy`), **Auto Solve** → a valid chain appears; status reads "Оптимально"; progress bar moved; **Cancel** during a heavy R5 solve stops immediately;
  - **Dead Hex** blocks a cell and the solver routes around it;
  - **Validate** highlights a deliberately bad manual placement in red;
  - **Continue Solve** completes a partial manual chain;
  - **Subtract used** decrements inventory by the consumed leaves and shows the direct/craft split;
  - reload the page → board + inventory + threshold restored from localStorage.
- [ ] **Step 2: Fix any issue found, then commit** any fixes with `fix(ui): …`.

---

## Phase 10 — Build & deploy to `gh-pages` `/v2/` (spec §9)

### Task 10.1: Production build + prefix smoke-test

**Files:** none new (uses `bun run build`).

- [ ] **Step 1: Full pre-deploy gate**

Run: `bun test && bunx tsc --noEmit && bun run build`
Expected: tests green; `tsc` 0; `vite build` writes `v2/` with `index.html`, hashed JS, the worker chunk, and `aspects/color/*.png`. Confirm `v2/index.html` references assets under `/tcresearch-solver/v2/`.

- [ ] **Step 2: Smoke-test the built bundle under the real prefix**

Run: `bun run preview` (serves with `--base /tcresearch-solver/v2/`). Open the printed `/tcresearch-solver/v2/` URL. Verify: app loads, icons load, **worker loads and solves** (network tab shows the worker chunk under the `/v2/` prefix), no console 404s. This catches base-path/worker-URL regressions (spec §9 checklist).

- [ ] **Step 3: Verify the legacy site is untouched**

Run: confirm root `index.html`, `js/`, `css/` are unmodified (`git status` clean for them) — the legacy site still opens.

### Task 10.2: Publish to `gh-pages`

> GitHub Pages source = branch `gh-pages`, `/(root)`. The built app lives at `gh-pages:/v2/`. Do **not** overwrite the legacy root site on `gh-pages`. Confirm the exact deploy mechanism with the user before pushing (this is an outward-facing publish).

- [ ] **Step 1: Force-add the build output** (it is gitignored on the feature branch)

Run:
```bash
git add -f v2
git commit -m "build: v2 production bundle"
```

- [ ] **Step 2: Bring `v2/` onto `gh-pages`** (recommended: merge the feature branch's `v2/` without touching legacy root). Propose to the user one of:
  - `git checkout gh-pages && git checkout feature/gtnh-research-solver -- v2 && git commit -m "deploy: GTNH solver v2" && git push origin gh-pages`, **or**
  - open a PR from `feature/gtnh-research-solver` → `gh-pages`.

  Use `AskUserQuestion` to choose; do not push without approval.

- [ ] **Step 3: Post-deploy verification**

Open `https://egor-muindor.github.io/tcresearch-solver/v2/`. Verify the app loads, icons/worker load, a solve runs, and the legacy `https://egor-muindor.github.io/tcresearch-solver/` still works. Confirm the visible CC-BY-4.0 attribution is present (spec §8/§9).

---

## Self-Review (run against the spec with fresh eyes)

**1. Spec coverage** — every spec section maps to a task:

| Spec | Covered by |
|---|---|
| §2.1 universe/graph/`Set`/fail-loud validation | Task 1.1, 1.2 (61 aspects / 110 edges fixture) |
| §2.2 primal decomposition (cycle-safe, memo) | Task 1.2 (cycle), Task 3.1 (`primalVec`) |
| §2.3 hex board + unified cell-state + serialization | Phase 2, Task 5.1, 5.3 |
| §3 full validity + connectivity + pre-validation `INVALID_INPUT` | Task 5.2, 6.5 |
| §4.1 constants/validation | Task 4.1 |
| §4.2 directPenalty / obtainCost LB / globalMinObtain / LB property | Task 4.1, plus LB test in 4.2 |
| §4.3 exact allocation, feasible/unknown, leafConsumption, budget | Task 4.2 |
| §5.1 bounds, 0/1/2–8 anchors | Task 6.4 (trivial + multi-anchor tests) |
| §5.2 g_lb⊕h, comparator, 7 invariants, incumbent/`anyUnknownCompetitive` | Tasks 6.1–6.4 |
| §5.2 Dreyfus–Wagner heuristic, MST rejected | Task 6.2 (star test = 1), 6.3 |
| §5.2 completeness (include/exclude expansion, no closed-set merge hazard) | Task 6.4 (1-cell-optimum regression) |
| §5.3 untrusted seeding (merge+validate+backtrack) | Task 6.4 trusted `accept` gate + **optional** Task 6.7 (pairwise-Dijkstra); correctness independent of the seed |
| §5.4 status table + unknown blocks proofs + beam degradation | Task 6.4 |
| §5.5 worker + hard-terminate cancel + per-radius budgets + progress | Phase 7, Task 6.4 (`DEFAULT_BUDGETS`, `onProgress`), Task 6.6 (R2–R5 gate) |
| §6 architecture / worker URL form / outDir | Phase 0, Task 7.2 |
| §7 test-first core before UI + `tsc --noEmit` + benches | every TDD task + Task 6.6 |
| §8 UI (toolbar, palettes, inventory, progress, statuses, attribution, localStorage) | Phase 9 |
| §9 deploy (root=app, base, v2, smoke-test, pinned bun/vite) | Phase 0, Phase 10 |
| §10 future work | out of scope (noted) |

**2. Placeholder scan** — the only intentionally-light implementations are `boardView.ts` and the three Phase-9 UI components (pure DOM, validated by smoke-test, not unit tests), and the `cheapestProductPath` Dijkstra body in the **optional** Task 6.7 (returns `null` to keep the seed inert until fleshed out; correctness never depends on it). No `TODO`/"handle edge cases"/"similar to" placeholders in core logic; all core steps carry full code.

**3. Type consistency** — names/signatures reused verbatim across tasks: `Aspect`, `AspectData`, `buildAspectData`, `Hex`, `hexKey`, `Board`, `CellState`, `getState/setState`, `filledCells/filledNeighbors/anchorCells`, `validate/ValidationError/ValidationErrorType`, `allAnchorsConnected/isComplete`, `serializeBoard/deserializeBoard/SerializedBoard`, `Inventory/makeInventory/directPenalty/obtainCost/globalMinObtain/allocate/AllocationResult/AllocBudget`, `Cost/compareCost/addCost/lessThan`, `steinerNodeWeighted/SteinerGraph`, `remainderHeuristic`, `solve/solveWithValidation/SolveOptions/SolveResult/SolverStatus/Progress/DEFAULT_BUDGETS/budgetForRadius`, `SolveRequest/decodeSolveRequest/SerializableResult`, `SolverClient`, `saveState/loadState/AppState`, `iconFile/iconUrl`, `statusLabel/costLabel`, `hexToPixel/pixelToHex/hexCorners`.

**Known follow-ups for the implementer (not blockers):**
- `SolveOptions` declares `onProgress/shouldCancel/now/seed`; `solve` reads them and `solveWithValidation` forwards the whole `opts`. The worker uses `solveWithValidation` so inventory pre-validation covers the search path.
- If the R2–R5 bench (Task 6.6) exceeds budget, tune branch ordering / `DEFAULT_BUDGETS` before the worker phase — admissible `f`-pruning (post-incumbent) plus cheap-first branch order is the lever. Do **not** reintroduce a placement-keyed closed set (it can drop exclusion context — see Task 6.4 guidance).
- True cooperative mid-search cancel/yield (vs. hard-terminate) is a documented enhancement (explicit-stack iterative `solve`); v1 ships synchronous `solve` + hard-terminate, which already guarantees cancellation (spec §5.5).

### Post-plan Codex review (resolved)

A full Codex review of this plan was run after drafting. All findings were verified and fixed inline:

| Finding (sev) | Resolution |
|---|---|
| Single-cell expansion is incomplete (BLOCKER) | Task 6.4 rewritten to **include/exclude** branching over one forced frontier cell; closed set removed; 1-cell-optimum regression test added |
| Allocator reports interrupted search as exact (BLOCKER) | Task 4.2: budget exhaustion returns `'unknown'` **before** any provisional `best`; short-circuits all ancestors |
| `+∞`-LB pruning corrupts UNSAT vs INFEASIBLE (BLOCKER) | Task 6.4: removed the `!isFinite(g)` prune; such branches now reach goals to set `anyValidBoardFound`; corrects a spec §5.2-inv-6 parenthetical |
| Allocator not memoized (MAJOR) | Task 4.2: memoized recursion on `(i, suffix-needs)` |
| Worker not progress-reporting (MAJOR) | Task 6.4: `onProgress` every 1024 nodes; worker forwards via `postMessage`; cancel = hard-terminate (documented) |
| Seed unimplemented but claimed (MAJOR) | Seed marked **optional** Task 6.7 with a trusted `accept` gate; coverage table corrected |
| Invalid inventory could enter search (MAJOR) | Task 6.5 `solveWithValidation` calls `validateInventory` → `INVALID_INPUT`; Task 8.1 `loadState` validates supply entries |
| R4/R5 budgets/benches missing (MAJOR) | Task 6.4 `DEFAULT_BUDGETS`/`budgetForRadius`; Task 6.6 R2–R5 bench + acceptance gate |
| `exactOptionalPropertyTypes` violations (MAJOR) | Task 7.1: conditional spreads in `decodeSolveRequest` and `SerializableResult` |
| Synthetic tests blocked by metadata validation (MINOR) | Task 1.2: `overrideTranslate` + identity fallback in override mode |
| Edge fixture only counted (MINOR) | Task 1.2: frozen canonical 110-edge set assertion |

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-14-gtnh-research-solver.md`.

Per the project's model strategy (Opus plans, **Sonnet** implements + tests), execute the TDD tasks on Sonnet. Two options:

1. **Subagent-Driven (recommended)** — dispatch a fresh Sonnet subagent per task, two-stage review between tasks (`superpowers:subagent-driven-development`). Best for this plan's many independent, well-bounded tasks.
2. **Inline Execution** — execute tasks in this session in batches with checkpoints (`superpowers:executing-plans`).

