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

const prev = read(process.argv[2] || path.join(ROOT, '.prev-listings.json'));
const curr = read(path.join(ROOT, 'docs', 'data', 'listings.json'));
const watch = read(path.join(ROOT, 'watch.json')) || {};

if (!curr) { console.error('빌드 결과가 없습니다.'); process.exit(1); }
if (!prev) { console.log('비교할 이전 스냅샷이 없습니다 — 첫 실행으로 보고 알림을 보내지 않습니다.'); process.exit(0); }

const known = new Set((prev.listings || []).map((l) => l.id));
const fresh = (curr.listings || []).filter((l) => !known.has(l.id));
console.log(`새 공고 ${fresh.length}건 (전체 ${curr.listings.length}건)`);

// ── 조건 맞추기 ──────────────────────────────────────────────────────
const RENTAL = new Set(['RENT', 'LH_RENT', 'LH_WELFARE', 'MYHOME_RENT', 'SH', 'HUG']);
const manwon = (eok) => (eok == null ? Infinity : eok * 10000);
const priceCap = manwon(watch['최대분양가_억']);
const depositCap = manwon(watch['최대보증금_억']);
const corners = watch['코너'] || [];
const gus = watch['관심자치구'] || [];
const areaMin = watch['전용면적_최소'] ?? 0;
const areaMax = watch['전용면적_최대'] ?? 9999;
const specials = watch['해당특별공급'] || [];
const allowUnpriced = watch['가격정보없어도_알림'] !== false;

function matches(l) {
  if (corners.length && !corners.includes(l.corner)) return false;
  if (gus.length && !(l.gu && gus.includes(l.gu))) return false;

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
}

const hits = fresh.filter(matches);
console.log(`조건에 맞는 새 공고 ${hits.length}건`);
if (!hits.length) process.exit(0);

// ── 메일 본문 ────────────────────────────────────────────────────────
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eok = (m) => (m == null ? null : `${(m / 10000).toFixed(m / 10000 >= 10 ? 1 : 2)}억`);
const cornerLabel = (k) => (curr.corners || []).find((c) => c.key === k)?.label || k;

const byCorner = {};
for (const l of hits) (byCorner[l.corner] ||= []).push(l);

const card = (l) => {
  const rental = RENTAL.has(l.kind);
  const priceOf = (m) => (rental ? (m.depositManwon ?? m.priceManwon) : m.priceManwon);
  const prices = (l.models || []).map(priceOf).filter((v) => v != null);
  const areas = (l.models || []).map((m) => m.exclusiveArea).filter((a) => a != null);
  const line = [
    l.gu, l.kindLabel,
    l.totalUnits ? `${l.totalUnits.toLocaleString('ko-KR')}세대` : null,
  ].filter(Boolean).join(' · ');
  const money = prices.length
    ? `${rental ? '보증금' : '분양가'} ${eok(Math.min(...prices))}${Math.max(...prices) !== Math.min(...prices) ? ` ~ ${eok(Math.max(...prices))}` : ''}`
    : '금액은 공고문 참조';
  const area = areas.length ? `전용 ${Math.min(...areas)}~${Math.max(...areas)}㎡` : '';
  const when = l.receiptStart ? `접수 ${l.receiptStart}${l.receiptEnd && l.receiptEnd !== l.receiptStart ? ` ~ ${l.receiptEnd}` : ''}` : '일정은 공고 원문 확인';

  return `<tr><td style="padding:14px 16px;border:1px solid #e3e6ec;border-radius:10px;background:#fff">
    <div style="font-size:15px;font-weight:700;color:#14171c">${esc(l.name)}</div>
    <div style="font-size:12px;color:#7b8494;margin-top:3px">${esc(line)}</div>
    <div style="font-size:13px;color:#2f3540;margin-top:8px">${esc(money)}${area ? ` · ${esc(area)}` : ''}</div>
    <div style="font-size:13px;color:#2f3540;margin-top:2px">${esc(when)}</div>
    ${l.noticeUrl ? `<div style="margin-top:9px"><a href="${esc(l.noticeUrl)}" style="color:#2f6fe4;font-size:13px">공고 원문 보기 →</a></div>` : ''}
  </td></tr><tr><td style="height:10px"></td></tr>`;
};

const html = `<div style="font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;background:#f5f6f8;padding:24px">
  <div style="max-width:640px;margin:0 auto">
    <h1 style="font-size:19px;color:#14171c;margin:0 0 4px">내 조건에 맞는 새 청약 공고 ${hits.length}건</h1>
    <p style="font-size:13px;color:#7b8494;margin:0 0 20px">${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} 기준</p>
    ${Object.entries(byCorner).map(([k, list]) => `
      <h2 style="font-size:13px;color:#7b8494;margin:22px 0 10px;text-transform:none">${esc(cornerLabel(k))} · ${list.length}건</h2>
      <table style="width:100%;border-collapse:separate;border-spacing:0">${list.map(card).join('')}</table>`).join('')}
    <p style="margin-top:26px"><a href="${SITE}" style="display:inline-block;background:#2f6fe4;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px">대시보드에서 전체 보기</a></p>
    <p style="font-size:11px;color:#9aa2b0;margin-top:20px;line-height:1.7">
      알림 조건은 저장소의 <code>watch.json</code>에서 바꿀 수 있습니다.<br>
      일정·자격·금액은 반드시 공고 원문을 확인하세요. 이 메일은 공개 데이터를 모아 자동 발송된 것입니다.
    </p>
  </div>
</div>`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'email.html'), html);
fs.writeFileSync(path.join(OUT, 'subject.txt'),
  `[서울청약] 내 조건 새 공고 ${hits.length}건 — ${hits.slice(0, 2).map((l) => l.name).join(', ')}${hits.length > 2 ? ' 외' : ''}`);
console.log('메일 본문을 만들었습니다: notify/email.html');
