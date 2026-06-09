/*
 * SkinCapital portable launcher (Windows).
 * Run by the bundled Node via SkinCapital.vbs (hidden window):
 *  1. first run: generates a unique SESSION_SECRET in .env
 *  2. if the server already runs: just (re)opens the browser
 *  3. otherwise: starts the server detached (logs in data/server.log,
 *     PID in data/server.pid), waits until it answers, opens the browser.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const APP = __dirname; // <pack>/app
const NODE = path.join(APP, '..', 'node', 'node.exe');
const DATA = path.join(APP, 'data');
fs.mkdirSync(DATA, { recursive: true });

// First run: replace the placeholder with a real random secret (kept local).
const envPath = path.join(APP, '.env');
let envText = fs.readFileSync(envPath, 'utf8');
if (envText.includes('__GENERATE__')) {
  envText = envText.replace('__GENERATE__', crypto.randomBytes(32).toString('hex'));
  fs.writeFileSync(envPath, envText);
}

const port = (envText.match(/^PORT=(\d+)/m) || [null, '3000'])[1];
const url = `http://127.0.0.1:${port}`;

function ping(cb) {
  const req = http.get(`${url}/api/profiles`, { timeout: 1500 }, (res) => {
    res.resume();
    cb(res.statusCode > 0);
  });
  req.on('error', () => cb(false));
  req.on('timeout', () => { req.destroy(); cb(false); });
}

function openBrowser() {
  spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

ping((alreadyUp) => {
  if (alreadyUp) {
    // Server already running (double-clicked again): just open the site.
    openBrowser();
    process.exit(0);
  }

  const log = fs.openSync(path.join(DATA, 'server.log'), 'a');
  const child = spawn(NODE, ['--import', 'tsx', 'src/server/index.ts'], {
    cwd: APP,
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  fs.writeFileSync(path.join(DATA, 'server.pid'), String(child.pid));
  child.unref();

  // Wait for the server (up to 60s), then open the browser.
  let tries = 0;
  const timer = setInterval(() => {
    ping((up) => {
      if (up) {
        clearInterval(timer);
        openBrowser();
        process.exit(0);
      }
      if (++tries >= 120) {
        clearInterval(timer);
        openBrowser(); // open anyway so the user at least sees something
        process.exit(1);
      }
    });
  }, 500);
});
