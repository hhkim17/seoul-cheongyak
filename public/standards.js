// 공공임대·공공분양의 소득·자산 기준
//
// 원칙: 확인한 기준만 단정하고, 확실하지 않으면 판정하지 않는다.
// 부적격 당첨은 당첨 취소와 재당첨 제한으로 이어지므로, 틀린 '가능' 표시의 대가가 크다.
// 최종 판단은 언제나 모집공고문이다.

/** 출처를 함께 남겨 화면에서 근거를 보여줄 수 있게 한다 */
export const SOURCES = {
  income: 'https://www.i-sh.co.kr/app/lay2/S48T1587C589/contents.do/',
  happy: 'https://apply.lh.or.kr/lhapply/cm/cntnts/cntntsView.do?mi=1201663&cntntsId=1201391',
  national: 'https://apply.lh.or.kr/lhapply/cm/cntnts/cntntsView.do?mi=1144&cntntsId=1023',
};

/** 자산 한도(만원). 같은 유형이라도 신청 계층에 따라 다르다. */
export const ASSET_LIMITS = {
  일반: { total: 34500, car: 4542 },
  신혼부부: { total: 34500, car: 4542 },
  고령자: { total: 34500, car: 4542 },
  청년: { total: 25100, car: 4542 },
  대학생: { total: 10800, car: 4542 },
};

/**
 * 유형(코너)별 소득 기준. 단위는 도시근로자 가구원수별 월평균소득 대비 %.
 *  verified: LH·SH 공식 안내에서 직접 확인한 기준 — 판정에 쓴다
 *  ceiling : 확인하지 못한 유형의 '이보다 높으면 어디도 어렵다'는 상한 — 초과 경고에만 쓴다
 */
/**
 * 소득을 '본인 기준'으로 보는 계층이 있는 유형.
 * LH 행복주택 안내가 청년 계층에만 '해당세대(세대원은 본인 기준)'이라 적고 있어
 * 확인된 이 유형에만 적용한다. 청년안심주택 등은 공고마다 달라 넣지 않는다.
 */
export const SOLO_INCOME_CORNERS = new Set(['happy']);

export const INCOME_RULES = {
  happy: {
    verified: true, label: '행복주택',
    base: 100, bySize: { 1: 120, 2: 110 },
    note: '맞벌이 신혼부부는 120%(2인가구 130%)까지 인정되는 공고가 있습니다.',
    source: SOURCES.happy,
  },
  publichome: {
    verified: true, label: '국민임대',
    base: 70, bySize: { 1: 90, 2: 80 },
    note: '통합공공임대는 도시근로자 소득이 아니라 기준 중위소득을 쓰므로 이 계산이 맞지 않습니다.',
    source: SOURCES.national,
  },
  longterm: { verified: false, label: '장기전세', ceiling: 150, note: '면적·유형에 따라 70~150%로 갈립니다. 공고문을 확인하세요.' },
  purchase: { verified: false, label: '매입임대', ceiling: 150, note: '청년·신혼부부·일반 등 공급 계층마다 다릅니다.' },
  jeonsae: { verified: false, label: '전세임대', ceiling: 150, note: '공급 계층마다 다릅니다.' },
  youth: { verified: false, label: '청년안심주택', ceiling: 150, note: '공고마다 다릅니다.' },
  lhsale: { verified: false, label: '공공분양·신혼희망타운', ceiling: 160, note: '신혼희망타운은 맞벌이 여부에 따라 달라집니다.' },
};

/** 나이와 특별공급 체크로 신청 계층을 짐작한다 — 자산 한도가 계층별로 다르기 때문 */
export function guessTier({ ageYears, special = [] }) {
  if (special.includes('newlywed') || special.includes('newborn')) return '신혼부부';
  if (ageYears != null && ageYears >= 65) return '고령자';
  if (special.includes('youth')) return '청년';
  if (ageYears != null && ageYears <= 39) return '청년';
  return '일반';
}

/**
 * 한 공고에 대해 내 소득·자산이 어디쯤인지 계산한다.
 *  income   : 월평균소득(원)
 *  household: 가구원수
 *  base     : scrapeIncomeStandard()가 준 가구원수별 100% 기준액
 * 반환 verdict — 'ok' 여유 | 'tight' 아슬아슬 | 'over' 초과 | 'unknown' 판정 안 함
 */
export function evaluate({ corner, income, household, totalAssetManwon, carManwon, tier, base }) {
  const rule = INCOME_RULES[corner];
  const out = { verdict: 'unknown', rule: rule?.label ?? null, note: rule?.note ?? null, source: rule?.source ?? null };
  if (!rule || !base) return out;

  const limitWon = base[household] ?? base[Object.keys(base).at(-1)];
  if (!limitWon || income == null) return out;

  const pct = rule.verified ? (rule.bySize?.[household] ?? rule.base) : rule.ceiling;
  const threshold = Math.round(limitWon * (pct / 100));
  const ratio = income / limitWon * 100;     // 내 소득이 100% 기준의 몇 %인가

  out.myPercent = Math.round(ratio);
  out.thresholdPercent = pct;
  out.thresholdWon = threshold;

  if (income > threshold) out.verdict = 'over';
  else if (income > threshold * 0.9) out.verdict = 'tight';
  else out.verdict = rule.verified ? 'ok' : 'unknown';   // 미확인 유형은 '통과'라고 말하지 않는다

  // 자산은 유형과 무관하게 공공임대 공통 기준으로 본다
  const limits = ASSET_LIMITS[tier] ?? ASSET_LIMITS['일반'];
  out.assetTier = tier;
  out.assetLimit = limits;
  if (totalAssetManwon != null && totalAssetManwon > limits.total) { out.verdict = 'over'; out.assetOver = '총자산'; }
  if (carManwon != null && carManwon > limits.car) { out.verdict = 'over'; out.assetOver = '자동차'; }

  return out;
}
