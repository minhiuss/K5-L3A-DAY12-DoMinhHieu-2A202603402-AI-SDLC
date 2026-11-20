---
name: verify
description: Run the full verification for the current phase and save evidence into docs/proof/phase-N/ (test report, determinism hashes, exit-code checks, sample headless runs, machine info). Use before tagging a phase or when asked for proof/evidence.
---

1. `npm test` — must be green. If red, fix the code (never weaken a test without writing the reason in `docs/notes/phase-N.md`).
2. `npm run proof -- <N>` — writes `docs/proof/phase-<N>/`:
   - `test-report.txt` (full `node --test` output)
   - `determinism.txt` (same args run twice → sha256 must match)
   - `exit-codes.txt` (malformed file → 2)
   - `run-*.jsonl` (sample headless outputs from `scenarios/`)
   - `machine.txt` (OS, CPU, Node version)
3. For things only visible in the window (HUD, lighting, win/lose screens): run `npm run dev`, take screenshots, save as `docs/proof/phase-<N>/NN-what.jpg`.
4. Update the evidence table in `docs/proof/phase-<N>.md`: requirement | how checked | evidence file | result. Write "chưa đạt" + reason for anything failing.
5. Before tagging, do a quick mutation check: break one rule in `src/sim.js` on purpose, confirm `npm test` goes red, revert. Note it in `mutation-check.txt`.
