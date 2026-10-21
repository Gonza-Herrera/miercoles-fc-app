const DEFAULT_ICON = '🍽️';

// Match whole words, so "pan" does not also match "panadería".
const ICON_WORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['🥖', ['pan', 'panes', 'pancitos', 'panecillos', 'baguette']],
  ['🥩', ['carne', 'carnes', 'asado', 'vacio', 'costilla', 'costillas', 'achuras', 'bondiola']],
  ['🐷', ['cerdo', 'cerdos']],
  ['🐔', ['pollo', 'pollos', 'alitas']],
  ['🐟', ['pescado', 'pescados', 'atun', 'merluza']],
  ['🌭', ['chorizo', 'chorizos', 'choripan', 'choripanes', 'salchicha', 'salchichas']],
  ['🥬', ['verdura', 'verduras', 'vegetales', 'lechuga']],
  ['🥗', ['ensalada', 'ensaladas']],
  ['🍅', ['tomate', 'tomates']],
  ['🥔', ['papa', 'papas', 'patata', 'patatas']],
  ['🧅', ['cebolla', 'cebollas']],
  ['🍔', ['hamburguesa', 'hamburguesas']],
  ['🍕', ['pizza', 'pizzas']],
  ['🥟', ['empanada', 'empanadas']],
  ['🎂', ['torta', 'tortas']],
  ['🥧', ['tarta', 'tartas']],
  ['🕯️', ['velita', 'velitas']],
  ['🍝', ['pasta', 'pastas', 'fideos', 'ravioles', 'tallarines', 'noquis']],
  ['🧀', ['queso', 'quesos']],
  ['🥚', ['huevo', 'huevos']],
  ['🥤', ['bebida', 'bebidas', 'gaseosa', 'gaseosas', 'jugo', 'jugos']],
  ['💧', ['agua', 'aguas']],
  ['🍺', ['cerveza', 'cervezas', 'birra', 'birras']],
  ['🍷', ['vino', 'vinos']],
  ['🧊', ['hielo', 'hielos']],
  ['🔥', ['carbon', 'lena']],
  ['🧂', ['sal', 'condimento', 'condimentos']],
  ['🍦', ['helado', 'helados']],
  ['🥧', ['postre', 'postres']],
  ['🧻', ['servilleta', 'servilletas', 'rollo', 'rollos']]
];

const ICON_BY_WORD = new Map(ICON_WORDS.flatMap(([icon, words]) =>
  words.map(word => [word, icon] as const)
));

export function getDinnerItemIcon(name: string, existingIcon?: string): string {
  // Reserved words take precedence so existing items reflect updated mappings.
  const words = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().split(/[^a-z0-9]+/);
  for (const word of words) {
    const icon = ICON_BY_WORD.get(word);
    if (icon) return icon;
  }
  return existingIcon || DEFAULT_ICON;
}
