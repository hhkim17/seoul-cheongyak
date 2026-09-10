// 공고문에서 소득·자산 기준을 직접 읽어낸다.
//
// 유형별 일반 기준(standards.mjs)은 제도의 기본값일 뿐이고, 실제 자격은 공고마다 다르다.
// 특히 매입임대·전세임대·사회주택은 공급 계층에 따라 크게 갈려 일반 기준으로는 판정할 수 없다.
// 그래서 공고 본문에 비율이 적혀 있으면 그것을 우선으로 쓴다. 앞으로 올라올 공고도 같은 규칙으로 처리된다.

const num = (v) => Number(String(v).replace(/[^0-9]/g, ''));

/** 한도를 뜻하는 말이 가까이 있어야 기준으로 인정한다 */
const LIMIT_NEAR = /(이하|이내|미만|충족)/;

/**
 * 반환 예:
 *  { incomePct: 120, incomeBasis: 'urban', incomePcts: [100,120],
 *    totalAssetManwon: 34500, carManwon: 4542, evidence: '…' }
 * 확실하지 않으면 그 항목은 넣지 않는다.
 */
export function extractCriteria(text) {
  if (!text) return null;
  const t = String(text).replace(/\s+/g, ' ');
  const out = {};

  // ── 소득 비율 ──
  // '도시근로자 가구원수별 가구당 월평균소득의 120% 이하' / '중위소득 150% 이하'
  const pcts = { urban: [], median: [] };
  // 공고문은 '%' 대신 '퍼센트'라고 쓰기도 한다
  const RE = /(도시\s?근로자[^%퍼]{0,60}?|기준\s?중위\s?소득[^%퍼]{0,40}?|월평균\s?소득[^%퍼]{0,30}?)(\d{2,3})\s?(?:%|퍼센트)/g;
  for (const m of t.matchAll(RE)) {
    const tail = t.slice(m.index + m[0].length, m.index + m[0].length + 16);
    if (!LIMIT_NEAR.test(tail)) continue;
    const pct = Number(m[2]);
    if (pct < 30 || pct > 300) continue;                 // 말이 되는 범위만
    const basis = /중위\s?소득/.test(m[1]) ? 'median' : 'urban';
    if (!pcts[basis].includes(pct)) pcts[basis].push(pct);
    if (!out.evidence) out.evidence = t.slice(Math.max(0, m.index - 40), m.index + m[0].length + 20).trim();
  }
  const basis = pcts.median.length && !pcts.urban.length ? 'median' : (pcts.urban.length ? 'urban' : null);
  if (basis) {
    const list = pcts[basis].sort((a, b) => a - b);
    out.incomeBasis = basis;
    out.incomePcts = list;
    // 공고문에는 계층·가구원수별 숫자가 뒤섞여 나온다. 어느 것이 내게 해당하는지
    // 글만 보고는 가릴 수 없으므로 범위로 남긴다.
    //  · 최솟값 이하면 어떤 기준으로도 통과
    //  · 최댓값 초과면 어떤 기준으로도 탈락
    //  · 그 사이는 단정하지 않는다
    out.incomePctMin = list[0];
    out.incomePctMax = list.at(-1);
  }

  // ── 자산 한도 ──
  // 자산도 계층마다 달라 여러 값이 나온다. 값이 하나로 모일 때만 쓴다.
  const collect = (re, lo, hi) => {
    const found = new Set();
    for (const m of t.matchAll(re)) {
      if (!LIMIT_NEAR.test(t.slice(m.index, m.index + m[0].length + 12))) continue;
      const v = num(m[1]);
      if (v >= lo && v <= hi) found.add(v);
    }
    return [...found];
  };
  const assets = collect(/총\s?자산[^0-9]{0,24}([\d,]{3,12})\s*만\s?원/g, 1000, 200000);
  if (assets.length === 1) out.totalAssetManwon = assets[0];
  else if (assets.length > 1) out.totalAssetRange = [Math.min(...assets), Math.max(...assets)];

  const cars = collect(/자동차[^0-9]{0,24}([\d,]{3,10})\s*만\s?원/g, 1000, 20000);
  if (cars.length === 1) out.carManwon = cars[0];
  else if (cars.length > 1) out.carManwon = Math.max(...cars);   // 자동차는 가장 너그러운 값만 확실하다

  // ── 7인 이상 가구 가산액 ──
  // '7인이상의 가구는 6인가구 기준소득금액에 추가 1인당 평균금액 579,278원을 합산'
  const perHead = t.match(/7\s?인\s?이상[^0-9]{0,60}?([\d,]{5,12})\s*원/);
  if (perHead) {
    const v = num(perHead[1]);
    if (v > 100000 && v < 3000000) out.perExtraPersonWon = v;
  }

  // ── 출산자녀 수 가산 ──
  // '출산자녀 2인 이상 20% 가산, 출산자녀 1인 10% 가산'
  const bonus = {};
  for (const m of t.matchAll(/출\s?산\s?자녀\s*(\d)\s*인\s*(이상)?\s*(\d{1,2})\s?%\s?가산/g)) {
    const kids = Number(m[1]);
    bonus[m[2] ? `${kids}+` : `${kids}`] = Number(m[3]);
  }
  if (Object.keys(bonus).length) out.newbornBonusPct = bonus;

  return (out.incomePctMax || out.totalAssetManwon || out.carManwon || out.perExtraPersonWon) ? out : null;
}
