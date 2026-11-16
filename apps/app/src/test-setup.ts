import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, beforeEach, expect } from 'vitest';
import { useLangStore } from './i18n/store';

expect.extend(matchers);
// jsdom reports en-US; the suites read the Portuguese texts, so tests start in Portuguese.
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'language', { value: 'pt-BR', configurable: true });
}
beforeEach(() => {
  useLangStore.setState({ lang: 'pt' });
});
// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
});
