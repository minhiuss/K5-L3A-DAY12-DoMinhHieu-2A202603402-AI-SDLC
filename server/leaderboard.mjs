// Local leaderboard (Ticket-04 §3): top 10, score desc, ties -> earlier achieved_at first.
// Stored as JSON on local disk (data/leaderboard.json by default). Pure Node, no dependencies.
import fs from 'node:fs';
import path from 'node:path';

export const MAX_ENTRIES = 10;
// 3-12 characters: letters (Vietnamese with accents allowed), digits, underscore
const NAME_RE = /^[\p{L}\p{M}\p{N}_]+$/u;

export function validateName(raw) {
  if (typeof raw !== 'string') return 'Tên phải là chữ';
  const name = raw.normalize('NFC').trim();
  const len = [...name].length;
  if (len < 3 || len > 12) return 'Tên dài 3–12 ký tự';
  if (!NAME_RE.test(name)) return 'Chỉ dùng chữ, số và _';
  return null;
}

export function validateEntry(e) {
  if (!e || typeof e !== 'object') return 'entry must be an object';
  const nameErr = validateName(e.name);
  if (nameErr) return nameErr;
  if (!Number.isInteger(e.score) || e.score < 0) return 'score must be an integer >= 0';
  if (!Number.isInteger(e.nights_won) || e.nights_won < 0 || e.nights_won > 3) return 'nights_won must be 0..3';
  if (typeof e.achieved_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/.test(e.achieved_at) || Number.isNaN(Date.parse(e.achieved_at))) {
    return 'achieved_at must be ISO 8601 with a time zone';
  }
  if (!Number.isInteger(e.seed)) return 'seed must be an integer';
  return null;
}

export function sortEntries(entries) {
  return [...entries]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || Date.parse(a.e.achieved_at) - Date.parse(b.e.achieved_at) || a.i - b.i)
    .map(({ e }) => e)
    .slice(0, MAX_ENTRIES);
}

export function insertEntry(entries, entry) {
  const err = validateEntry(entry);
  if (err) throw new Error(err);
  const clean = {
    name: entry.name.normalize('NFC').trim(), score: entry.score, nights_won: entry.nights_won,
    achieved_at: entry.achieved_at, seed: entry.seed,
  };
  return sortEntries([...entries, clean]);
}

export const defaultFile = (root) => path.join(root, 'data', 'leaderboard.json');

export function load(file) {
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    return sortEntries((doc.entries || []).filter((e) => !validateEntry(e)));
  } catch {
    return [];
  }
}

export function save(file, entries) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ entries }, null, 2) + '\n');
  fs.renameSync(tmp, file); // atomic replace: a crash never leaves half a file
}

// Shared HTTP handler for GET/POST /api/leaderboard (used by serve.mjs and the Vite dev server).
export function handleApi(file, req, res) {
  const send = (code, body) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET') return send(200, { entries: load(file) });
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      try {
        const entries = insertEntry(load(file), JSON.parse(body));
        save(file, entries);
        send(200, { entries });
      } catch (e) {
        send(400, { error: e.message });
      }
    });
    return undefined;
  }
  return send(405, { error: 'method not allowed' });
}
