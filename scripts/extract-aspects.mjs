// scripts/extract-aspects.mjs
//
// Reproducible aspect extractor for the GTNH research solver.
//
// Reads the GregTech: New Horizons mod jars, decompiles the classes that
// register Thaumcraft aspects, and emits both the typed data layer
// (app/src/data/raw.ts) and the icon set (aspects/color/*.png) directly from
// the mods — so the project carries no third-party (CC-BY) asset dependency.
//
// Requirements (dev machine only — never runs in the browser/CI):
//   - the modpack jars in tmp/mods  (override with MODS_DIR=...)
//   - a JDK on PATH (java, jar)      and  unzip, curl
// CFR (decompiler) is fetched once into tmp/extract-work/cfr.jar.
//
// Usage:  node scripts/extract-aspects.mjs           # write raw.ts + icons
//         node scripts/extract-aspects.mjs --check    # print report, write nothing
//
// How aspects are modelled here:
//   * Every Thaumcraft aspect has a latin TAG (aer, ignis, gloria, ...) which is
//     also its icon basename. That tag is the real in-game identity.
//   * The solver keeps the established ENGLISH keys (air, wrath, time, ...) for
//     the aspects ythri's data already named — these are just Thaumcraft's own
//     Java field names lowercased, kept stable so the test-suite/UI don't churn.
//     Genuinely new aspects (gloria, tabernus, ...) are keyed by their latin tag.

import { execSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readdirSync, writeFileSync,
  copyFileSync, readFileSync, rmSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODS_DIR = process.env.MODS_DIR || join(ROOT, 'tmp/mods');
const WORK = process.env.WORK_DIR || join(ROOT, 'tmp/extract-work');
const CFR = process.env.CFR_JAR || join(WORK, 'cfr.jar');
const CFR_URL = 'https://repo1.maven.org/maven2/org/benf/cfr/0.152/cfr-0.152.jar';
const ICON_OUT = join(ROOT, 'aspects/color');
const RAW_OUT = join(ROOT, 'app/src/data/raw.ts');
const CHECK_ONLY = process.argv.includes('--check');

// ── Established latin→english key aliases (Thaumcraft field names ythri adopted).
// Aspects absent here keep their latin tag as the key. `saxum`/`granum` (the old
// stone/seed aspects) are intentionally absent: they no longer exist in TC 4.2.3.5a.
const LATIN_TO_ENGLISH = {
  aer: 'air', terra: 'earth', ignis: 'fire', aqua: 'water', ordo: 'order',
  perditio: 'entropy', vacuos: 'void', lux: 'light', potentia: 'energy',
  motus: 'motion', victus: 'life', tempestas: 'weather', gelum: 'cold',
  vitreus: 'crystal', mortuus: 'death', volatus: 'flight', tenebrae: 'darkness',
  spiritus: 'soul', sano: 'heal', iter: 'travel', venenum: 'poison',
  alienis: 'eldritch', praecantatio: 'magic', auram: 'aura', vitium: 'taint',
  limus: 'slime', herba: 'plant', arbor: 'tree', bestia: 'beast', corpus: 'flesh',
  exanimis: 'undead', cognitio: 'mind', sensus: 'senses', humanus: 'man',
  messis: 'crop', meto: 'harvest', metallum: 'metal', perfodio: 'mine',
  instrumentum: 'tool', telum: 'weapon', tutamen: 'armor', fames: 'hunger',
  lucrum: 'greed', fabrico: 'craft', pannus: 'cloth', machina: 'mechanism',
  vinculum: 'trap', permutatio: 'exchange', ira: 'wrath', infernus: 'nether',
  gula: 'gluttony', invidia: 'envy', desidia: 'sloth', superbia: 'pride',
  luxuria: 'lust', tempus: 'time', electrum: 'electricity', magneto: 'magnetism',
  nebrisum: 'cheatiness', radio: 'radioactivity', strontio: 'stupidity',
};

// Which mod jar owns each addon group, and the human label emitted into raw.ts.
// (Aspects are auto-assigned to a group by the mod that registers them.)
const ADDON_GROUPS = {
  forbidden: { id: 'fm', name: 'Forbidden Magic' },
  magicbees: { id: 'mb', name: 'Magic Bees' },
  gregtech: { id: 'gt', name: 'Gregtech' },
  thaumicboots: { id: 'tb', name: 'Thaumic Boots' },
  avaritia: { id: 'av', name: 'Avaritia' },
};

const sh = (cmd, opts = {}) =>
  execSync(cmd, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });

function ensureCfr() {
  mkdirSync(WORK, { recursive: true });
  if (!existsSync(CFR)) {
    log(`fetching CFR → ${CFR}`);
    sh(`curl -sSL -m 60 -o ${q(CFR)} ${q(CFR_URL)}`);
  }
}

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const log = (m) => process.stderr.write(`[extract] ${m}\n`);

function listJars() {
  return readdirSync(MODS_DIR)
    .filter((f) => f.endsWith('.jar'))
    .map((f) => join(MODS_DIR, f));
}

// Decompile a single class entry out of a jar to Java source text. Reuses the
// already-extracted class file (from candidateClasses) when available.
function decompileClass(jar, classEntry) {
  let tmpClass = join(WORK, 'classes', sanitize(jar), classEntry);
  if (!existsSync(tmpClass)) {
    tmpClass = join(WORK, 'cls', classEntry.replace(/[\/$]/g, '__'));
    mkdirSync(dirname(tmpClass), { recursive: true });
    sh(`unzip -p ${q(jar)} ${q(classEntry)} > ${q(tmpClass)}`);
  }
  return sh(`java -jar ${q(CFR)} ${q(tmpClass)} --silent true 2>/dev/null`);
}

// A class registers compound aspects iff its constant pool carries the
// Aspect[] parameter descriptor. (Object-tagging via AspectList never does.)
// Extract the jar's classes once, then grep them — far faster than per-entry.
function candidateClasses(jar) {
  const dir = join(WORK, 'classes', sanitize(jar));
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    sh(`unzip -o -q ${q(jar)} '*.class' -d ${q(dir)} 2>/dev/null || true`);
    const hits = sh(
      `grep -rlaE '\\[Lthaumcraft/api/aspects/Aspect;' ${q(dir)} 2>/dev/null || true`
    ).split('\n').filter(Boolean);
    return hits.map((p) => p.slice(dir.length + 1)); // entry path inside jar
  } catch { return []; }
}

function jarReferencesAspectArray(jar) {
  try {
    const n = sh(`unzip -p ${q(jar)} 2>/dev/null | LC_ALL=C grep -c '\\[Lthaumcraft/api/aspects/Aspect;' || true`);
    return parseInt(n, 10) > 0;
  } catch { return false; }
}

// ── Parsing helpers ────────────────────────────────────────────────────────

// A component is either `Aspect.FIELD` / `FIELD`, or `Aspect.getAspect("tag")`.
function parseComponent(raw) {
  raw = raw.trim().replace(/\(String\)/g, '').replace(/\s+/g, ' ');
  const get = raw.match(/getAspect\(\s*"([^"]+)"\s*\)/);
  if (get) return { kind: 'tag', value: get[1] };
  const field = raw.match(/(?:Aspect\.)?([A-Z][A-Z0-9_]*)/);
  if (field) return { kind: 'field', value: field[1] };
  throw new Error(`unparseable component: ${raw}`);
}

function parseComponents(arrBody) {
  return arrBody.split(',').map((s) => s.trim()).filter(Boolean).map(parseComponent);
}

// Resolve a ResourceLocation expression to { modid, file } (the source PNG name),
// handling both the ("mod","textures/aspects/x.png") and the gregtech
// ("gregtech:textures/aspects/" + ENUM.name() + ".png") forms.
function parseResourceLocation(expr) {
  const two = expr.match(/new ResourceLocation\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/);
  if (two) return { modid: two[1], path: two[2], file: two[2].split('/').pop() };
  const concat = expr.match(/new ResourceLocation\(\s*"([^":]+):([^"]*)"\s*\+\s*[\w.]+\.([A-Z0-9_]+)\.name\(\)\s*\+\s*"([^"]*)"/);
  if (concat) {
    const file = `${concat[3]}${concat[4]}`;
    return { modid: concat[1], path: `${concat[2]}${file}`, file };
  }
  return null;
}

// ── Base aspects (Thaumcraft's own Aspect class) ────────────────────────────
function extractBase(thaumcraftJar) {
  const src = decompileClass(thaumcraftJar, 'thaumcraft/api/aspects/Aspect.class');
  const aspects = [];        // { field, tag, components:[{kind,value}]|null }
  const re = /public static final Aspect ([A-Z][A-Z0-9_]*) = new Aspect\("([a-z0-9_]+)",\s*[^,]+(?:,\s*new Aspect\[\]\{([^}]*)\})?/g;
  let m;
  for (const line of src.split('\n')) {
    re.lastIndex = 0;
    m = re.exec(line);
    if (!m) continue;
    const [, field, tag, arr] = m;
    aspects.push({ field, tag, components: arr ? parseComponents(arr) : null });
  }
  if (aspects.length < 40) throw new Error(`base extraction looks wrong (${aspects.length} aspects)`);
  return aspects;
}

// ── Addon aspects (registered with an explicit texture ResourceLocation) ────
function extractAddons(jars, thaumcraftJar) {
  const found = []; // { tag, components, rl:{modid,file,path}, jar, modid }
  for (const jar of jars) {
    if (jar === thaumcraftJar) continue;
    if (!jarReferencesAspectArray(jar)) continue;
    for (const entry of candidateClasses(jar)) {
      let src;
      try { src = decompileClass(jar, entry); } catch { continue; }
      // X = new <AnyAspect>("tag", color, new Aspect[]{...}, new ResourceLocation(...))
      // The ResourceLocation may contain nested calls (gregtech `…name() + ".png"`),
      // so capture up to the closing `.png")`.
      const re = /new [A-Za-z_]+\(\s*(?:this,\s*)?"([a-z0-9_]+)"\s*,\s*[^,]+,\s*new Aspect\[\]\{([^}]*)\}\s*,\s*(new ResourceLocation\([^;]*?\.png"\s*\))/g;
      let m;
      while ((m = re.exec(src))) {
        const [, tag, arr, rlExpr] = m;
        const rl = parseResourceLocation(rlExpr);
        if (!rl) { log(`WARN: unparsed ResourceLocation for "${tag}" in ${jar}`); continue; }
        found.push({ tag, components: parseComponents(arr), rl, modid: rl.modid });
      }
    }
  }
  // De-dup (a tag can appear in multiple bundled copies); first real hit wins.
  const seen = new Set();
  return found.filter((a) => (seen.has(a.tag) ? false : seen.add(a.tag)));
}

// ── Build the unified model ─────────────────────────────────────────────────
function build() {
  const jars = listJars();
  const thaumcraftJar = jars.find((j) => /Thaumcraft-/.test(j));
  if (!thaumcraftJar) throw new Error('Thaumcraft jar not found in ' + MODS_DIR);

  log('extracting base aspects…');
  const base = extractBase(thaumcraftJar);
  log(`base aspects: ${base.length}`);

  log('scanning jars for addon aspect registrations…');
  const addons = extractAddons(jars, thaumcraftJar);
  log(`addon aspects: ${addons.length} (${addons.map((a) => a.tag).join(', ')})`);

  // iconBase = the latin display tag used as the PNG basename.
  // GregTech custom1..5 carry tag "customN"; their display tag is the enum name.
  const iconBaseOf = (tag, rl) =>
    /^custom\d+$/.test(tag) ? rl.file.replace(/\.png$/i, '').toLowerCase() : tag;

  // Assemble every aspect: key (english alias or latin tag), tag, iconBase,
  // components (as keys), group id, and source texture.
  const all = new Map(); // key -> aspect record
  const tagToKey = new Map();
  const fieldToKey = new Map();

  const keyOf = (iconBase) => LATIN_TO_ENGLISH[iconBase] || iconBase;

  for (const a of base) {
    const key = keyOf(a.tag);
    all.set(key, {
      key, tag: a.tag, iconBase: a.tag, group: null,
      primal: a.components === null, components: a.components,
      jar: thaumcraftJar, texPath: `assets/thaumcraft/textures/aspects/${a.tag}.png`,
    });
    tagToKey.set(a.tag, key);
    fieldToKey.set(a.field, key);
  }
  for (const a of addons) {
    const iconBase = iconBaseOf(a.tag, a.rl);
    const key = keyOf(iconBase);
    const group = ADDON_GROUPS[a.modid]?.id ?? a.modid;
    all.set(key, {
      key, tag: a.tag, iconBase, group,
      primal: false, components: a.components,
      jar: jars.find((j) => j.includes(modJarHint(a.modid))) || a.jar,
      texPath: `assets/${a.rl.modid}/${a.rl.path}`,
      texFallbackModid: a.rl.modid, texFile: a.rl.file,
    });
    tagToKey.set(a.tag, key);
  }

  // Resolve components (field / tag refs) to keys.
  const resolve1 = (c) => {
    if (c.kind === 'tag') {
      const k = tagToKey.get(c.value);
      if (!k) throw new Error(`component tag "${c.value}" not found`);
      return k;
    }
    const k = fieldToKey.get(c.value) || tagToKey.get(c.value.toLowerCase());
    if (!k) throw new Error(`component field "${c.value}" not found`);
    return k;
  };
  for (const rec of all.values()) {
    rec.compKeys = rec.components ? rec.components.map(resolve1) : null;
  }

  return { all, jars };
}

function modJarHint(modid) {
  return { forbidden: 'Forbidden.Magic', magicbees: 'magicbees', gregtech: 'gregtech',
    thaumicboots: 'thaumicboots', avaritia: 'Avaritia' }[modid] || modid;
}

// ── Emit raw.ts ─────────────────────────────────────────────────────────────
function emitRaw({ all }) {
  const primals = [...all.values()].filter((a) => a.primal);
  const baseCompounds = [...all.values()].filter((a) => !a.primal && a.group === null);
  const byGroup = new Map();
  for (const a of all.values()) {
    if (a.group === null) continue;
    if (!byGroup.has(a.group)) byGroup.set(a.group, []);
    byGroup.get(a.group).push(a);
  }

  const pairs = (recs) =>
    recs.map((a) => `  ${a.key}: [${a.compKeys.map((k) => `'${k}'`).join(', ')}],`).join('\n');

  // Stable group order matching the established file.
  const GROUP_ORDER = ['fm', 'mb', 'gt', 'tb', 'av'];
  const GROUP_LABEL = { fm: 'Forbidden Magic', mb: 'Magic Bees', gt: 'Gregtech',
    tb: 'Thaumic Boots', av: 'Avaritia' };

  let addonsTs = '';
  for (const id of GROUP_ORDER) {
    const recs = byGroup.get(id);
    if (!recs) continue;
    const aspects = recs.map((a) => `'${a.key}'`).join(', ');
    const combos = recs.map((a) =>
      `      ${a.key}: [${a.compKeys.map((k) => `'${k}'`).join(', ')}],`).join('\n');
    addonsTs += `  ${id}: {\n    name: '${GROUP_LABEL[id]}',\n    aspects: [${aspects}],\n    combinations: {\n${combos}\n    },\n  },\n`;
  }

  const translate = [...all.values()]
    .map((a) => `  ${a.key}: '${a.iconBase}',`).join('\n');

  const ts = `// Aspect data for the Thaumcraft research minigame, extracted directly from the
// GregTech: New Horizons modpack jars (Thaumcraft 4.2.3.5a + addons) by
// scripts/extract-aspects.mjs. Do not edit by hand — re-run the extractor.
//
// Keys: established aspects keep Thaumcraft's english field names (air, wrath,
// time…); aspects introduced by addons are keyed by their latin tag (gloria…).
// TRANSLATE maps each key to its icon basename under aspects/color/<name>.png.

export const PRIMALS = [${primals.map((a) => `'${a.key}'`).join(', ')}] as const;

// compound -> [component1, component2]  (base Thaumcraft graph)
export const COMBINATIONS_4_2_2_0: Record<string, [string, string]> = {
${pairs(baseCompounds)}
};

export const ADDONS: Record<string, { name: string; aspects: string[]; combinations: Record<string, [string, string]> }> = {
${addonsTs}};

// english/latin key -> latin icon basename (aspects/color/<basename>.png)
export const TRANSLATE: Record<string, string> = {
${translate}
};
`;

  if (CHECK_ONLY) {
    log('(--check) raw.ts NOT written');
  } else {
    writeFileSync(RAW_OUT, ts);
    log(`wrote ${RAW_OUT}`);
  }
}

// ── Copy icons from the mods ────────────────────────────────────────────────
// Each aspect's texture is piped straight out of its source jar to
// aspects/color/<iconBase>.png — no third-party assets involved.
function copyIcons({ all }) {
  if (CHECK_ONLY) { log('(--check) icons NOT copied'); return; }
  rmSync(ICON_OUT, { recursive: true, force: true });
  mkdirSync(ICON_OUT, { recursive: true });
  for (const a of all.values()) {
    const dest = join(ICON_OUT, `${a.iconBase}.png`);
    sh(`unzip -p ${q(a.jar)} ${q(a.texPath)} > ${q(dest)}`);
    const sz = sh(`wc -c < ${q(dest)}`).trim();
    if (parseInt(sz, 10) <= 0) throw new Error(`empty texture for ${a.key} (${a.texPath} in ${a.jar})`);
  }
  log(`wrote ${all.size} icons → ${ICON_OUT}`);
}
const sanitize = (s) => s.replace(/[^A-Za-z0-9._-]/g, '_');

// ── Report ──────────────────────────────────────────────────────────────────
function report({ all }) {
  const groups = {};
  for (const a of all.values()) {
    const g = a.primal ? 'primal' : a.group || 'base';
    (groups[g] ??= []).push(a.key);
  }
  log('── summary ──');
  for (const [g, keys] of Object.entries(groups)) log(`  ${g.padEnd(8)} ${keys.length}`);
  log(`  TOTAL    ${all.size}`);
}

// ── main ────────────────────────────────────────────────────────────────────
ensureCfr();
const model = build();
report(model);
emitRaw(model);
copyIcons(model);
log('done.');
