# AGENTS.md — Đảo Đèn Lồng

3D game (Three.js + Vite), 3 nights, with a headless mode that follows **Test Contract v1.1** (spec: `docs/lab/ticket-02.md`; assumptions in `docs/notes/phase-N.md`).

## Commands
- Install: `npm install` · Windowed dev: `npm run dev` · Build: `npm run build`
- Tests (must be green before you say "done"): `npm test`
- Headless: `node headless.mjs --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl [--scenario f] [--inputs f]`
- Evidence for a phase: `npm run proof -- <phase>` (writes `docs/proof/phase-<N>/`)

## Layout
- `src/sim.js` — ALL game rules, in Ticket-02's 12-phase tick order (numbered comments). Pure JS: never import three, DOM or `Date`/`Math.random`.
- `src/maps.js` — the 3 standard maps (`tops(x,z)` = ground heights; walls = ledges > 0.25 m).
- `src/tuning.js` — every rule number (`TUNING` = contract keys, `RULES` = other Ticket-02 numbers). `game.contract.json` → `tuning` must equal it (test enforces).
- `src/main.js` + `src/view/` — window only: menu/pause/HUD/audio, input → `step()` at 60 Hz → draw. No rules here. Colors only from `src/view/palette.js` (standard palette, ±10%).
- Browser checks without rAF: `__advance(n, input)`, `__benchSync(n)`, `?night=N`, `?bench=1`.
- `headless.mjs` — CLI, file validation (malformed file → exit 2), JSONL writer.
- `tests/*.test.mjs` (`node:test`), `scenarios/*.json` sample scenario/inputs files.

## Rules
- Contract wording wins over guesses. Ambiguity → write the assumption in `docs/notes/phase-N.md` first.
- Determinism: seeded `makeRng`, integer tick timers, stable iteration order. Same args → byte-identical output.
- Never edit a test just to make it pass. Tick-count mistakes are common: write the arithmetic in a comment next to the assert. If a new ticket replaces a rule, change the test AND write why in the phase notes.
- One small commit per change; message says what and why.
- Log AI mistakes + token estimate in `docs/notes/ai-log.md`.
