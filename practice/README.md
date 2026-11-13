# practice/

Your attempts live here, and only here. Git ignores the JSON files.

- `session.json` — the attempt you last finalized with **Finalizar e pontuar**: the problem, your
  diagram, the simulation, the score and the findings. Your agent reads this file (see `AGENTS.md`).
- `history.json` — every attempt with its score, so the app can show your record and stars.

The app writes these files through its local server (`pnpm dev` or `pnpm preview`), only from
its own page, and never anywhere else on disk. Delete them to start over.
