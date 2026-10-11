// Runs in a worker thread: crawls the PC and streams [name, path, kind] batches (kind 0=file, 1=folder, 2=app).
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', 'appdata', '$recycle.bin', 'system volume information', 'windows', 'program files',
  'program files (x86)', 'programdata', '__pycache__', 'site-packages', 'venv', 'recovery', 'onedrivetemp',
  'application data', 'local settings', 'cookies', 'nethood', 'printhood', 'recent', 'sendto', 'start menu', 'templates',
]);
const SKIP_EXT = new Set(['.dll', '.tmp', '.sys', '.ini', '.dat', '.log', '.pyc', '.map', '.lnk', '.pf', '.db', '.lock']);

let batch = [];
const flush = () => { if (batch.length) { parentPort.postMessage({ batch }); batch = []; } };
const add = (n, p, k) => { batch.push([n, p, k]); if (batch.length >= 4000) flush(); };

async function walk(root, maxDepth, apps) {
  const stack = [[root, 0]];
  let active = 0;
  const worker = async () => {
    for (;;) {
      const job = stack.pop();
      if (!job) {
        if (active === 0) return;
        await new Promise((r) => setTimeout(r, 4));
        continue;
      }
      active++;
      try {
        const [dir, depth] = job;
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const name = e.name;
          const full = path.join(dir, name);
          if (e.isDirectory()) {
            if (apps) { stack.push([full, depth + 1]); continue; }
            if (name.startsWith('.') || name.startsWith('$') || SKIP_DIRS.has(name.toLowerCase())) continue;
            add(name, full, 1);
            if (depth < maxDepth) stack.push([full, depth + 1]);
          } else if (e.isFile()) {
            const ext = path.extname(name).toLowerCase();
            if (apps) {
              if (ext === '.lnk' || ext === '.exe') add(name.slice(0, -ext.length), full, 2);
            } else if (!name.startsWith('.') && !SKIP_EXT.has(ext)) {
              add(name, full, 0);
            }
          }
        }
      } catch { /* unreadable folder */ }
      active--;
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
}

(async () => {
  const { home, appdata, programData } = workerData;
  const startMenus = [
    programData && path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    appdata && path.join(appdata, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter(Boolean);
  for (const d of startMenus) await walk(d, 6, true);
  flush();

  await walk(home, 8, false);
  flush();

  for (let c = 68; c <= 90; c++) {
    const drive = String.fromCharCode(c) + ':\\';
    if (fs.existsSync(drive)) await walk(drive, 6, false);
  }
  flush();
  parentPort.postMessage({ done: true });
})();
