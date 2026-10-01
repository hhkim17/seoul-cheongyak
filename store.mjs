import fs from 'node:fs';
import crypto from 'node:crypto';
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

// 파일명으로 쓸 수 없는 글자를 _ 로 바꾸기만 하면 한글 키가 통째로 뭉개진다.
// 실제로 enrich_HUG:20260930:강서구 와 …금천구 가 모두 enrich_HUG:20260930:___
// 가 되어 12개 자치구가 캐시 한 칸을 나눠 쓰고 서로의 주택 목록을 덮어썼다.
// 읽을 수 있게 앞부분은 남기되, 뒤에 원본 키의 해시를 붙여 충돌을 없앤다.
const safe = (k) => {
  const plain = String(k).replace(/[^a-zA-Z0-9_.:-]/g, '_');
  const sum = crypto.createHash('sha1').update(String(k)).digest('hex').slice(0, 10);
  return `${plain.slice(0, 60)}-${sum}`;
};

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
