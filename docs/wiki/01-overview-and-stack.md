# 01 · 개요와 스택

[← 홈](README.md) · 다음: [데이터 파이프라인 →](02-data-pipeline.md)

## 무엇을 만드나

두 가지를 한 사이트에서 제공한다.

- **레퍼런스**: 시계피 전체 직업(183종)·공식 시트·기본 규칙을 한·영 병기로 열람.
- **디지털 그리모어**: 이야기꾼이 시트로 게임을 열고, 노트북에서 좌석·직업·상태를 관리하며
  진행. 같은 WiFi의 폰으로 직업 배포(30초 잠금)·직업 공유·행동 결과 보여주기까지 하는 로컬 도구.
- **내역·통계**: 게임마다 이름을 붙여 내역에서 검색·필터, 종료 게임은 통계(플레이어 승률·진영·직업)로 집계.
- **PNG 내보내기**: 시트(스크립트)별로 직업 설명 시트 + 밤 순서·징크스 시트를 A4 1장씩 PNG로 저장
  (`/sheets/[id]/export`). 인쇄·공유용 인쇄물. 자세한 동작은 [스토리텔러 도구](09-storyteller-tools.md) 참조.

## 왜 이렇게 만들었나 (배경)

오프라인 모임에서 종이 그리모어/물리 토큰은 준비·진행이 번거롭다. 인터넷 의존 없이
**노트북 한 대로 LAN에서 도는** 도구가 필요했다. 그래서 콘텐츠는 로컬에 박제하고, 진행 상태는
로컬 DB에 저장하며, 서버를 `0.0.0.0`에 바인딩한다.

## 기술 스택과 이유

| 영역 | 선택 | 왜 |
|---|---|---|
| 프레임워크 | **Next.js 16.2.7** (App Router, Turbopack) | 한 프로세스로 정적 콘텐츠 + 서버 액션(가변 게임 상태)을 동시에. 로컬 Node 서버로 LAN 노출이 자연스러움 |
| UI | React 19.2.4 + TypeScript | — |
| 스타일 | Tailwind v4 | 설정 파일 없이 `@theme`로 토큰 정의 ([app/globals.css](../../app/globals.css)) |
| 저장소 | **better-sqlite3 12** (동기 API) | 단일 파일 로컬 DB. 동기라 서버 컴포넌트/액션에서 `await` 없이 즉시 질의 → SSG·SSR 단순. [next.config.ts](../../next.config.ts)에서 `serverExternalPackages`로 번들 제외(네이티브 모듈) |
| PNG 캡처 | **modern-screenshot 4** (`domToPng`) | 스크립트 PNG 내보내기에서 A4 시트 DOM을 300DPI PNG로 캡처. 클라이언트 전용([components/ScriptExporter.tsx](../../components/ScriptExporter.tsx)) |

## LAN 구동

[package.json](../../package.json):

```jsonc
"dev":   "next dev -H 0.0.0.0",
"start": "next start -H 0.0.0.0",
"party": "node scripts/party.mjs",          // 모임용 production 실행
"db:seed":   "node scripts/seed-db.mjs",   // data/*.json → db/grimoire.db
"predev":    "node scripts/seed-db.mjs",    // dev/build 전 자동 시드
"prebuild":  "node scripts/seed-db.mjs",
"data:scrape": "node scripts/scrape-vnamu.mjs && node scripts/seed-db.mjs"
```

- 개발: `npm run dev` → `http://localhost:3000`
- **실제 모임: `npm run party`** ([scripts/party.mjs](../../scripts/party.mjs)) — production
  빌드로 실행해 dev 모드의 온디맨드 컴파일 멈춤·HMR 모듈 그래프 꼬임을 원천 차단.
  기존 빌드 재사용(코드 고쳤으면 `npm run party -- --rebuild`), 시작 시 폰용 LAN 주소 출력.
- 폰(같은 WiFi): `http://<노트북IP>:3000` — 사설대역(192.168 > 10 > 172.16-31) 우선 감지.
- **외부 공유(ngrok 등)**: 터널로 열 땐 cross-origin이라 서버액션/리소스가 막힌다 →
  [next.config.ts](../../next.config.ts)가 `*.ngrok-free.app` 등을 `allowedDevOrigins` +
  `serverActions.allowedOrigins`에 등록해 허용.

---
[← 홈](README.md) · 다음: [데이터 파이프라인 →](02-data-pipeline.md)
