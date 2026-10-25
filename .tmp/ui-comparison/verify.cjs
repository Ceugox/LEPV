const cp = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const env = { ...process.env, PORT: '4201', LEPV_BASE: 'http://127.0.0.1:4201' };
const fixture = cp.spawnSync('node', ['scripts/ci-fixtures.js', 'events', env.LEPV_BASE], { cwd: root, env, windowsHide: true, encoding: 'utf8' });
if (fixture.status) { console.error(fixture.stderr); process.exit(1); }
for (const line of fixture.stdout.split(/\r?\n/)) {
  const match = line.match(/^(LEPV_[A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2];
}
const result = cp.spawnSync('cmd.exe', ['/c', 'npm run verify'], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
process.exitCode = result.status;
