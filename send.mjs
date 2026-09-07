#!/usr/bin/env node
// notify/outbox.json 에 준비된 메일을 SMTP로 보낸다.
// 사람마다 조건이 달라 메일 내용이 다르므로, 한 통씩 따로 보낸다.
//   MAIL_USERNAME / MAIL_PASSWORD (앱 비밀번호) / MAIL_HOST / MAIL_PORT

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUTBOX = path.join(ROOT, 'notify', 'outbox.json');

if (!fs.existsSync(OUTBOX)) { console.log('보낼 메일이 없습니다.'); process.exit(0); }

const user = (process.env.MAIL_USERNAME || '').trim();
// 구글은 앱 비밀번호를 'abcd efgh ijkl mnop'처럼 띄어 보여주지만 실제 값은 공백 없는 16자다
const rawPass = process.env.MAIL_PASSWORD || '';
const pass = rawPass.replace(/\s+/g, '');
if (!user || !pass) { console.log('메일 계정이 없어 발송을 건너뜁니다.'); process.exit(0); }

// 값 자체는 로그에 남기지 않고, 어긋난 곳을 짚을 수 있는 단서만 남긴다
console.log(`발신 계정 도메인: @${user.split('@')[1] || '(없음)'}`);
console.log(`앱 비밀번호 길이: ${pass.length}자 (공백 제거 전 ${rawPass.length}자)`);
if (pass.length !== 16) {
  console.log('::warning::구글 앱 비밀번호는 공백을 뺀 16자입니다. 길이가 다르면 계정 비밀번호를 넣었을 수 있습니다.');
}

const transport = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.MAIL_PORT || 465),
  secure: true,
  auth: { user, pass },
});

try {
  await transport.verify();
} catch (e) {
  console.error(`::error::SMTP 로그인 실패 — ${e.message}`);
  console.error(`::error::확인 1) 앱 비밀번호를 만든 구글 계정과 MAIL_USERNAME(@${user.split('@')[1] || '?'})이 같은 계정이어야 합니다.`);
  console.error('::error::확인 2) 계정 비밀번호가 아니라 앱 비밀번호(공백 뺀 16자)여야 합니다 — https://myaccount.google.com/apppasswords');
  console.error('::error::확인 3) 해당 계정에 2단계 인증이 켜져 있어야 합니다.');
  process.exit(1);
}

const outbox = JSON.parse(fs.readFileSync(OUTBOX, 'utf8'));
let sent = 0;
for (const mail of outbox) {
  try {
    await transport.sendMail({
      from: `서울 청약 대시보드 <${user}>`,
      to: mail.to, subject: mail.subject, html: mail.html,
    });
    console.log(`보냄: ${mail.to}`);
    sent++;
  } catch (e) {
    console.error(`::warning::${mail.to} 발송 실패 — ${e.message}`);
  }
}
console.log(`${sent}/${outbox.length}통 발송 완료`);
