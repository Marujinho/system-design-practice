import { catalogIn, type Catalog } from '@archsim/catalog';
import { currentLang, useLang } from './store';

/**
 * The catalog with its texts in the active language, for display (language-switch FR-6).
 * Numbers and ids are the bundled catalog's; the simulation keeps using that one.
 */
export function useCatalog(): Catalog {
  return catalogIn(useLang());
}

/** The same, outside React (labels of new nodes, warnings). */
export function catalogNow(): Catalog {
  return catalogIn(currentLang());
}
