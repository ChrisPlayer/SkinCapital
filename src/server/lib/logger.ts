import fs from 'fs';
import path from 'path';
import util from 'util';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

// Optional file tee (LOG_FILE env, set by the Windows pack bootstrap): the
// console stays the primary output, but every line is also appended to disk so
// a crash that closes the console window still leaves something to read.
// Synchronous writes on a kept-open fd: no line lost on a hard crash, and the
// log volume here is far too low for the sync cost to matter.
const ROTATE_BYTES = 5 * 1024 * 1024;
let logFd: number | null = null;
if (process.env.LOG_FILE) {
  try {
    const file = path.resolve(process.env.LOG_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      // One-shot rotation at boot, keeping a single previous file.
      if (fs.existsSync(file) && fs.statSync(file).size > ROTATE_BYTES) {
        fs.renameSync(file, `${file}.old`);
      }
    } catch {
      // rotation is best-effort
    }
    logFd = fs.openSync(file, 'a');
  } catch {
    logFd = null; // file logging is optional, never block startup on it
  }
}

function log(level: LogLevel, ...args: unknown[]) {
  if (LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    if (level === 'error') {
      console.error(prefix, ...args);
    } else if (level === 'warn') {
      console.warn(prefix, ...args);
    } else {
      console.log(prefix, ...args);
    }
    if (logFd !== null) {
      try {
        fs.writeSync(logFd, util.format(prefix, ...args) + '\n');
      } catch {
        // disk full / fd gone: keep the console alive
      }
    }
  }
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
};
