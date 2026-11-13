import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// Vitest 5 types matchers on `Matchers<R, T>`; jest-dom 7 still augments the old `Assertion<T>`.
declare module 'vitest' {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<T, R> {}
}
