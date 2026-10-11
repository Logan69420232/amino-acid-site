const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/pwa/install.js'), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf(' function detectInstallDevice'), source.indexOf(' const actualDevice')), context);
vm.runInContext(source.slice(source.indexOf(' function shouldPromptInstall'), source.indexOf(' let sessionLastShown')), context);

test('installation instructions distinguish Apple phones, both iPad modes, Android and desktops', () => {
  const cases = [
    [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }, 'iphone'],
    [{ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)' }, 'android'],
    [{ userAgent: '', userAgentData: { platform: 'Android' } }, 'android'],
    [{ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0)' }, 'ipad'],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }, 'ipad'],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 0 }, 'desktop'],
    [{ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 10 }, 'desktop'],
    [{}, 'desktop']
  ];
  for (const [nav, expected] of cases) assert.equal(context.detectInstallDevice(nav), expected);
});

test('automatic install reminders require a signed-in diary and an uninstalled app', () => {
  const base = { signedIn: true, diary: true, installed: false, lastShown: 0, now: 1800000000000 };
  assert.equal(context.shouldPromptInstall(base), true);
  for (const state of [{ signedIn: false }, { diary: false }, { installed: true }]) {
    assert.equal(context.shouldPromptInstall({ ...base, ...state }), false);
  }
});

test('install reminders remain quiet for seven days and tolerate future timestamps', () => {
  const now = 1800000000000, week = 7 * 86400000;
  const base = { signedIn: true, diary: true, installed: false, now };
  assert.equal(context.shouldPromptInstall({ ...base, lastShown: now }), false);
  assert.equal(context.shouldPromptInstall({ ...base, lastShown: now - week + 1 }), false);
  assert.equal(context.shouldPromptInstall({ ...base, lastShown: now - week }), true);
  assert.equal(context.shouldPromptInstall({ ...base, lastShown: now + 1000 }), false);
});

test('the install manifest opens the real diary and supplies correctly sized PNG icons', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/pwa/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Aminodata');
  assert.equal(manifest.start_url, '/?view=diary');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}`);
    assert.ok(icon);
    const data = fs.readFileSync(path.join(root, icon.src));
    assert.equal(data.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }
});


test('Apple installation recognises Safari and Chrome without mistaking embedded browsers for Safari', () => {
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  assert.equal(context.detectAppleInstallBrowser({ userAgent: safari }), 'safari');
  assert.equal(context.detectAppleInstallBrowser({ userAgent: safari.replace('Version/18.0', 'CriOS/130.0') }), 'chrome');
  for (const marker of ['FxiOS/130.0', 'EdgiOS/130.0', 'OPiOS/1.0', 'GSA/1.0']) {
    assert.equal(context.detectAppleInstallBrowser({ userAgent: safari + ' ' + marker }), 'other');
  }
  for (const marker of ['Instagram', '[FBAN/FBIOS;FBAV/1.0]', 'Line/14.0', 'TikTok']) {
    assert.equal(context.detectAppleInstallBrowser({ userAgent: safari + ' ' + marker }), 'embedded');
  }
  assert.equal(context.detectAppleInstallBrowser({ userAgent: safari.replace('Version/18.0', '') }), 'embedded');
  assert.equal(context.detectAppleInstallBrowser({}), 'embedded');
});
