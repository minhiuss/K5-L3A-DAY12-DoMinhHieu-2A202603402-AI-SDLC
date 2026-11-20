# AGENTS.md — Đảo Đèn Lồng

3D game (Three.js + Vite) with a headless mode that follows **Test Contract v1.0** (spec: lab board; notes in `docs/notes/`).

## Commands
- Install: `npm install` · Windowed dev: `npm run dev` · Build: `npm run build`
- Tests (must be green before you say "done"): `npm test`
- Headless: `node headless.mjs --seed 1 --night 1 --ticks 600 --out out.jsonl [--scenario f] [--inputs f]`
- Evidence for a phase: `npm run proof -- <phase>` (writes `docs/proof/phase-<N>/`)

## Layout
- `src/sim.js` — ALL game rules. Pure JS: never import three, DOM or `Date`/`Math.random`.
- `src/tuning.js` — every rule number. `game.contract.json` → `tuning` must equal it (test enforces).
- `src/main.js` — window only: input → `step()` at 60 Hz → draw. No rules here.
- `headless.mjs` — CLI, file validation (malformed file → exit 2), JSONL writer.
- `tests/*.test.mjs` (`node:test`), `scenarios/*.json` sample scenario/inputs files.

## Rules
- Contract wording wins over guesses. Ambiguity → write the assumption in `docs/notes/phase-N.md` first.
- Determinism: seeded `makeRng`, integer tick timers, stable iteration order. Same args → byte-identical output.
- Never edit a test just to make it pass. If a new ticket replaces a rule, change the test AND write why in the phase notes.
- One small commit per change; message says what and why.
- Log AI mistakes + token estimate in `docs/notes/ai-log.md`.
