#!/usr/bin/env node
// 파일이 바뀌면 알아서 커밋하고 GitHub에 올린다.
// 실행: node autosync.mjs   (start.sh가 서버와 함께 띄운다)

import { watch } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEBOUNCE_MS = Number(process.env.AUTOSYNC_DEBOUNCE_MS || 8000);
const IGNORE = [/(^|\/)\.git(\/|$)/, /(^|\/)cache(\/|$)/, /(^|\/)node_modules(\/|$)/, /(^|\/)config\.json$/, /\.DS_Store$/, /(^|\/)\.env$/, /~$/, /\.swp$/];

const log = (...a) => console.log(`[autosync ${new Date().toTimeString().slice(0, 8)}]`, ...a);
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** 인증키 등 비밀값이 스테이징에 섞였는지 확인한다 */
function stagedLooksSafe() {
  const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
  const forbidden = staged.filter((f) => /(^|\/)(config\.json|\.env)$|\.pem$|(^|\/)id_rsa/.test(f));
  if (forbidden.length) { log('중단 — 비밀 파일이 스테이징됨:', forbidden.join(', ')); return false; }

  let secret = null;
  try { secret = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).serviceKey; } catch { /* 키 파일 없음 */ }
  if (secret && secret.length > 12 && git('diff', '--cached').includes(secret)) {
    log('중단 — 커밋 내용에 인증키가 들어 있습니다.');
    return false;
  }
  return true;
}

let timer = null;
let syncing = false;

async function sync() {
  if (syncing) return;
  syncing = true;
  try {
    if (!git('status', '--porcelain')) { syncing = false; return; }

    // 공고 데이터(docs/data)는 GitHub Actions가 30분마다 새로 만든다.
    // 여기서도 올리면 같은 파일을 양쪽에서 고쳐 매번 충돌이 난다 — 코드만 올린다.
    git('add', '-A', '--', '.', ':!docs/data');
    if (!git('diff', '--cached', '--name-only')) { syncing = false; return; }
    if (!stagedLooksSafe()) { git('reset'); syncing = false; return; }

    let files = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);

    // 화면 코드를 고쳤으면 docs/ 에도 반영해야 사이트가 따라온다.
    // 데이터는 건드리지 않으므로 인증키도 API 호출도 필요 없다.
    if (files.some((f) => f.startsWith('public/'))) {
      execFileSync('node', ['build.mjs', '--assets'], { cwd: ROOT, encoding: 'utf8' });
      git('add', '-A', '--', '.', ':!docs/data');
      files = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
      log('화면 코드 변경 → docs/ 재생성');
    }
    const summary = files.length <= 3 ? files.join(', ') : `${files.slice(0, 3).join(', ')} 외 ${files.length - 3}개`;
    const stamp = new Date().toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });

    git('commit', '-m', `자동 동기화: ${summary} (${stamp})`);
    log(`커밋 — ${summary}`);

    try { git('pull', '--rebase', '--autostash', 'origin', 'main'); } catch { log('pull 생략(원격 변경 없음 또는 충돌)'); }
    git('push', 'origin', 'HEAD:main');
    log('푸시 완료');
  } catch (e) {
    log('실패 —', (e.stderr || e.message || '').toString().trim().split('\n').slice(-2).join(' '));
  } finally {
    syncing = false;
  }
}

const schedule = () => { clearTimeout(timer); timer = setTimeout(sync, DEBOUNCE_MS); };

watch(ROOT, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const rel = filename.split(path.sep).join('/');
  if (IGNORE.some((re) => re.test(rel))) return;
  schedule();
});

log(`감시 시작 — ${ROOT}`);
log(`변경 후 ${DEBOUNCE_MS / 1000}초 조용해지면 커밋·푸시합니다. (Ctrl+C로 종료)`);
sync(); // 시작할 때 밀린 변경이 있으면 먼저 올린다
