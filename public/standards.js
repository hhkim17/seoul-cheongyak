// 공공임대·공공분양의 소득·자산 기준 (2026년 적용)
//
// 원칙
//  1. 기관 공식 안내에서 직접 확인한 기준만 판정에 쓴다.
//  2. 확인하지 못한 유형은 '통과'라고 말하지 않는다. 넘는 게 분명할 때만 경고한다.
//  3. 최종 판단은 언제나 모집공고문이다. 부적격 당첨은 당첨 취소로 이어진다.
//
// 기준액은 코드에 박지 않는다. 도시근로자 월평균소득은 SH 공표표에서,
// 기준 중위소득은 LH 통합공공임대 안내에서 매년 읽어 온다.

export const SOURCES = {
  happy: 'https://apply.lh.or.kr/lhapply/cm/cntnts/cntntsView.do?mi=1201663&cntntsId=1201391',
  national: 'https://apply.lh.or.kr/lhapply/cm/cntnts/cntntsView.do?mi=1144&cntntsId=1023',
  unified: 'https://apply.lh.or.kr/lhapply/cm/cntnts/cntntsView.do?mi=1201585&cntntsId=1201333',
  longtermLH: 'https://apply.lh.or.kr/lhapply/cm/cntnts/cntntsView.do?mi=1232&cntntsId=1028',
  publicSale: 'https://apply.lh.or.kr/lhapply/cm/cntnts/cntntsView.do?mi=1224&cntntsId=1111',
  youthSafe: 'https://soco.seoul.go.kr/youth/pgm/home/yohome/supportYouth1.do?menuNo=400039',
  longtermSH: 'https://www.i-sh.co.kr/app/lay2/S48T1587C589/contents.do/',
};

/** 공고의 유형 이름으로 어떤 규칙을 쓸지 고른다. 코너보다 세밀하다. */
export function ruleKeyOf(l) {
  const t = `${l.kindLabel ?? ''} ${l.subType ?? ''} ${l.name ?? ''}`;
  if (l.kind === 'HUG') return 'hugJeonse';
  if (/청년안심|역세권\s*청년/.test(t)) return 'youthSafe';
  if (/행복주택/.test(t)) return 'happy';
  if (/통합공공임대/.test(t)) return 'unified';
  if (/국민임대/.test(t)) return 'national';
  if (/영구임대/.test(t)) return 'permanent';
  if (/장기전세/.test(t)) return l.agency === 'SH' ? 'longtermSH' : 'longtermLH';
  if (/공공분양|신혼희망타운|분양전환/.test(t)) return 'publicSale';
  if (/매입임대|미리내집|전세임대|사회주택|두레주택|희망하우징/.test(t)) return 'caseByCase';
  return null;
}

/**
 * 자동차 한도는 세대 합산이 아니다.
 * LH 안내: "신청자 및 세대원 각각의 자동차를 기준으로 하되, 해당 동일 세대내 세대원간
 * 지분으로 공유하고 있는 자동차의 보유가액은 세대원간 지분을 합산하여 산정".
 * 그래서 세대에서 가장 비싼 차 한 대가 한도를 넘는지로 본다.
 * (반면 총자산을 구할 때는 세대가 보유한 모든 자동차의 가액 합계를 더한다.)
 */
export const CAR_RULE = '세대에서 가장 비싼 차 한 대 기준 (세대 합산이 아님)';

/**
 * basis   — urban: 도시근로자 월평균소득 / median: 기준 중위소득 / none: 소득 기준 없음
 * income  — pct 기본 비율, bySize 가구원수 예외, dual 맞벌이 신혼 완화
 * soloTiers — 소득을 '본인 기준'으로 보는 계층
 * assets  — 계층별 총자산 한도(만원). soloAsset 계층은 본인 자산으로 본다.
 */
export const RULES = {
  happy: {
    label: '행복주택', verified: true, basis: 'urban', source: SOURCES.happy,
    income: { pct: 100, bySize: { 1: 120, 2: 110 }, dual: 120 },
    soloTiers: ['청년'],
    assets: { 일반: 34500, 신혼부부: 34500, 고령자: 34500, 청년: 25100, 대학생: 10800 },
    soloAssetTiers: ['청년', '대학생'],
    car: 4542,
    note: '청년 계층은 본인 소득만 봅니다. 대학생은 본인과 부모 소득을 합산하고, 자동차는 아예 소유할 수 없습니다. 맞벌이 신혼부부는 120%까지 인정됩니다.',
  },
  national: {
    label: '국민임대', verified: true, basis: 'urban', source: SOURCES.national,
    income: { pct: 70, bySize: { 1: 90, 2: 80 } },
    assets: { 일반: 34500 }, car: 4542,
    note: '전용 50㎡ 미만은 50% 이하에 우선 공급하는 공고가 있습니다.',
  },
  unified: {
    label: '통합공공임대', verified: true, basis: 'median', source: SOURCES.unified,
    income: { pct: 150, addPointsBySize: { 1: 20, 2: 10 }, priorityPct: 100 },
    assets: { 일반: 34500 }, car: 4542,
    note: '기준 중위소득으로 봅니다. 일반공급 150% 이하, 우선공급 100% 이하이며 1인 가구는 +20%p, 2인 가구는 +10%p 적용합니다.',
  },
  youthSafe: {
    label: '청년안심주택', verified: true, basis: 'urban', source: SOURCES.youthSafe,
    income: { pct: 120 },
    assets: { 일반: 25100 }, soloAssetTiers: ['일반', '청년', '신혼부부', '고령자', '대학생'],
    car: 4542,
    note: '서울시 기준으로 본인 자산 2억 5,100만원 이하입니다. 소득 기준을 넘으면 공공지원민간임대 일반공급으로만 신청할 수 있습니다.',
  },
  longtermLH: {
    label: '장기전세(LH)', verified: true, basis: 'urban', source: SOURCES.longtermLH,
    income: { pct: 100 },
    assets: { 일반: 34500 }, car: 4542,
    note: '총자산 한도에 지역별 전세가격 계수가 곱해지므로 실제 한도는 조금 다를 수 있습니다.',
  },
  publicSale: {
    label: '공공분양', verified: false, basis: 'urban', source: SOURCES.publicSale,
    income: { ceiling: 160 },
    assets: { 일반: 36200, 청년: 27600 }, soloAssetTiers: ['청년'],
    realEstate: 21550, car: 4542,
    note: '소득 기준은 공급 유형(일반·신혼희망타운·특별공급)마다 달라 판정하지 않습니다. 자산은 총자산 3억 6,200만원·부동산 2억 1,550만원 이하이며, 청년 특별공급은 본인 2억 7,600만원·부모 10억 3,500만원 기준입니다.',
  },
  longtermSH: {
    label: '장기전세(SH)', verified: false, basis: 'urban', source: SOURCES.longtermSH,
    income: { ceiling: 150 },
    note: '면적과 유형에 따라 70~150%로 갈립니다. 공고문을 확인하세요.',
  },
  permanent: {
    label: '영구임대', verified: false, basis: 'none',
    note: '생계·의료급여 수급자 등 대상별 기준을 따릅니다. 소득 비율로 판정하지 않습니다.',
  },
  caseByCase: {
    label: '매입·전세임대·사회주택', verified: false, basis: 'urban',
    income: { ceiling: 150 },
    note: '공급 계층(청년·신혼부부·고령자·일반)마다 기준이 크게 다릅니다. 공고문을 확인하세요.',
  },
  hugJeonse: {
    label: 'HUG 든든전세', verified: true, basis: 'none',
    note: '소득·자산 기준을 적용하지 않습니다. 무주택세대구성원이면 신청할 수 있습니다.',
  },
};

/** 나이와 특별공급 선택으로 신청 계층을 짐작한다 */
export function guessTier({ ageYears, special = [] }) {
  if (special.includes('newlywed') || special.includes('newborn')) return '신혼부부';
  if (ageYears != null && ageYears >= 65) return '고령자';
  if (special.includes('youth')) return '청년';
  if (ageYears != null && ageYears <= 39) return '청년';
  return '일반';
}

const won = (manwon) => (manwon == null ? null : manwon * 10000);

/**
 * 한 공고에 대한 소득·자산 판정.
 * p = { householdIncome, soloIncome, householdAsset, soloAsset, realEstate, car, dualIncome, household, tier }
 *     소득은 원, 자산은 만원.
 * std = { urban: {base}, median: {base} }
 */
export function evaluate(listing, p, std) {
  const key = ruleKeyOf(listing);
  let rule = key && RULES[key];

  // 공고문에서 직접 읽은 기준이 있으면 그것이 우선이다 — 제도 기본값보다 정확하다
  const c = listing.criteria;
  if (c?.incomePct) {
    rule = {
      label: `${rule?.label ?? '이 공고'} (공고문 기준)`,
      verified: true,
      basis: c.incomeBasis === 'median' ? 'median' : 'urban',
      income: { pct: c.incomePct },
      assets: c.totalAssetManwon ? { 일반: c.totalAssetManwon } : rule?.assets,
      soloAssetTiers: rule?.soloAssetTiers,
      car: c.carManwon ?? rule?.car ?? null,
      source: rule?.source ?? null,
      note: `${c.from ?? '공고문'}에서 읽은 기준입니다 — ${c.incomeBasis === 'median' ? '기준 중위소득' : '도시근로자 월평균소득'} ${c.incomePcts.join('% · ')}%.`
        + (rule?.note ? ` (일반 안내: ${rule.note})` : ''),
      fromNotice: true,
    };
  }

  const out = { rule: rule?.label ?? null, note: rule?.note ?? null, source: rule?.source ?? null,
                fromNotice: !!rule?.fromNotice, verdict: 'unknown' };
  if (!rule) return out;

  // 소득 기준이 없는 유형(든든전세·영구임대)
  if (rule.basis === 'none') {
    out.verdict = rule.verified ? 'nolimit' : 'unknown';
    return out;
  }

  const table = rule.basis === 'median' ? std?.median?.base : std?.urban?.base;
  if (!table) return out;

  // 가구원수가 표를 넘으면 마지막 값을 쓴다
  const sizes = Object.keys(table).map(Number).sort((a, b) => a - b);
  const size = Math.min(p.household ?? 1, sizes.at(-1));
  const base = table[size];
  if (!base) return out;

  // 청년처럼 본인 소득만 보는 계층이면 1인 기준으로 다시 본다
  const useSolo = (rule.soloTiers ?? []).includes(p.tier) && p.soloIncome != null;
  const income = useSolo ? p.soloIncome : p.householdIncome;
  const incomeBase = useSolo ? (table[1] ?? base) : base;
  if (income == null) return out;

  // 적용 비율
  const inc = rule.income ?? {};
  let pct = inc.pct ?? inc.ceiling;
  if (inc.bySize?.[useSolo ? 1 : size]) pct = inc.bySize[useSolo ? 1 : size];
  if (inc.addPointsBySize?.[size]) pct += inc.addPointsBySize[size];
  if (inc.dual && p.dualIncome && p.tier === '신혼부부') pct = Math.max(pct, inc.dual);
  if (pct == null) return out;

  const threshold = Math.round(incomeBase * (pct / 100));
  out.myPercent = Math.round(income / incomeBase * 100);
  out.thresholdPercent = pct;
  out.thresholdWon = threshold;
  out.bySolo = useSolo;
  out.basis = rule.basis === 'median' ? '기준 중위소득' : '도시근로자 월평균소득';

  if (income > threshold) out.verdict = 'over';
  else if (income > threshold * 0.9) out.verdict = 'tight';
  else out.verdict = rule.verified ? 'ok' : 'unknown';   // 미확인 유형은 통과라고 말하지 않는다

  // ── 자산 ──
  if (rule.assets) {
    const limit = rule.assets[p.tier] ?? rule.assets['일반'];
    const useSoloAsset = (rule.soloAssetTiers ?? []).includes(p.tier);
    const asset = useSoloAsset ? (p.soloAsset ?? p.householdAsset) : p.householdAsset;
    out.assetLimit = limit;
    out.assetBySolo = useSoloAsset;
    if (limit != null && asset != null && asset > limit) { out.verdict = 'over'; out.assetOver = '총자산'; }
  }
  if (rule.realEstate != null && p.realEstate != null && p.realEstate > rule.realEstate) {
    out.verdict = 'over'; out.assetOver = '부동산';
  }
  // 자동차는 세대에서 가장 비싼 한 대로 본다 — 합산이 아니다
  if (rule.car != null && p.car != null && p.car > rule.car) { out.verdict = 'over'; out.assetOver = '자동차'; }
  // 행복주택 대학생 계층은 자동차 산출대상 차량을 아예 소유하면 안 된다
  if (key === 'happy' && p.tier === '대학생' && p.car != null && p.car > 0) {
    out.verdict = 'over'; out.assetOver = '자동차(대학생은 소유 불가)';
  }
  out.carLimit = rule.car ?? null;

  return out;
}
