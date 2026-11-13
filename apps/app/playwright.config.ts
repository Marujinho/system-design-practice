import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Attempts written by the e2e suite go to a throwaway directory, never to practice/. */
const practice = process.env.ARCHSIM_PRACTICE_DIR ?? mkdtempSync(join(tmpdir(), 'archsim-e2e-'));
// Test workers re-read this config: pin the directory so they all see the server's.
process.env.ARCHSIM_PRACTICE_DIR = practice;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
      grepInvert: /@perf/,
    },
  ],
  webServer: {
    // --mode test keeps the worker-crash hook; everything else is the production build.
    command: 'vite build --configLoader runner --mode test && vite preview --configLoader runner',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ARCHSIM_PRACTICE_DIR: practice },
  },
});
