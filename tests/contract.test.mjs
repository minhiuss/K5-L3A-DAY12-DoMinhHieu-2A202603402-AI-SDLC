// R15: game.contract.json must declare the values the game really uses (v1.1 standard numbers).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TUNING } from '../src/tuning.js';

const contract = JSON.parse(fs.readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));

test('R15 contract header fields present', () => {
  assert.equal(contract.contract_version, '1.1');
  for (const k of ['team', 'build_cmd', 'run_cmd', 'headless_cmd']) assert.equal(typeof contract[k], 'string', k);
  assert.match(contract.team, /^[0-9A-Za-z]+-[a-z-]+$/);
});

test('R15 contract tuning equals src/tuning.js', () => {
  assert.deepEqual(contract.tuning, TUNING);
});

test('R15 v1.1 tuning has the Ticket-02 standard values', () => {
  const t = contract.tuning;
  assert.deepEqual([t.carry_capacity, t.lantern_cost, t.interact_radius, t.pulse_cost, t.pulse_radius, t.pulse_cooldown_s, t.safe_radius, t.shade_speed],
    [10, 10, 2, 3, 5, 3, 6, 4]);
  assert.deepEqual([t.dash_speed, t.dash_duration_s, t.dash_cooldown_s, t.night2_duration_s, t.night3_duration_s], [14, 0.2, 1.5, 330, 360]);
  assert.deepEqual(t.score, { per_mote: 10, per_lantern: 100, per_stun: 5, per_second_left: 2, per_flame_left: 50 });
  assert.equal(t.fall_enabled, true);
});
