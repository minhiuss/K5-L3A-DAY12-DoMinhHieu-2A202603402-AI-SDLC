// Claude Code Stop hook: run the test suite; exit 2 (blocks the agent from stopping)
// with the failing output on stderr if anything is red. Cross-platform (Node only).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync(process.execPath, ['--test', 'tests/'], { cwd: root, encoding: 'utf8' });
if (r.status !== 0) {
  const tail = (r.stdout + r.stderr).split('\n').filter((l) => /✖|not ok|Error|expected|actual/.test(l)).slice(0, 30).join('\n');
  process.stderr.write(`Tests are red. Fix them before finishing (do not weaken tests).\n${tail}\n`);
  process.exit(2);
}
process.exit(0);
