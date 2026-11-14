import { catalog, type Category, type Service } from '@archsim/catalog';

export const CATEGORY_LABEL: Record<Category, string> = {
  entrada: 'Entrada',
  rede: 'Rede e borda',
  computacao: 'Computação',
  dados: 'Dados',
  cache: 'Cache',
  mensageria: 'Mensageria',
  busca: 'Busca',
  observabilidade: 'Observabilidade',
};

const ORDER = Object.keys(CATEGORY_LABEL) as Category[];

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Services grouped by category, filtered by a case- and accent-insensitive query
 * over the label, the full name and the id (FR-3, study-mode FR-21).
 */
export function paletteGroups(query: string, services: readonly Service[] = catalog.services) {
  const q = fold(query.trim());
  const text = (s: Service) => fold(`${s.label} ${s.fullName ?? ''} ${s.id}`);
  return ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    services: services.filter((s) => s.category === category && (q === '' || text(s).includes(q))),
  })).filter((g) => g.services.length > 0);
}

export const DRAG_TYPE = 'application/x-archsim-service';
