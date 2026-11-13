import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useSim } from './sim/sim-store';
import './theme/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root não encontrado');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// e2e only: lets the test suite force a worker failure (NFR-5). Absent from normal builds.
if (import.meta.env.MODE === 'test') {
  Object.assign(window, {
    __archsimForceWorkerError: () => {
      useSim.getState().backend?.crash();
    },
  });
}
