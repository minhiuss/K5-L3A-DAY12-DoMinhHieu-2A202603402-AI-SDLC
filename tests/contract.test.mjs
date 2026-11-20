// R15: game.contract.json must declare the values the game really uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TUNING } from '../src/tuning.js';

const contract = JSON.parse(fs.readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));

test('R15 contract header fields present', () => {
  assert.equal(contract.contract_version, '1.0');
  for (const k of ['team', 'build_cmd', 'run_cmd', 'headless_cmd']) assert.equal(typeof contract[k], 'string', k);
  assert.match(contract.team, /^[0-9A-Za-z]+-[a-z-]+$/);
});

test('R15 contract tuning equals src/tuning.js', () => {
  assert.deepEqual(contract.tuning, TUNING);
});
