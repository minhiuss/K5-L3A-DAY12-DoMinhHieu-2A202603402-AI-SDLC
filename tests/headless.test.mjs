// Contract tests for headless.mjs (Test Contract v1.1): output shape, tick model, determinism, exit codes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-'));
const SCN = path.join(ROOT, 'scenarios');

function headless(args) {
  const out = path.join(TMP, `out-${Math.random().toString(36).slice(2)}.jsonl`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'headless.mjs'), ...args, '--out', out], { encoding: 'utf8' });
  const text = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  return { code: r.status, stderr: r.stderr, text, lines: text.trim() ? text.trim().split('\n').map((l) => JSON.parse(l)) : [] };
}
const write = (name, obj) => {
  const f = path.join(TMP, name);
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return f;
};

test('R12 snapshot at tick 0 and every N ticks, end line last', () => {
  const r = headless(['--seed', '3', '--night', '1', '--ticks', '25', '--snapshot-every', '10']);
  assert.equal(r.code, 0);
  const snaps = r.lines.filter((l) => l.type === 'snapshot').map((l) => l.tick);
  assert.deepEqual(snaps, [0, 10, 20]);
  assert.deepEqual(r.lines.at(-1), { type: 'end', ticks: 25, state: 'playing', score: 0 });
  const s0 = r.lines[0];
  // v1.1 player fields (Phase 1 checked only pos/flames/carried)
  assert.deepEqual(s0.player, { pos: [0, 0, 0], vel: [0, 0, 0], grounded: true, flames: 3, carried: 0, invuln: false, dash_cd_s: 0, pulse_cd_s: 0, charm_s: 0 });
  assert.equal(s0.time_left_s, 300);
  assert.equal(s0.night, 1);
  assert.deepEqual(s0.wind, { active: false, dir_deg: null });
  for (const k of ['motes', 'drifters', 'charms', 'shades', 'lanterns']) assert.ok(Array.isArray(s0[k]), k);
  assert.deepEqual(Object.keys(s0.motes[0]), ['id', 'pos', 'kind', 'ttl_s']);
  assert.deepEqual(r.lines[1], { type: 'event', tick: 0, name: 'night_start', data: { night: 1 } });
});

test('R12b example inputs file: walk to a mote, event stamped k+1, held fields persist', () => {
  const r = headless(['--seed', '1', '--night', '1', '--scenario', path.join(SCN, 'pickup.json'),
    '--inputs', path.join(SCN, 'walk_forward.json'), '--ticks', '60']);
  assert.equal(r.code, 0, r.stderr);
  const picked = r.lines.find((l) => l.name === 'mote_picked');
  // mote at z=5, pickup_radius 1 -> need z >= 4 -> 4 / (6/60) = 40 steps -> tick 40
  assert.equal(picked.tick, 40);
  const last = r.lines.filter((l) => l.type === 'snapshot').at(-1);
  assert.equal(last.player.pos[2], 6);
});

test('R6 scripted full win scenario ends early with state won', () => {
  const r = headless(['--seed', '1', '--night', '1', '--scenario', path.join(SCN, 'win_one_left.json'),
    '--inputs', path.join(SCN, 'interact_once.json'), '--ticks', '600']);
  assert.equal(r.code, 0, r.stderr);
  const end = r.lines.at(-1);
  assert.equal(end.state, 'won');
  assert.ok(end.ticks < 600);
  assert.equal(r.lines.at(-2).type === 'snapshot' || r.lines.at(-2).name === 'game_over', true);
  assert.ok(r.lines.some((l) => l.name === 'game_over' && l.data.reason === 'all_lit'));
});

test('R13 same seed + scenario + inputs -> byte-identical output', () => {
  const args = ['--seed', '42', '--night', '1', '--inputs', path.join(SCN, 'walk_forward.json'), '--ticks', '3000'];
  const a = headless(args), b = headless(args);
  assert.equal(a.code, 0);
  assert.ok(a.text.length > 0);
  assert.equal(a.text, b.text);
  const c = headless(['--seed', '43', ...args.slice(2)]);
  assert.notEqual(a.text, c.text, 'different seed should change the world');
});

test('R14 malformed inputs/scenario files exit 2 with a stderr message', () => {
  const cases = [
    ['--inputs', write('bad.json', '{not json')],
    ['--inputs', write('dup.json', { frames: [{ tick: 5 }, { tick: 5 }] })],
    ['--inputs', write('range.json', { frames: [{ tick: 0, move: [2, 0] }] })],
    ['--inputs', write('bool.json', { frames: [{ tick: 0, pulse: 1 }] })],
    ['--scenario', write('lan.json', { lanterns: [{ id: 'L7' }] })],
    ['--scenario', write('arr.json', [1, 2])],
    ['--scenario', path.join(TMP, 'missing.json')],
    ['--scenario', write('state.json', { shades: [{ pos: [1, 1, 1], state: 'sleeping' }] })],
    ['--inputs', write('dash.json', { frames: [{ tick: 0, dash: 'yes' }] })],
  ];
  for (const extra of cases) {
    const r = headless(['--seed', '1', '--night', '1', '--ticks', '10', ...extra]);
    assert.equal(r.code, 2, `expected exit 2 for ${extra[1]}`);
    assert.ok(r.stderr.length > 0);
  }
});

test('bad command line exits non-zero', () => {
  assert.equal(headless(['--night', '1', '--ticks', '10']).code, 1);
  assert.equal(headless(['--seed', '1', '--night', '4', '--ticks', '10']).code, 1);
});

test('P12 nights 2 and 3 run headless with v1.1 snapshots', () => {
  for (const night of ['2', '3']) {
    const r = headless(['--seed', '9', '--night', night, '--ticks', '1300', '--snapshot-every', '100']);
    assert.equal(r.code, 0, r.stderr);
    const s = r.lines.filter((l) => l.type === 'snapshot').at(-1);
    assert.equal(s.night, Number(night));
    assert.ok(s.drifters.length >= 1, 'a drifter spawned at tick 1200');
    assert.ok(s.charms.length >= 1);
  }
});

test('P8 headless pause: tick keeps counting, sim_tick stops, state paused', () => {
  const r = headless(['--seed', '1', '--night', '1', '--ticks', '30', '--inputs', write('pause.json', { frames: [{ tick: 10, pause: true }, { tick: 11, pause: false }] })]);
  const s = r.lines.filter((l) => l.type === 'snapshot').at(-1);
  assert.equal(s.tick, 30);
  assert.equal(s.sim_tick, 10);
  assert.equal(s.state, 'paused');
  assert.equal(r.lines.at(-1).state, 'paused');
});

test('P13 a full night (21600 ticks) runs in <= 30 s', () => {
  for (const night of ['1', '2', '3']) {
    const t0 = performance.now();
    const r = headless(['--seed', '3', '--night', night, '--ticks', '21600', '--snapshot-every', '1']);
    const ms = performance.now() - t0;
    assert.equal(r.code, 0);
    assert.ok(ms < 30000, `night ${night} took ${ms} ms`);
  }
});
