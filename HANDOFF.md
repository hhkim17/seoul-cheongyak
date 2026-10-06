# 이어받기 안내

이 컴퓨터의 **다른 계정**이나 다른 컴퓨터에서 작업을 이어받을 때 필요한 것만 모았습니다.
기능 설명은 [README.md](README.md)에 있습니다.

> **폴더를 복사하지 마세요.** `/Users/hwanheekim/Desktop/seoul-cheongyak` 는 다른 계정에서 읽히지
> 않고, 복사해도 `cache/` 같은 쓰레기만 따라옵니다. 저장소는 공개되어 있으니 새로 받는 편이 깨끗합니다.

---

## 1. 새 계정에서 시작 (5분)

```bash
# 1) 받기 — 공개 저장소라 로그인 없이 됩니다
git clone https://github.com/hhkim17/seoul-cheongyak.git
cd seoul-cheongyak

# 2) 의존성 (pdfjs-dist 하나뿐입니다)
npm install

# 3) 띄우기
./start.sh          # http://localhost:5173
```

처음 열면 인증키를 넣으라는 화면이 나옵니다. 아래 2번의 키를 붙여넣으면 끝입니다.
키는 그 계정의 `config.json` 에만 저장되고 커밋되지 않습니다.

**Node 18 이상**이면 됩니다 (`node -v` 로 확인).

---

## 2. 넘겨야 할 값

저장소에 없는 것은 **딱 하나**입니다. 나머지는 GitHub나 외부 서비스에 이미 들어 있습니다.

| 값 | 어디에 있나 | 새 계정이 해야 할 일 |
|---|---|---|
| **공공데이터포털 인증키** | 기존 계정의 `config.json` (64자) | 같은 키를 다시 넣거나, [포털 마이페이지](https://www.data.go.kr/iim/api/selectAPIAcountView.do)에서 확인 |
| GitHub Actions 비밀값 4개 | GitHub 저장소 Settings → Secrets | 이미 등록돼 있음. 건드릴 일 없음 |
| Supabase URL·공개키 | `public/sync.js` 안 (공개용이라 커밋돼 있음) | 없음 |
| 카카오 REST 키 | Supabase 대시보드 Auth 설정 | 없음 |

GitHub Secrets 에 들어 있는 것: `APPLYHOME_SERVICE_KEY`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_TO`.
**이름만 보이고 값은 다시 볼 수 없습니다.** 잃어버리면 새로 발급해 덮어써야 합니다.

> 인증키를 주고받을 때 메신저나 메일에 그대로 붙이지 마세요. 포털에서 다시 확인하는 쪽이 안전합니다.

---

## 3. 어디서 무엇이 돌아가나

이 프로젝트는 **내 컴퓨터가 꺼져 있어도 돌아갑니다.** 로컬은 개발용일 뿐입니다.

| | 사는 곳 | 하는 일 |
|---|---|---|
| 사이트 | GitHub Pages — https://hhkim17.github.io/seoul-cheongyak/ | 사람들이 보는 화면 |
| 데이터 수집 | GitHub Actions `청약 데이터 갱신` | 몇 시간마다 기관에서 공고를 받아 `docs/data/listings.json` 로 커밋 |
| 메일 알림 | 같은 워크플로의 뒷부분 | 새 공고가 조건에 맞으면 발송 |
| 로컬 서버 | `./start.sh` | 코드 고칠 때만. 안 띄워도 사이트는 멀쩡함 |

**화면 코드만 고쳤다면** 수집을 돌릴 필요 없이 이것으로 충분합니다.

```bash
node build.mjs --assets   # public/ → docs/ 복사 (데이터는 그대로)
```

**데이터까지 새로 받으려면** `node build.mjs` 입니다. 5분쯤 걸립니다.

---

## 4. GitHub 에 올리려면

저장소는 `hhkim17` 소유입니다. 다른 계정에서 **읽기는 그냥 되지만 쓰기는 권한이 필요**합니다.
둘 중 하나를 고르세요.

```bash
# 방법 A — 같은 GitHub 계정으로 로그인 (가장 간단)
gh auth login
```

방법 B — 다른 GitHub 계정을 쓸 거라면, `hhkim17` 로 로그인해서
Settings → Collaborators 에 그 계정을 추가합니다.

`./start.sh` 는 코드가 바뀔 때마다 자동으로 커밋·푸시합니다(`autosync.mjs`).
끄고 싶으면 `NO_AUTOSYNC=1 ./start.sh`.
자동 푸시에는 `config.json` 이나 `.env` 가 섞이면 중단하는 장치가 들어 있습니다.

---

## 5. 지금 열려 있는 일

이어받는 사람이 바로 집을 수 있게 적어 둡니다. (2026-10-06 기준)

1. **HUG 든든전세 마감일이 두 군데서 다릅니다.**
   목록 표는 `10.12`, 공고문 본문은 `신청접수 9.30 10:00 ~ 10.8 17:00` 입니다.
   지금 사이트는 목록 값(10.12)을 쓰고 있어, 더 이른 공고문 쪽으로 맞추는 게 안전합니다.
   `scrape.mjs` 의 `scrapeHug()` 가 목록 표에서 기간을 읽습니다.

2. **구독자 메일이 동작하지 않습니다.**
   `SUPABASE_URL`·`SUPABASE_SERVICE_KEY` 시크릿이 없어서, 사이트에서 메일을 남긴 사람에게는
   알림이 가지 않고 `MAIL_TO` 한 명에게만 갑니다. 워크플로 로그에
   `Supabase 설정이 없어 구독자 목록은 건너뜁니다` 로 찍힙니다.

3. **자치구가 안 적힌 공고가 있습니다.**
   SH 게시판 목록에 구 정보가 없어서, 자치구 필터를 걸면 그 공고들이 빠집니다.
   화면에 몇 건이 빠지는지는 적어 두었습니다.

---

## 6. 되풀이된 함정

같은 데서 또 막히지 않도록, 실제로 겪은 것만 적습니다.

**0건을 "없다"로 읽지 마세요.** HUG 든든전세가 늘 0건이었는데, 그냥 열면
`view_Count=N` 이라 목록을 안 주는 페이지였습니다. 실제로는 418호가 접수 중이었습니다.
출처가 0건이면 반드시 **원본 페이지를 직접 열어** 비었는지 확인하세요. 소스 패널의
`원본 ↗` 링크가 그 용도입니다.

**청약홈은 장애일 때 오류 대신 `totalCount: 0` 을 줍니다.** 그래서 `health.mjs` 가
출처별로 "있던 게 사라졌는지"를 봅니다. 건수 합계만 보면 다른 출처가 늘어 가려집니다.

**캐시 키에 한글이 들어가면 뭉개집니다.** 파일명 치환으로 `…:강서구` 와 `…:금천구` 가
같은 파일이 되어 서로의 데이터를 덮어썼습니다. 지금은 해시를 붙여 막아 뒀습니다.

**공고문 날짜 서식이 제각각입니다.** `‘26.9.9.`, `2026년 8월 11일`, `2026.08.20.~2026.08.26`,
공백이 지워져 붙어 버린 `26.09.1026.09.10~` 까지 나옵니다. 새 서식이 나오면
빌드가 `접수기간을 못 읽은 모집공고 N건` 으로 알려 주고 제목·링크를 로그에 남깁니다.

**화면 조각 하나가 전체를 죽일 수 있습니다.** 공고 한 건에서 `analyze()` 가 터져 목록이
통째로 빈 적이 있습니다. 지금은 실패한 건만 「표시 오류」로 두고 나머지는 삽니다.

---

## 7. 건강 상태 확인

이어받은 뒤 제대로 돌아가는지 한 번에 보려면:

```bash
curl -s https://hhkim17.github.io/seoul-cheongyak/data/listings.json | node -e '
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
console.log("공고", d.listings.length, "건 |", new Date(d.builtAt).toLocaleString("ko-KR"));
console.log("출처 정상", (d.sources||[]).filter(s=>s.state==="ok").length+"/"+(d.sources||[]).length);
console.log("진단", JSON.stringify(d.health?.issues||[]));'
```

정상이면 공고 300건 내외, 출처 9/9, 진단 `[]` 입니다.
사이트 상단에 **「갱신이 밀리고 있습니다」**가 뜨면 Actions 가 멈춘 것이니
저장소 Actions 탭에서 `청약 데이터 갱신` 을 열어 `Run workflow` 를 눌러 보세요.
