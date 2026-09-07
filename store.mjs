import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(ROOT, 'cache');
const CONFIG = path.join(ROOT, 'config.json');

fs.mkdirSync(CACHE, { recursive: true });

export const paths = { ROOT, CACHE, CONFIG };

export function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; }
}

export function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.writeFileSync(CONFIG, JSON.stringify(next, null, 2));
  return next;
}

/** 환경변수 > config.json 순으로 인증키를 찾는다 */
export function getServiceKey() {
  return process.env.APPLYHOME_SERVICE_KEY || readConfig().serviceKey || null;
}

const safe = (k) => k.replace(/[^a-zA-Z0-9_.:-]/g, '_');

export function cacheGet(key, maxAgeMs) {
  const f = path.join(CACHE, `${safe(key)}.json`);
  try {
    const stat = fs.statSync(f);
    if (maxAgeMs != null && Date.now() - stat.mtimeMs > maxAgeMs) return null;
    return { value: JSON.parse(fs.readFileSync(f, 'utf8')), savedAt: stat.mtimeMs };
  } catch { return null; }
}

export function cacheSet(key, value) {
  fs.writeFileSync(path.join(CACHE, `${safe(key)}.json`), JSON.stringify(value));
  return value;
}

export function cacheDelete(key) {
  try { fs.unlinkSync(path.join(CACHE, `${safe(key)}.json`)); } catch { /* 없으면 그만 */ }
}

export function cacheClear() {
  for (const f of fs.readdirSync(CACHE)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(CACHE, f));
  }
}
