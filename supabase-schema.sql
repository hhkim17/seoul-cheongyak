-- 서울 청약 대시보드 — Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 이 내용을 붙여 넣고 Run 하세요. 한 번만 하면 됩니다.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  profile      jsonb   not null default '{}'::jsonb,   -- 내 조건(가점·예산·면적 등)
  scraps       text[]  not null default '{}',          -- 스크랩한 공고 id
  watch        jsonb   not null default '{}'::jsonb,   -- 메일 알림 조건
  notify_email boolean not null default false,         -- 알림 수신 여부
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 로그인한 사람은 자기 행만 읽고 쓸 수 있다.
-- (알림 발송은 service_role 키로 서버에서 읽으므로 이 정책의 영향을 받지 않는다)
drop policy if exists "본인 행 조회" on public.profiles;
create policy "본인 행 조회" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "본인 행 생성" on public.profiles;
create policy "본인 행 생성" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "본인 행 수정" on public.profiles;
create policy "본인 행 수정" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 알림 대상자를 빠르게 찾기 위한 인덱스
create index if not exists profiles_notify_idx on public.profiles (notify_email) where notify_email;
