// 공고문 PDF에서 글자를 뽑는다.
// 소득·자산 기준은 대개 앞쪽 자격 안내에 있어 앞부분 몇 쪽만 읽는다.

import { fetchRetry } from './net.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';

let pdfjs = null;
async function lib() {
  if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

/** 첨부 목록에서 '모집공고문'으로 보이는 PDF를 고른다 (서식·팸플릿은 거른다) */
export function pickNoticePdf(attachments = []) {
  const pdfs = attachments.filter((f) => /\.pdf$/i.test(f.name || ''));
  if (!pdfs.length) return null;
  const good = pdfs.find((f) => /(모집\s*공고문|입주자\s*모집|공고문)/.test(f.name)
    && !/(서식|제출|확인서|동의서|팸플릿|팜플렛|위임)/.test(f.name));
  return good ?? pdfs.find((f) => !/(서식|제출|확인서|동의서|팸플릿|팜플렛|위임)/.test(f.name)) ?? pdfs[0];
}

/** PDF 앞쪽 maxPages 쪽의 글자를 이어 붙여 돌려준다 */
export async function pdfToText(url, { maxPages = 12, timeoutMs = 45000 } = {}) {
  const res = await fetchRetry(url, { headers: { 'User-Agent': UA }, timeoutMs, retries: 2 });
  const data = new Uint8Array(await res.arrayBuffer());
  const { getDocument } = await lib();
  const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  let out = '';
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out += content.items.map((x) => x.str).join(' ') + ' ';
  }
  await doc.destroy();
  return out.replace(/\s+/g, ' ');
}
