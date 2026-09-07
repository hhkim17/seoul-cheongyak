#!/usr/bin/env node
// 새로 올라온 공고 중 watch.json 조건에 맞는 것만 골라 메일 본문을 만든다.
//   node notify.mjs <이전 listings.json 경로>
// 보낼 게 있으면 notify/email.html + notify/subject.txt 를 남기고 exit 0,
// 없으면 파일을 만들지 않는다. (워크플로가 파일 존재 여부로 발송을 결정)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'notify');
const SITE = 'https://hhkim17.github.io/seoul-cheongyak/';

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

// --test: 새 공고가 없어도 최근 공고로 메일을 만들어 발송 경로를 점검한다
const TEST = process.argv.includes('--test');

const prev = read(process.argv[2] || path.join(ROOT, '.prev-listings.json'));
const curr = read(path.join(ROOT, 'docs', 'data', 'listings.json'));
const watch = read(path.join(ROOT, 'watch.json')) || {};

if (!curr) { console.error('빌드 결과가 없습니다.'); process.exit(1); }
if (!prev && !TEST) { console.log('비교할 이전 스냅샷이 없습니다 — 첫 실행으로 보고 알림을 보내지 않습니다.'); process.exit(0); }

const known = new Set((prev?.listings || []).map((l) => l.id));
let fresh = (curr.listings || []).filter((l) => !known.has(l.id));
console.log(`새 공고 ${fresh.length}건 (전체 ${curr.listings.length}건)`);

if (TEST && !fresh.length) {
  fresh = [...curr.listings].sort((a, b) => (b.noticeDate || '').localeCompare(a.noticeDate || '')).slice(0, 5);
  console.log(`[테스트] 새 공고가 없어 최근 ${fresh.length}건으로 발송 경로를 점검합니다.`);
}

// ── 조건 맞추기 ──────────────────────────────────────────────────────
const RENTAL = new Set(['RENT', 'LH_RENT', 'LH_WELFARE', 'MYHOME_RENT', 'SH', 'HUG']);
const manwon = (eok) => (eok == null ? Infinity : eok * 10000);

/** 조건(watch) 하나로 공고를 거르는 판정 함수를 만든다 — 구독자마다 조건이 다르다 */
function makeMatcher(w) {
const watch = w;
const priceCap = manwon(watch['최대분양가_억']);
const depositCap = manwon(watch['최대보증금_억']);
const corners = watch['코너'] || [];
const gus = watch['관심자치구'] || [];
const areaMin = watch['전용면적_최소'] ?? 0;
const areaMax = watch['전용면적_최대'] ?? 9999;
const specials = watch['해당특별공급'] || [];
const allowUnpriced = watch['가격정보없어도_알림'] !== false;

const recruitOnly = watch['모집공고만'] !== false;

return function matches(l) {
  if (corners.length && !corners.includes(l.corner)) return false;
  // 게시판 공고는 '당첨자 발표'·'안내'가 섞인다 — 알림은 모집공고만
  if (recruitOnly && l.noticeKind && l.noticeKind !== '모집') return false;
  // 자치구를 알 수 없는 공고(게시판 수집분 등)는 지역 필터로 걸러내지 않는다.
  // 걸러 버리면 SH 공고가 통째로 알림에서 빠진다.
  if (gus.length && l.gu && !gus.includes(l.gu)) return false;

  const models = l.models || [];
  const rental = RENTAL.has(l.kind);
  const cap = rental ? depositCap : priceCap;
  const priceOf = (m) => (rental ? (m.depositManwon ?? m.priceManwon) : m.priceManwon);
  const priced = models.filter((m) => priceOf(m) != null);

  if (priced.length) { if (!priced.some((m) => priceOf(m) <= cap)) return false; }
  else if (!allowUnpriced) return false;

  const areas = models.map((m) => m.exclusiveArea).filter((a) => a != null);
  if (areas.length && !areas.some((a) => a >= areaMin && a <= areaMax)) return false;

  // 특별공급 조건은 해당 세대가 배정된 공고에만 적용한다(임대·게시판 공고는 통과)
  if (specials.length && models.some((m) => m.specialUnits > 0)) {
    const hit = specials.some((k) => models.some((m) => (m.special?.[k] || 0) > 0));
    if (!hit) return false;
  }
  return true;
};
}

// ── 받는 사람 모으기 ────────────────────────────────────────────────
// 1) 저장소 주인 (watch.json + MAIL_TO)
// 2) 사이트에서 로그인해 알림을 켠 구독자 (Supabase)
async function subscribers() {
  const list = [];
  const owner = process.env.MAIL_TO || process.env.MAIL_USERNAME;
  if (owner) list.push({ email: owner, watch, label: '주인' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.log('Supabase 설정이 없어 구독자 목록은 건너뜁니다.');
    return list;
  }
  try {
    const res = await fetch(`${url}/rest/v1/profiles?select=email,watch,notify_email&notify_email=eq.true`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    for (const r of rows) {
      if (!r.email || list.some((x) => x.email === r.email)) continue;
      list.push({ email: r.email, watch: { ...watch, ...(r.watch || {}) }, label: '구독자' });
    }
    console.log(`구독자 ${rows.length}명을 불러왔습니다.`);
  } catch (e) {
    console.log(`구독자 목록을 못 불러왔습니다: ${e.message}`);
  }
  return list;
}

const people = await subscribers();
if (!people.length) { console.log('받는 사람이 없습니다.'); process.exit(0); }

// ── 메일 본문 ────────────────────────────────────────────────────────
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eok = (m) => (m == null ? null : `${(m / 10000).toFixed(m / 10000 >= 10 ? 1 : 2)}억`);
const cornerLabel = (k) => (curr.corners || []).find((c) => c.key === k)?.label || k;

const card = (l) => {
  const rental = RENTAL.has(l.kind);
  const priceOf = (m) => (rental ? (m.depositManwon ?? m.priceManwon) : m.priceManwon);
  const prices = (l.models || []).map(priceOf).filter((v) => v != null);
  const areas = (l.models || []).map((m) => m.exclusiveArea).filter((a) => a != null);
  const line = [l.gu, l.kindLabel, l.totalUnits ? `${l.totalUnits.toLocaleString('ko-KR')}세대` : null].filter(Boolean).join(' · ');
  const money = prices.length
    ? `${rental ? '보증금' : '분양가'} ${eok(Math.min(...prices))}${Math.max(...prices) !== Math.min(...prices) ? ` ~ ${eok(Math.max(...prices))}` : ''}`
    : '금액은 공고문 참조';
  const area = areas.length ? `전용 ${Math.min(...areas)}~${Math.max(...areas)}㎡` : '';
  const when = l.receiptStart
    ? `접수 ${l.receiptStart}${l.receiptEnd && l.receiptEnd !== l.receiptStart ? ` ~ ${l.receiptEnd}` : ''}`
    : '일정은 공고 원문 확인';

  return `<tr><td style="padding:14px 16px;border:1px solid #e3e6ec;border-radius:10px;background:#fff">
    <div style="font-size:15px;font-weight:700;color:#14171c">${esc(l.name)}</div>
    <div style="font-size:12px;color:#7b8494;margin-top:3px">${esc(line)}</div>
    <div style="font-size:13px;color:#2f3540;margin-top:8px">${esc(money)}${area ? ` · ${esc(area)}` : ''}</div>
    <div style="font-size:13px;color:#2f3540;margin-top:2px">${esc(when)}</div>
    ${l.noticeUrl ? `<div style="margin-top:9px"><a href="${esc(l.noticeUrl)}" style="color:#2f6fe4;font-size:13px">공고 원문 보기 →</a></div>` : ''}
  </td></tr><tr><td style="height:10px"></td></tr>`;
};

/** HTML만 보내면 스팸으로 분류되기 쉽다 — 같은 내용의 텍스트본을 함께 넣는다 */
function buildText(hits) {
  const lines = [`내 조건에 맞는 새 청약 공고 ${hits.length}건`, `${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} 기준`, ''];
  const byCorner = {};
  for (const l of hits) (byCorner[l.corner] ||= []).push(l);
  for (const [k, list] of Object.entries(byCorner)) {
    lines.push(`■ ${cornerLabel(k)} (${list.length}건)`);
    for (const l of list) {
      const rental = RENTAL.has(l.kind);
      const priceOf = (m) => (rental ? (m.depositManwon ?? m.priceManwon) : m.priceManwon);
      const prices = (l.models || []).map(priceOf).filter((v) => v != null);
      lines.push(`  · ${l.name}`);
      lines.push(`    ${[l.gu, l.kindLabel].filter(Boolean).join(' / ')}` +
        (prices.length ? ` / ${rental ? '보증금' : '분양가'} ${eok(Math.min(...prices))}~` : '') +
        (l.receiptStart ? ` / 접수 ${l.receiptStart}` : ' / 일정은 공고문 확인'));
      if (l.noticeUrl) lines.push(`    ${l.noticeUrl}`);
    }
    lines.push('');
  }
  lines.push(`전체 보기: ${SITE}`);
  lines.push('알림을 끄려면 대시보드에서 로그인 후 메일 알림 수신 설정을 꺼 주세요.');
  return lines.join('\n');
}

function buildHtml(hits) {
  const byCorner = {};
  for (const l of hits) (byCorner[l.corner] ||= []).push(l);
  return `<div style="font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;background:#f5f6f8;padding:24px">
  <div style="max-width:640px;margin:0 auto">
    <h1 style="font-size:19px;color:#14171c;margin:0 0 4px">${TEST ? '[테스트] ' : ''}내 조건에 맞는 새 청약 공고 ${hits.length}건</h1>
    <p style="font-size:13px;color:#7b8494;margin:0 0 20px">${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} 기준</p>
    ${Object.entries(byCorner).map(([k, list]) => `
      <h2 style="font-size:13px;color:#7b8494;margin:22px 0 10px">${esc(cornerLabel(k))} · ${list.length}건</h2>
      <table style="width:100%;border-collapse:separate;border-spacing:0">${list.map(card).join('')}</table>`).join('')}
    <p style="margin-top:26px"><a href="${SITE}" style="display:inline-block;background:#2f6fe4;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px">대시보드에서 전체 보기</a></p>
    <p style="font-size:11px;color:#9aa2b0;margin-top:20px;line-height:1.7">
      알림을 끄려면 대시보드에서 로그인 후 「메일 알림」의 수신 설정을 꺼 주세요.<br>
      일정·자격·금액은 반드시 공고 원문을 확인하세요. 이 메일은 공개 데이터를 모아 자동 발송된 것입니다.
    </p>
  </div>
</div>`;
}

// ── 사람마다 조건이 다르므로 각자에게 맞는 메일을 만든다 ─────────────
const outbox = [];
for (const person of people) {
  let hits = fresh.filter(makeMatcher(person.watch));
  if (!hits.length && TEST) hits = fresh.slice(0, 3);
  console.log(`  ${person.label} ${person.email}: ${hits.length}건`);
  if (!hits.length) continue;
  outbox.push({
    to: person.email,
    subject: `${TEST ? '(테스트) ' : ''}서울 청약 새 공고 ${hits.length}건 · ${hits[0].name.slice(0, 30)}${hits.length > 1 ? ' 외' : ''}`,
    html: buildHtml(hits),
    text: buildText(hits),
  });
}

if (!outbox.length) { console.log('보낼 메일이 없습니다.'); process.exit(0); }

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'outbox.json'), JSON.stringify(outbox, null, 2));
console.log(`보낼 메일 ${outbox.length}통을 준비했습니다.`);
