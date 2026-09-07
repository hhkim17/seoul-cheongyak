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

const user = process.env.MAIL_USERNAME;
const pass = process.env.MAIL_PASSWORD;
if (!user || !pass) { console.log('메일 계정이 없어 발송을 건너뜁니다.'); process.exit(0); }

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
  console.error('::error::지메일이라면 MAIL_PASSWORD가 계정 비밀번호가 아니라 앱 비밀번호(16자리)여야 합니다.');
  console.error('::error::https://myaccount.google.com/apppasswords');
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
