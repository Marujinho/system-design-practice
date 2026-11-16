import { catalog, type Category, type Service } from '@archsim/catalog';
import type { Lang } from '../i18n/lang';
import { translate } from '../i18n/t';

const ORDER: readonly Category[] = [
  'entrada',
  'rede',
  'computacao',
  'dados',
  'cache',
  'mensageria',
  'busca',
  'observabilidade',
];

export function categoryLabel(category: Category, lang: Lang): string {
  return translate(lang, `category.${category}` as const);
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Services grouped by category, filtered by a case- and accent-insensitive query
 * over the label, the full name and the id (FR-3, study-mode FR-21).
 */
export function paletteGroups(
  query: string,
  services: readonly Service[] = catalog.services,
  lang: Lang = 'pt',
) {
  const q = fold(query.trim());
  const text = (s: Service) => fold(`${s.label} ${s.fullName ?? ''} ${s.id}`);
  return ORDER.map((category) => ({
    category,
    label: categoryLabel(category, lang),
    services: services.filter((s) => s.category === category && (q === '' || text(s).includes(q))),
  })).filter((g) => g.services.length > 0);
}

export const DRAG_TYPE = 'application/x-archsim-service';
