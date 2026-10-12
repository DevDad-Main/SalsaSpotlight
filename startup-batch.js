const fs = require('node:fs');
const path = require('node:path');

// SalsaNOW runs this batch file at the start of every session if it exists.
const DEFAULT_DIRECTORY = 'I:\\Apps\\SalsaNOW';
const FILE_NAME = 'StartupBatch.bat';
const FAILURE_FILE_NAME = 'SalsaSpotlightFailures.txt';
const BACKUP_SUFFIX = '.salsaspotlight-backup';
const START_MARKER = 'REM >>> SalsaSpotlight (managed by SalsaSpotlight, remove with the setting)';
const END_MARKER = 'REM <<< SalsaSpotlight';
const MAX_FAILED_STARTS = 3;

function startupDirectory(env = process.env) {
  return env.SALSANOW_DIR || DEFAULT_DIRECTORY;
}

function defaultCounterPath(env = process.env) {
  return path.join(startupDirectory(env), FAILURE_FILE_NAME);
}

function lineEnding(text) {
  return /\n/.test(text) && !/\r\n/.test(text) ? '\n' : '\r\n';
}

function escapeLiteral(value) {
  return String(value).replace(/%/g, '%%');
}

function buildBlock(exePath, counterPath, eol) {
  return [
    START_MARKER,
    'setlocal',
    `set "SPL_EXE=${escapeLiteral(exePath)}"`,
    `set "SPL_COUNT=${escapeLiteral(counterPath)}"`,
    'if not exist "%SPL_EXE%" goto salsaspotlight_end',
    'set /a SPL_N=0',
    'if exist "%SPL_COUNT%" set /p SPL_N=<"%SPL_COUNT%"',
    `if %SPL_N% GEQ ${MAX_FAILED_STARTS} goto salsaspotlight_end`,
    'set /a SPL_N+=1',
    '2>nul >"%SPL_COUNT%" echo %SPL_N%',
    'start "" "%SPL_EXE%"',
    ':salsaspotlight_end',
    'endlocal',
    END_MARKER,
  ].join(eol);
}

function removeBlock(text) {
  const eol = lineEnding(text);
  const kept = [];
  let skipping = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === START_MARKER) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (line.trim() === END_MARKER) skipping = false;
      continue;
    }
    kept.push(line);
  }
  return kept.join(eol);
}

function hasBlock(text) {
  return text.split(/\r?\n/).some((line) => line.trim() === START_MARKER);
}

function applyStartupBlock(text, exePath, counterPath, enabled) {
  const eol = lineEnding(text);
  const cleaned = removeBlock(text).replace(/(\r?\n)+$/, '');
  if (!enabled) return cleaned ? `${cleaned}${eol}` : '';
  return `${cleaned || '@echo off'}${eol}${buildBlock(exePath, counterPath, eol)}${eol}`;
}

function readFailedStarts(counterPath) {
  if (!counterPath) return 0;
  try {
    const value = Number.parseInt(fs.readFileSync(counterPath, 'utf8'), 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function clearFailedStarts(counterPath) {
  if (!counterPath) return;
  try {
    fs.rmSync(counterPath, { force: true });
  } catch { /* safety net */ }
}

function getStartupStatus({ directory = startupDirectory(), file = path.join(directory, FILE_NAME), counterPath = defaultCounterPath() } = {}) {
  if (!fs.existsSync(directory)) return { available: false, enabled: false, paused: false, path: file };
  let enabled = false;
  try {
    enabled = hasBlock(fs.readFileSync(file, 'utf8'));
  } catch { /* no file yet */ }
  return { available: true, enabled, paused: enabled && readFailedStarts(counterPath) >= MAX_FAILED_STARTS, path: file };
}

function setStartupEnabled(enabled, exePath, { directory = startupDirectory(), file = path.join(directory, FILE_NAME), counterPath = defaultCounterPath() } = {}) {
  if (!fs.existsSync(directory)) return { ok: false, error: 'The SalsaNOW folder was not found, so this only works inside a SalsaNOW session.' };
  try {
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (existing && !fs.existsSync(file + BACKUP_SUFFIX)) fs.writeFileSync(file + BACKUP_SUFFIX, existing);
    const next = applyStartupBlock(existing, exePath, counterPath, enabled);
    if (next !== existing) fs.writeFileSync(file, next);
    clearFailedStarts(counterPath);
    return { ok: true, enabled };
  } catch (error) {
    return { ok: false, error: `Unable to update the startup batch file (${error.code || error.message}).` };
  }
}

module.exports = {
  FAILURE_FILE_NAME,
  MAX_FAILED_STARTS,
  applyStartupBlock,
  clearFailedStarts,
  defaultCounterPath,
  getStartupStatus,
  hasBlock,
  readFailedStarts,
  setStartupEnabled,
};
