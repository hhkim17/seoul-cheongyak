// 일반공급 순위 판정
//
// 국민주택(공공)과 민영주택은 순위를 가리는 방법이 다르다.
//  · 국민주택 — 청약통장 가입기간과 '납입 횟수'
//  · 민영주택 — 가입기간과 면적별 '예치금'
// 기준은 SH 공식 안내에서 확인한 것을 쓴다.
// https://www.i-sh.co.kr/app/lay2/S48T1587C589/contents.do/

/** 서울 기준 민영주택 청약 예치기준금액(만원) */
export const DEPOSIT_SEOUL = [
  { maxArea: 85, amount: 300 },
  { maxArea: 102, amount: 600 },
  { maxArea: 135, amount: 1000 },
  { maxArea: Infinity, amount: 1500 },
];

export const depositFor = (area) =>
  (DEPOSIT_SEOUL.find((r) => (area ?? 0) <= r.maxArea) ?? DEPOSIT_SEOUL.at(-1)).amount;

/** 이 공고가 순위를 따지는 유형인가 */
export function rankKindOf(l) {
  const t = `${l.kindLabel ?? ''} ${l.subType ?? ''} ${l.name ?? ''}`;
  if (l.kind === 'APT') return /국민/.test(t) ? 'public' : 'private';
  if (/장기전세|국민임대|공공분양|재개발임대/.test(t)) return 'public';
  return null;   // 무순위·오피스텔·행복주택 등은 순위가 아니라 추첨이거나 계층 심사다
}

/**
 * p = { accountYears, payments, depositManwon }
 * area = 신청하려는 전용면적(㎡). 민영 85㎡ 초과일 때 예치금 기준이 달라진다.
 * 반환 { rank: 1|2|3, label, why, need }
 */
export function judgeRank(l, p, area) {
  const kind = rankKindOf(l);
  if (!kind) return null;
  const years = p.accountYears ?? 0;

  if (kind === 'public') {
    const n = p.payments;
    if (n == null) return { rank: null, label: '납입 횟수 필요', why: '국민주택은 납입 횟수로 순위를 가립니다.' };
    if (years >= 2 && n >= 24) return { rank: 1, label: '1순위', why: '가입 2년 이상 · 납입 24회 이상' };
    if (years >= 0.5 && n >= 6) return { rank: 2, label: '2순위', why: '가입 6개월 이상 · 납입 6회 이상', need: '1순위는 가입 2년·납입 24회' };
    return { rank: 3, label: '3순위', why: '가입기간·납입 횟수가 2순위에 못 미칩니다' };
  }

  // 민영주택 가입기간 요건은 '그 공고가 규제지역에 있는지'로 갈린다.
  // 투기과열지구·조정대상지역이면 2년, 그 밖의 수도권은 1년.
  // 공고 자료에 이 표시가 들어 있으므로 사용자에게 묻지 않는다.
  const regulated = !!(l.flags?.speculative || l.flags?.regulated);
  const needYears = regulated ? 2 : 1;
  const needDeposit = depositFor(area);
  const d = p.depositManwon;
  if (d == null) return { rank: null, label: '예치금 필요', why: '민영주택은 예치금으로 순위를 가립니다.' };
  if (years >= needYears && d >= needDeposit) {
    return { rank: 1, label: '1순위',
      why: `${regulated ? '규제지역 ' : ''}가입 ${needYears}년 이상 · 예치금 ${needDeposit.toLocaleString('ko-KR')}만원 이상` };
  }
  return {
    rank: 2, label: '2순위',
    why: years < needYears
      ? `${regulated ? '투기과열·조정대상지역이라 ' : ''}가입 ${needYears}년이 필요한데 모자랍니다`
      : `예치금이 ${needDeposit.toLocaleString('ko-KR')}만원에 못 미칩니다`,
    need: `1순위는 가입 ${needYears}년 · 예치금 ${needDeposit.toLocaleString('ko-KR')}만원`,
  };
}
