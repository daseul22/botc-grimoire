# 08 · 설계 결정 · 확장 · 용어

[← 컴포넌트](07-components.md) · [홈](README.md) · 다음: [이야기꾼 운영 도구 →](09-storyteller-tools.md)

## 핵심 설계 결정 (왜 이렇게?)

1. **JSON 시드 + SQLite 런타임** — 사람이 고치는 진실(JSON, 커밋) vs 기계가 굽는 캐시(DB, 무시).
   변경이 diff로 보이고 언제든 재현된다. → [02 데이터 파이프라인](02-data-pipeline.md)
2. **정체성 ↔ 페이즈 스냅샷 분리** — 되돌리기·복기·과거 수정을 cascade 없이 가능하게 하는 단
   하나의 결정. → [04 그리모어 엔진](04-grimoire-engine.md)
3. **액션이 Game을 반환 → setGame** — 로컬 단일 사용자(이야기꾼)라 서버 권위 값으로 단순화.
   → [05 상태 동기화](05-state-sync.md)
4. **시트 전체를 클라에 전달** — 직업이 바뀌는 모든 인터랙션을 서버 왕복 없이 즉시 렌더.
5. **순수 모듈 분리** — 클라/서버 공용 로직과 DB 의존 코드를 갈라 빌드 가드를 명확히.
   → [03 아키텍처](03-architecture.md)
6. **행동 결과는 열거 대신 입력 위젯만 구조화** — 직업 150종의 결과를 다 모델링하지 않고
   `ResultKind` 6종 + 자유 텍스트로 커버. 결과는 문자열 저장. → [09 운영 도구](09-storyteller-tools.md)

## 확장 가이드

- **직업 데이터 갱신**: `npm run data:scrape`(재수집) 또는 [data/characters.json](../../data/characters.json)
  직접 수정 후 `npm run db:seed`.
- **새 상태이상**: [lib/markers.ts](../../lib/markers.ts)의 `MARKERS`에 추가(아이콘은 `public/icons`
  직업 토큰 재사용). 지속은 `phase`/`dusk`/`permanent`. 직업을 가리키면 `roleParam:true`
  (param=직업 id, [MarkerToken](../../components/MarkerToken.tsx)이 직업 심볼 렌더).
- **직업별 행동 조정**: [lib/night-actions.ts](../../lib/night-actions.ts)의 `ACTION_SPECS`(밤)/
  `DAY_ACTION_SPECS`(낮)에서 `{targets,result,marker}` 수정. 결과 종류를 늘리려면 `ResultKind` +
  [ActionFields](../../components/ActionFields.tsx) 위젯 추가. (→ [09](09-storyteller-tools.md))
- **새 게임 동작**: [lib/games/](../../lib/games/)의 알맞은 모듈에 함수(`index.ts` 재수출) →
  [app/play/actions.ts](../../app/play/actions.ts)에 액션(반환 `Game`) → PlayCanvas에서 `run(...)`.
  페이즈별 데이터는 `game_phases`의 컬럼/사이드 테이블에, 전역 값은 `games`/`game_players`에.
- **규칙 텍스트**: [data/rules.json](../../data/rules.json) 직접 수정(수기 관리).

## 향후: 멀티 디바이스 실시간 동기화

현재는 이야기꾼 단일 화면이 권위(authority). 폰 플레이어 뷰(`/play/[id]/seat`,
[SeatView](../../components/SeatView.tsx))는 **읽기 전용으로 먼저 구현**됐고 5초 폴링으로 갱신한다.
실시간으로 가려면 폴링을 푸시(SSE·WebSocket)로 바꾸고 `getGame` 위에 얹으면 된다.
**데이터 모델(페이즈 스냅샷)은 이미 그걸 견디게 설계돼 있다.** (→ [09](09-storyteller-tools.md))

남은 후보: 좌석 인증, 실행 취소(undo), 정보 직업 결과 자동 추천.

## 용어

- **이야기꾼(Storyteller)**: 진행자. 그리모어를 보는 유일한 사람.
- **그리모어(Grimoire)**: 전체 좌석·직업·상태를 한눈에 보는 진행자 보드.
- **페이즈(Phase)**: 밤(night) / 낮(day). 일차(day number)와 함께 진행.
- **스냅샷(Snapshot)**: 한 페이즈 시점의 상태(좌석별 생사·마커, 그날 행동·투표·메모). `game_phases`의 한 행.
- **마커(Marker)**: 상태이상(중독·취함·집착·보호·사망예정·레드헤링) + 직업 토큰 마커(직업변경·능력획득). 지속 규칙을 가짐.
- **행동 기록 / 주장(블러핑)**: 직업이 받은 결과 / 아무나 임의 직업을 공개 주장한 것. → [09](09-storyteller-tools.md)
- **유령표(데드 보트)**: 사망자에게 1회 주어지는 투표권.
- **레드헤링**: 점쟁이에게 악마로 보이는 선한 플레이어.
- **징크스(Jinx)**: 특정 두 직업이 함께 있을 때의 상호작용 규칙.
- **셋업 직업**: 게임 구성(인원 분포)을 바꾸는 직업(능력문에 `[...]`). 1일차 밤 배너로 안내.
- **에디션/시트**: 직업 묶음. 공식 3종(트러블 브루잉·배드 문 라이징·종파의 제비꽃) + 로릭 + 기타.

---
[← 컴포넌트](07-components.md) · [홈](README.md) · 다음: [이야기꾼 운영 도구 →](09-storyteller-tools.md)
