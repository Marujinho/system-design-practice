import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { cspDev, cspProduction } from './csp';
import { practicePlugin } from './vite-plugin-practice';

export const HOST = '127.0.0.1';
export const DEV_PORT = 5173;
export const PREVIEW_PORT = 4173;

const security = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

export default defineConfig({
  plugins: [react(), practicePlugin()],
  server: {
    host: HOST,
    port: DEV_PORT,
    strictPort: true,
    headers: { ...security, 'Content-Security-Policy': cspDev(DEV_PORT) },
    // The app never needs these: keep the solutions and the attempts off /@fs (A06).
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem}',
        '**/.git/**',
        '**/reference.archsim.json',
        '**/practice/**',
      ],
    },
    cors: false,
  },
  preview: {
    host: HOST,
    port: PREVIEW_PORT,
    strictPort: true,
    headers: { ...security, 'Content-Security-Policy': cspProduction() },
  },
  build: { sourcemap: false },
  worker: { format: 'es' },
});
