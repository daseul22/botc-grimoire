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
6. **행동 결과는 열거 대신 입력 위젯만 구조화** — 직업 183종의 결과를 다 모델링하지 않고
   `ResultKind` 6종 + 자유 텍스트로 커버. 결과는 문자열 저장. → [09 운영 도구](09-storyteller-tools.md)

## 확장 가이드

- **직업 데이터 갱신**: `npm run data:scrape`(재수집) 또는 [data/characters.json](../../data/characters.json)
  직접 수정 후 `npm run db:seed`.
- **새 상태이상**: [lib/markers.ts](../../lib/markers.ts)의 `MARKERS`에 추가(아이콘은 `public/icons`
  직업 토큰 재사용). 지속은 `phase`/`dusk`/`permanent`. 직업을 가리키면 `roleParam:true`
  (param=직업 id, [MarkerToken](../../components/MarkerToken.tsx)이 직업 심볼 렌더). `scope:"global"`은
  게임 전체 효과(Vortox·일식), `taints:true`는 정보 직업에 거짓 정보 경고를 띄움.
  한 좌석에 여러 인스턴스가 공존해야 하면(능력획득·능력없음) `multi:true`(SelectionPanel이 칩별
  개별 제거 + 추가 UI로 처리).
- **직업별 행동 조정**: 동작은 코드가 아니라 **데이터**다 → [data/behaviors.json](../../data/behaviors.json)
  (공식 기본값)에서 `{targets,result,marker,showcase}` 수정. 플래그: `oncePerGame`(사용 후 `능력 사용함`)·
  `deathTriggered`(사망 발동, 까마귀지기)·`playerPicks`(폰에서 직접 직업 선택 → `직업 목록` 버튼).
  타입 정의는 [lib/behaviors.ts](../../lib/behaviors.ts), 조회는 [night-actions.ts](../../lib/night-actions.ts).
  고친 뒤 `npm run verify:behaviors`로 의도치 않은 변화가 없는지 확인한다. (→ [12](12-custom-characters.md))
- **새 직업 추가**: 코드를 고칠 필요 없다 — `/characters/custom`의 빌더에서 기능을 조합해 만든다.
  기능(결과 종류·마커·보여주기 슬롯) 자체를 늘리려면 `ResultKind`/`MARKERS`/`ShowcaseToken`에 추가하고
  [lib/ability-catalog.ts](../../lib/ability-catalog.ts)에 설명을 넣으면 빌더 UI가 따라온다. → [12](12-custom-characters.md)
- **새 게임 동작**: [lib/games/](../../lib/games/)의 알맞은 모듈에 함수(`index.ts` 재수출) →
  [app/play/actions.ts](../../app/play/actions.ts)에 액션(반환 `Game`) → PlayCanvas에서 `run(...)`.
  모듈 분담: `lifecycle.ts`(생성·복제·재추첨·페이즈 전환·종료·복기·삭제), `seats.ts`(좌석 조작),
  `meta.ts`(전역 메타: 블러핑·claim·미치광이·위장), `phase-data.ts`(행동·투표·메모·타이머), `undo.ts`.
  페이즈별 데이터는 `game_phases`의 컬럼/사이드 테이블에, 전역 값은 `games`/`game_players`에.
- **순수 클라/서버 공용 로직**: DB·React에 의존하지 않는 계산은 별도 순수 모듈로 뺀다.
  좌석 자동 배치는 [lib/seat-layout.ts](../../lib/seat-layout.ts)(`autoRectSides`·`rectPositions`·
  `sidesTotal`)에 있고, 원형 배치는 PlayCanvas 인라인이다. 이런 모듈은 서버 빌드 가드 없이 양쪽에서 쓴다.
- **규칙 텍스트**: [data/rules.json](../../data/rules.json) 직접 수정(수기 관리).

## 향후: 멀티 디바이스 실시간 동기화

현재는 이야기꾼 단일 화면이 권위(authority). 폰 플레이어 뷰(`/play/[gameId]/seat`,
[SeatView](../../components/SeatView.tsx))는 **읽기 전용으로 먼저 구현**됐고 화면이 보일 때만 15초 폴링으로 갱신한다.
실시간으로 가려면 폴링을 푸시(SSE·WebSocket)로 바꾸고 `getGame` 위에 얹으면 된다.
**데이터 모델(페이즈 스냅샷)은 이미 그걸 견디게 설계돼 있다.** (→ [09](09-storyteller-tools.md))

남은 후보: 좌석 인증, 실행 취소(undo), 정보 직업 결과 자동 추천.

## 용어

- **이야기꾼(Storyteller)**: 진행자. 그리모어를 보는 유일한 사람.
- **그리모어(Grimoire)**: 전체 좌석·직업·상태를 한눈에 보는 진행자 보드.
- **페이즈(Phase)**: 밤(night) / 낮(day). 일차(day number)와 함께 진행.
- **스냅샷(Snapshot)**: 한 페이즈 시점의 상태(좌석별 생사·마커, 그날 행동·투표·메모). `game_phases`의 한 행.
- **마커(Marker)**: 상태이상(중독·취함·보호·사망예정·레드헤링·변절예정) + 직업 토큰 마커(집착·직업변경·능력획득·능력없음) + 글로벌 마커(Vortox 영향·특수 상태). `phase`/`dusk`/`permanent` 지속 규칙을 가짐. 능력획득·능력없음은 `multi`(한 좌석에 여러 인스턴스 공존).
- **행동 기록 / 주장(블러핑)**: 직업이 받은 결과 / 아무나 임의 직업을 공개 주장한 것. → [09](09-storyteller-tools.md)
- **유령표(데드 보트)**: 사망자에게 1회 주어지는 투표권.
- **레드헤링**: 점쟁이에게 악마로 보이는 선한 플레이어.
- **징크스(Jinx)**: 특정 두 직업이 함께 있을 때의 상호작용 규칙.
- **셋업 직업**: 게임 구성(인원 분포)을 바꾸는 직업(능력문에 `[...]`). 1일차 밤 배너로 안내.
- **에디션/시트**: 직업 묶음. 공식 3종(트러블 브루잉·배드 문 라이징·종파의 제비꽃) + 설화 + 기타.
- **위장(Disguise)**: 본인이 자기 진짜 직업을 모르는 직업(미치광이·주정뱅이·꼭두각시)에게 폰에서 보여줄 가짜 직업. `game.disguises`(좌석→직업 id).
- **진영 구분 용어**: 직업 설명(`data/characters.json`)·**동작 데이터**(`data/behaviors.json`)·UI 문구·마커 라벨을 정규어로 통일 — Townsfolk=**마을주민**, Outsider=**외지인**, Minion=**하수인**, Demon=**악마**. `nominate`=지목, `in play`=게임에 있는, reminder token=리마인더. 직업명 음차(레크루스·스파이)도 **은둔자·첩자**로 통일한다.
  - 폐기어를 새로 치환할 때는 **조사까지 확인**한다 — `데몬`(받침 O)→`악마`(받침 X)처럼 받침이 바뀌면 `데몬이`→`악마가`, `데몬으로`→`악마로`로 함께 보정해야 한다(단순 치환만 하면 "악마이 있는가"가 된다).
  - `npm run verify:behaviors`가 **폐기어 잔존을 잡는다**(원본 쪽에만 정규화 적용). 새 폐기어를 정리했다면 그 규칙을 [verify-behaviors.ts](../../scripts/verify-behaviors.ts)의 `TERM_FIXES`에도 추가한다. → [02 2차 정리](02-data-pipeline.md)
  - 한국어 직업 설명 일관성 검수 기록은 [docs/번역-일관성-조사-보고서.md](../번역-일관성-조사-보고서.md)(wiki 외 작업 산출물, 용어표에 폐기어를 인용하므로 치환 대상이 아니다).

---
[← 컴포넌트](07-components.md) · [홈](README.md) · 다음: [이야기꾼 운영 도구 →](09-storyteller-tools.md)
