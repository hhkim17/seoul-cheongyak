// Supabase 로그인 · 기기 간 동기화
// 여기 담긴 키는 Supabase가 "공개용"으로 발급한 publishable 키다. 브라우저에 노출되는 것이
// 정상이며, 실제 접근 통제는 테이블의 RLS(행 수준 보안)가 한다.

export const SUPABASE = {
  url: 'https://qihmovkyudfwvdjraagm.supabase.co',
  key: 'sb_publishable_lk5IKQZP2wCvmTohkwAMww_2qw82Tzf',
};

const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

let client = null;
let currentUser = null;

const loadScript = (src) => new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = src; s.onload = res; s.onerror = () => rej(new Error('supabase-js를 불러오지 못했습니다'));
  document.head.appendChild(s);
});

let providers = null;   // 켜져 있는 외부 로그인 제공자

export const user = () => currentUser;
export const hasProvider = (name) => !providers || providers.includes(name);

/** 어떤 로그인 방식이 켜져 있는지 미리 확인한다 (안 켜진 버튼으로 보내지 않기 위해) */
async function loadProviders() {
  try {
    const res = await fetch(`${SUPABASE.url}/auth/v1/settings`, { headers: { apikey: SUPABASE.key } });
    const d = await res.json();
    providers = Object.entries(d.external || {}).filter(([, on]) => on).map(([k]) => k);
  } catch { providers = null; }
  return providers;
}
export const enabled = () => !!SUPABASE.url && !!SUPABASE.key;

/** 로그인 상태가 바뀔 때마다 onChange(user)를 부른다 */
export async function initAuth(onChange) {
  if (!enabled()) return null;
  try {
    if (!window.supabase) await loadScript(CDN);
    client = window.supabase.createClient(SUPABASE.url, SUPABASE.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    await loadProviders();
    const { data } = await client.auth.getSession();
    currentUser = data.session?.user ?? null;
    client.auth.onAuthStateChange((_e, session) => {
      currentUser = session?.user ?? null;
      onChange?.(currentUser);
    });
    onChange?.(currentUser);
    return currentUser;
  } catch (e) {
    console.warn('로그인 기능을 켜지 못했습니다:', e.message);
    return null;
  }
}

/** 비밀번호 없이 메일로 온 링크를 눌러 로그인한다 */
export async function signInWithEmail(email) {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.href.split('#')[0] },
  });
  if (error) throw new Error(error.message);
}

export async function signInWithKakao() {
  if (providers && !providers.includes('kakao')) {
    throw new Error('카카오 로그인이 아직 켜져 있지 않습니다. 아래 이메일 로그인을 쓰거나 Supabase에서 카카오 제공자를 켜 주세요.');
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: location.href.split('#')[0] },
  });
  if (error) throw new Error(error.message);
}

export async function signOut() { await client?.auth.signOut(); }

/** 내 설정을 서버에서 가져온다 (없으면 null) */
export async function pull() {
  if (!client || !currentUser) return null;
  const { data, error } = await client
    .from('profiles')
    .select('profile, scraps, watch, notify_email, updated_at')
    .eq('id', currentUser.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** 내 설정을 서버에 저장한다 */
export async function push({ profile, scraps, watch, notifyEmail }) {
  if (!client || !currentUser) return;
  const { error } = await client.from('profiles').upsert({
    id: currentUser.id,
    email: currentUser.email,
    profile, scraps, watch,
    notify_email: !!notifyEmail,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
