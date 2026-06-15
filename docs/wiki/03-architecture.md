# 03 · 아키텍처

[← 데이터 파이프라인](02-data-pipeline.md) · [홈](README.md) · 다음: [그리모어 엔진 →](04-grimoire-engine.md)

## 레이어 지도

```mermaid
flowchart TD
  subgraph pure["순수 모듈 (클라/서버 공용, DB 의존 없음)"]
    CO[constants.ts]
    GR[grouping.ts]
    MK[markers.ts]
    RA[ratio.ts]
    TY[types.ts]
    NA[night-actions.ts]
    SL[seat-layout.ts]
  end
  subgraph server["서버 전용 (better-sqlite3)"]
    DBm[db.ts]
    DA[data.ts]
    CS[custom-sheets.ts]
    GA[games.ts]
  end
  DBm --> DA & CS & GA
  DA --> CS & GA
  subgraph actions["서버 액션 ('use server')"]
    SA[sheets/actions.ts]
    PA[play/actions.ts]
  end
  CS --> SA
  GA --> PA
  RA --> PA
  subgraph ui["컴포넌트"]
    SC[서버 컴포넌트 · page.tsx]
    CC[클라이언트 컴포넌트]
  end
  DA --> SC
  GA --> SC
  SA --> CC
  PA --> CC
```

## 경계 규칙 (중요)

`better-sqlite3`를 import하는 모듈([db.ts](../../lib/db.ts) · [data.ts](../../lib/data.ts) ·
[custom-sheets.ts](../../lib/custom-sheets.ts) · [lib/games/](../../lib/games/))은 **서버 전용**.
클라이언트 컴포넌트가 실수로 import하면 **빌드가 깨진다**(의도된 가드).

그래서 클라에서 쓰는 로직은 전부 **순수 모듈**로 분리:
[constants](../../lib/constants.ts)(팀·에디션) · [grouping](../../lib/grouping.ts)(팀 그룹핑) ·
[markers](../../lib/markers.ts)(상태이상·직업토큰 마커) · [ratio](../../lib/ratio.ts)(인원 비율) ·
[night-actions](../../lib/night-actions.ts)(직업별 야간/낮 행동 스펙·정보 능력 오인 경고) ·
[seat-layout](../../lib/seat-layout.ts)(사각 좌석 자동 배분·둘레 좌표) · [types](../../lib/types.ts).

[db.ts](../../lib/db.ts)는 `process.cwd()/db/grimoire.db`를 `fileMustExist`로 연다(시드 안 됐으면
명확히 실패 → `npm run db:seed`). WAL 모드.

## 라우트 맵

| 경로 | 종류 | 설명 |
|---|---|---|
| `/` | 정적 | 직업 목록 + 필터/검색 |
| `/characters/[id]` | SSG (183) | 직업 상세 + 한/영 토글 |
| `/sheets` | 동적 | 공식 + 커스텀 시트 목록 |
| `/sheets/[id]` | SSG+동적 | 시트 상세 + 야간순서표 + `시작하기` + `PNG 내보내기` |
| `/sheets/[id]/export` | SSG+동적 | 직업 설명 + 밤 순서·징크스 A4 PNG 내보내기 ([09](09-storyteller-tools.md)) |
| `/sheets/new`, `/sheets/[id]/edit` | 정적/동적 | 커스텀 시트 생성·수정 |
| `/rules` | 정적 | 규칙 + 목차 |
| `/games` | 동적 | 게임 목록(내역) — 검색·필터·게임별 이름 지정 |
| `/stats` | 동적 | 통계 — 종료 게임 집계(플레이어 순위·게임별 기록) |
| `/play/setup/[sheetId]` | 동적 | 준비 스텝 |
| `/play/[gameId]` | 동적 | 진행 스텝(이야기꾼) 또는 복기 |
| `/play/[gameId]/seat` | 동적 | 폰 플레이어 뷰 — 자기 자리 직업만 ([09](09-storyteller-tools.md)) |
| `/play/[gameId]/show/[seat]` | 동적 | 보여주기 풀스크린(`?as=`·`?mode=`·`?v=`) ([09](09-storyteller-tools.md)) |
| `/play/[gameId]/pick/[seat]` · `/claim` | 동적 | 직업 목록(플레이어 선택) · 잠금 직업배포 |

콘텐츠는 정적/SSG(빌드 시 SQLite 읽음), 게임·커스텀시트는 `force-dynamic`(가변).

## 커스텀 시트 — [lib/custom-sheets.ts](../../lib/custom-sheets.ts)

`custom_sheets` + `custom_sheet_characters` 테이블에 저장. 콘텐츠 테이블과 분리돼 있어
**재시드해도 보존**된다. CRUD는 [app/sheets/actions.ts](../../app/sheets/actions.ts) 서버 액션.

---
[← 데이터 파이프라인](02-data-pipeline.md) · [홈](README.md) · 다음: [그리모어 엔진 →](04-grimoire-engine.md)
