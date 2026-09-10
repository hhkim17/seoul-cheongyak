// 공공 API는 이따금 연결이 끊기거나 응답이 늦다.
// 한 번 실패했다고 그 기관 전체를 버리지 않도록, 짧게 여러 번 다시 시도한다.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 다시 시도해 볼 만한 실패인가 (네트워크 끊김·타임아웃·서버 과부하) */
export function isTransient(err) {
  const m = String(err?.message || err);
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|timeout|aborted|HTTP 5\d\d|HTTP 429/i.test(m);
}

/**
 * 타임아웃과 재시도가 붙은 fetch.
 * 5xx·429는 실패로 보고 다시 시도하고, 4xx는 그대로 돌려준다(인증 오류 등은 재시도해도 소용없다).
 */
export async function fetchRetry(url, { headers, timeoutMs = 20000, retries = 3, redirect } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers, redirect, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt === retries || !isTransient(e)) break;
      await sleep(600 * 2 ** attempt + Math.random() * 300);   // 0.6s → 1.2s → 2.4s
    }
  }
  throw lastErr;
}

/**
 * 여러 조각을 모으는 작업에서, 일부가 실패해도 나머지는 살린다.
 * 전부 실패했을 때만 오류로 취급한다.
 */
export function partial(results) {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  return {
    rows: ok.flatMap((r) => r.rows),
    okCount: ok.length,
    failCount: failed.length,
    allFailed: ok.length === 0 && failed.length > 0,
    firstError: failed[0]?.error ?? null,
  };
}
