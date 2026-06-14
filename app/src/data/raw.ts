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
