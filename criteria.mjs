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
  const RE = /(도시\s?근로자[^%]{0,60}?|기준\s?중위\s?소득[^%]{0,40}?|월평균\s?소득[^%]{0,30}?)(\d{2,3})\s?%/g;
  for (const m of t.matchAll(RE)) {
    const tail = t.slice(m.index + m[0].length, m.index + m[0].length + 14);
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
    out.incomePct = list.at(-1);   // 여러 개면 가장 너그러운 쪽(일반공급)을 한도로 본다
  }

  // ── 자산 한도 ──
  const asset = t.match(/총\s?자산[^0-9]{0,24}([\d,]{3,12})\s*만\s?원/);
  if (asset && LIMIT_NEAR.test(t.slice(asset.index, asset.index + asset[0].length + 12))) {
    const v = num(asset[1]);
    if (v >= 1000 && v <= 200000) out.totalAssetManwon = v;
  }
  const car = t.match(/자동차[^0-9]{0,24}([\d,]{3,10})\s*만\s?원/);
  if (car && LIMIT_NEAR.test(t.slice(car.index, car.index + car[0].length + 12))) {
    const v = num(car[1]);
    if (v >= 1000 && v <= 20000) out.carManwon = v;
  }

  return (out.incomePct || out.totalAssetManwon || out.carManwon) ? out : null;
}
