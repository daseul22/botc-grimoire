# 09 · 이야기꾼 운영 도구

[← 설계 결정·확장](08-decisions-and-extending.md) · [홈](README.md)

[04 그리모어 엔진](04-grimoire-engine.md)이 "정체성↔스냅샷" 뼈대라면, 이 문서는 그 위에 얹은
**실제 진행 보조 기능**들이다. 공통 원칙: 무슨 일이 있었는지를 **해당 페이즈 스냅샷에 기록**하고,
복기에서 페이즈별로 다시 보여준다. 정체성을 덮어쓰지 않으므로 과거 기록이 안 깨진다.

> 게임 로직은 [lib/games/](../../lib/games/) 모듈로 분할돼 있다: `index.ts`(허브) ·
> `schema.ts`(DDL·마이그레이션) · `lifecycle.ts`(생성·조회·페이즈·이름변경) · `seats.ts`(좌석 조작) ·
> `phase-data.ts`(행동·투표·완료·메모·타이머) · `meta.ts`(블러핑·claim·전역마커·미치광이·disguise) ·
> `stats.ts`(종료 게임 통계·닉네임 집계) · `undo.ts`(실행 취소).

## 무엇이 어디에 저장되나

| 데이터 | 저장 위치 | 범위 | 모듈 |
|---|---|---|---|
| 야간/낮 행동·주장 | `game_phase_actions(actions JSON)` | 페이즈별 | [phase-data.ts](../../lib/games/phase-data.ts) |
| 지목·투표 | `game_phases.votes` | 페이즈별 | phase-data.ts |
| 처리 완료 체크 | `game_phases.done` | 페이즈별 | phase-data.ts |
| 낮 타이머(밀담·공개토론) | `game_phases.timers` | 페이즈별 | phase-data.ts |
| 사망 원인 | `game_phases.state[seat].cause` | 페이즈별 | phase-data.ts |
| 마커(상태이상·직업토큰) | `game_phases.state[seat].markers[]` | 페이즈별 | [markers.ts](../../lib/markers.ts) |
| 전역 마커(Vortox 영향 등) | `games.global_markers` | 전역 | [meta.ts](../../lib/games/meta.ts) |
| 악마 블러핑 3직업 | `games.bluffs` | 전역 | meta.ts |
| 미치광이 가짜 블러핑/하수인 | `games.lunatic_bluffs` / `lunatic_minions` | 전역 | meta.ts |
| 가짜 직업(disguise) | `games.disguises` (좌석→직업id) | 전역 | meta.ts |
| 직업배포 점유(claim) | `games.claimed` (좌석→점유시각ms) | 전역 | meta.ts |
| 실행 취소 스택 | `game_undo_stack` (스냅샷 직렬화) | 전역 | [undo.ts](../../lib/games/undo.ts) |
| 유령표 사용 여부 | `game_players.ghost_vote_used` | 전역 | seats.ts |
| 플레이어별 누적 메모 | `game_players.memo` | 전역 | seats.ts |

규칙: **페이즈마다 달라지는 건 스냅샷(game_phases), 게임 내내 한 값인 건 전역(games/game_players).**

## 야간/낮 행동 기록 — [lib/night-actions.ts](../../lib/night-actions.ts)

"직업이 누구를 지목해서 무슨 결과를 받았는가". 직업 종류가 많아 **결과를 열거하지 않고**,
입력 위젯만 직업별로 구조화한다.

> **스펙의 출처**: 아래 `ActionSpec` 값들은 이제 소스코드가 아니라 [data/behaviors.json](../../data/behaviors.json)
> (공식 기본값) + DB 오버레이(커스텀 직업·수정분)에 있고, `night-actions.ts`는 **조회 계층**이다.
> 함수 시그니처(`actionSpec`·`specForPhase` 등)는 그대로라 이 문서의 나머지 설명은 유효하다. → [12](12-custom-characters.md)

```ts
type ActionSpec = {
  targets: number;            // 지목 좌석 수 상한 (본인 좌석도 지목 가능 — 임프 자결 등)
  result: ResultKind;         // "none"|"number"|"yesno"|"role"|"team"|"text" → 입력 위젯 결정
  marker?: string;            // 결과로 대상에 적용 제안할 마커
  hint?: string;
  showcase?: ShowcaseSpec | ShowcaseSpec[];  // 보여주기 화면 템플릿 (아래 참조)
  showcaseLabels?: string[];                 // 배열일 때 버튼 라벨(정확/이웃 등)
  oncePerGame?: boolean;      // 게임당 1회 → 사용 후 noability:<직업> 마커 + "능력 사용함"
  deathTriggered?: boolean;   // 사망 시 발동(까마귀지기) → 죽어도 흐리지 않음
  playerPicks?: boolean;      // 플레이어가 폰에서 직접 직업 선택 → "직업 목록" 버튼 노출
  info?: boolean;             // result가 INFO_KINDS 밖(text)이지만 실질 정보 능력 → TaintWarning 대상(꿈꾸는 자)
};
```

- `ACTION_SPECS`(야간) / `DAY_ACTION_SPECS`(낮) / **`OTHER_NIGHT_SPECS`(그 외 밤 오버라이드)**.
  첫밤과 그 외 밤 행동이 다른 직업용 — 예: 메제펠레스는 첫밤=비밀 단어(text),
  그 외 밤=단어를 말한 변절자 1명 지목+변절 마커+보여주기. `nightActionSpec(id, isFirstNight)`,
  `specForPhase(id, phase, day?)`가 맞는 스펙을 고른다(복기 포함).
- 누가 행동하는지·순서는 데이터(`firstNight`/`otherNight`)가 정한다 → 능력문 파싱 불필요.
- 결과는 종류와 무관하게 **문자열로 저장**, `formatResult()`로 표시.
- 행동 기록을 저장하면 그 좌석의 처리 완료 ✓가 자동으로 켜진다.

저장: `NightActionRecord { actorSeat, characterId, targets[], result, bluff? }` 배열을
페이즈별 `game_phase_actions`에 둔다. **다음 페이즈로 복사하지 않는다**(그날 밤 고유).

UI: 순서 사이드바 각 행의 인라인 편집기([NightActionRow](../../components/NightActionRow.tsx)),
지목 칩+결과 위젯은 [ActionFields](../../components/ActionFields.tsx) 공용.

**오인 경고(은둔자·첩자)**: `INFO_KINDS`(number/yesno/role/team)에 해당하는 정보 능력일 때만,
대상 버튼에 `MISREGISTER_ROLES`(`recluse`=선을 악으로, `spy`=악을 선으로) 경고를 단다 —
`⚠` 표시·amber ring·툴팁(`misregisterWarn`). 선택된 대상이 트랩 직업이면 하단에 설명 줄을 띄운다.
폰으로 운영하는 ST가 대상의 진짜 직업을 못 봐 점쟁이가 은둔자를 선으로 알려주는 식의 실수를 막는다.
별도 데이터 플래그가 없어 명시 목록으로 관리(능력문 자동검출은 군단병 등 오탐이 많음).

## 결과 자동 추천 — [lib/action-suggest.ts](../../lib/action-suggest.ts)

그리모어 상태(좌석 링·진영·생사·마커·전역마커)로 정보 직업이 받을 결과를 **미리 계산해 기본값/근거/이웃**을
ST에게 제시한다. 자동 제출이 아니라 *제안*이며 ST가 덮어쓸 수 있다. 순수 모듈로 분리(클라/서버 공용, 테스트 용이).

- **`suggestAction(ctx)`**: 등재된 직업만 계산하는 switch 디스패치(미등재는 `null`). `ctx`={effective characterId,
  actor, players, globalMarkers, votes?, targets, isFirstNight?}. 직업을 **하나씩** 추가하며 고도화.
- **`livingNeighbors(players, seat)`**: 좌석 번호로 정렬→`findIndex`→modulo 래핑으로 양옆 *생존* 이웃을 구한다
  (죽은 좌석 건너뜀). 이웃 관계는 **좌석 번호 링**(0..N-1 시계방향) 기준 — x/y(시각 배치)가 아님.
- **정합성 원칙**: ①진영은 `player.alignment`(진실) 그대로 센다. 은둔자(선→악)·첩자(악→선)는 *값을 뒤집지 않고*
  `range`+⚠경고로만 표시(등록은 ST 선택이라 결정 불가). ②행동 주체가 `isTainted`(취함/중독/Vortox)면 자동 채움을
  하지 않고 "진짜값 N — 거짓 줘야 함"으로만 표시. ③turning/gained/became/disguise는 read 시점 alignment를
  바꾸지 않으므로(advancePhase에서만 변경) raw로 읽는다.
- **UI 배선**: [ActionFields](../../components/ActionFields.tsx)가 `suggest/globalMarkers/votes/isFirstNight` prop으로
  이웃 패널 + "추천 N 적용" 칩을 렌더하고, `spec.targets===0`(타겟 비의존)이면 편집기 진입 시 결과를 1회
  자동 채운다(`useRef` seeded 가드, tainted면 제외). [NightActionRow](../../components/NightActionRow.tsx)가 전달,
  [NightSidebar](../../components/NightSidebar.tsx)는 **실제 행동 행에만** 추천을 켠다(미치광이 가짜 공격·주장 기록은 OFF).
- **자동채움형**(targets=0, 편집기 진입 시 결과 자동 채움): **초공감자**(양옆 생존 이웃 중 악 수)·
  **요리사**(인접 악 쌍, 래핑)·**신탁**(사망자 중 악 수)·**시계공**(악마↔최근접 하수인 좌석거리,
  `charMap` 팀 판정)·**광신도**(본인 진영).
- **지목 의존형**(targets>0, 지목을 다 고르면 추천 칩 노출·자동채움 X): **점쟁이**(지목 2명 중 악마/레드헤링→예)·
  **재봉사**(2명 같은 진영?)·**마을백치**(대상 진영)·**공작부인**(방문자 중 악 수). 은둔자/첩자가 지목에 끼면
  `note`로 주의(점쟁이는 "은둔자가 악마로 보일 수 있음").
- **직업 결과형**(targets>0, 지목 대상의 *직업*을 결과로 추천 → 토큰 모달에서 직접 고르는 수고 제거):
  **까마귀지기·탕녀·기구조종사**(대상의 진짜 `characterId`)·**세탁부/사서/수사관**(지목 중 주민/외지인/하수인
  좌석의 직업). disguise(주정뱅이 등)는 *진짜 직업*을 쓰고, became/gained 같은 정체 변경은 ST가 칩을 덮어쓴다.
- **장의사**(targets=0 직업 자동채움): 직전 낮에 처형된 사람의 직업을 편집기 진입 시 자동 채움. `game.votes`는
  현재 페이즈치라 알 수 없어, **서버 `getGame`이 직전 낮 스냅샷에서 계산해 `game.lastExecution`{seat,characterId}로
  싣는다**([readLastExecution](../../lib/games/lifecycle.ts) — `idx`보다 앞선 phase='day' 중 최대 idx의 `executed` 투표).
  처형이 없으면 추천 없음(깨우지 않음). 직업은 전역 정체성(`game_players`)에서 읽고, 은둔자/첩자면 note로 주의.
- 보류: 악마/선·악 좌석을 *임의로 골라* 지목을 채우는 부류(집사장·현상금사냥꾼·기사·귀족 등)는 유효 후보가 많아
  추천이 노이즈가 되기 쉬워 보류(별도 "추천 지목" 칩 + ST 판단 필요).

## 밤 행동 순서 사이드바 — [NightSidebar](../../components/NightSidebar.tsx)

좌석마다 `effectiveCharacterId()`([markers.ts](../../lib/markers.ts))로 **운영상 다루는 직업**을
구해 그 직업의 밤 순서에 배치한다 (disguise > became/gained 마커 > 원래 직업).

- **정보 노드**: 첫밤에 하수인 정보(order 19)·악마 정보(order 22)를 가상 노드로 삽입
  (공식 순서: 마술사 18 < 하수인 정보 < 미치광이 21 < 악마 정보 < 꼭두각시 26).
  - **하수인 정보**: 하수인 전원에게 *악마가 누구인지* 보여준다 — 단일 `보여주기` 링크
    (`?mode=demon`). 마술사 인플레이 시 마술사 닉네임도 (가짜) 악마로 함께 노출.
  - **악마 정보**: 악마마다 블러핑 3개(`?mode=bluffs`) + 하수인(`?mode=minions`) 보여주기.
- **본체 노드가 2개로 갈라지는 좌석**: disguise(주정뱅이·꼭두각시) 또는 `gained` 마커(철학자) 좌석은
  가짜/획득 직업 노드(그 order에서 깨움·행동) + 본체 노드(꼭두각시 보여주기·철학자 능력획득 보여주기 등)를
  둘 다 노출. 뱃지로 상호 표기(`←꼭두각시` / `→점쟁이`). `became`(직업 완전 교체)은 본체 노드 없음.
- **미치광이 특례**: 가짜 악마가 지정돼도 항상 **미치광이 자체 order**로 깨운다(진짜 악마보다
  먼저). 노드는 1개로 병합 — 첫밤엔 가짜 블러핑 3개·가짜 하수인 좌석 지정
  ([LunaticActionRow](../../components/LunaticActionRow.tsx)), 그 외 밤엔 같은 정보를 읽기
  전용으로 보여주고 + 가짜 악마 스펙으로 공격 흉내를 기록(킬 마커 없음).
  - **'실제 악마와 동일하게 채우기'** 프리셋: 첫밤 편집 시 진짜 악마가 받는 블러핑 3개(`game.bluffs`)와
    하수인 좌석(`team='minion'` 중 꼭두각시 제외 + 마술사, 본인 제외)을 그대로 `lunaticBluffs`/`lunaticMinions`에
    복사해 미치광이가 진짜 악마와 같은 화면을 보게 한다(show 페이지 `?mode=bluffs/minions` 계산과 1:1). 복사 후 수정 가능.
- 취함/중독(전역 마커 포함) 좌석의 정보 직업엔 `⚠ 거짓` 경고.
- **페이즈가 바뀌면 해당 페이즈의 순서 사이드바가 자동으로 열린다**([PlayCanvas](../../components/PlayCanvas.tsx)).

## 보여주기(showcase) — [show 페이지](../../app/play/[gameId]/show/[seat]/page.tsx)

행동 결과를 풀스크린으로 띄워 ST가 폰/화면을 들이밀어 전달하는 페이지. `ShowcaseSpec`의
heading/subheading에 placeholder(`{role}{actor}{target}{count}{yn}{team}{result}`)를 치환하고,
`tokens` 슬롯으로 직업 토큰/닉네임 카드를 배치한다.

- **레이아웃 일관**: 모든 보여주기는 위→아래 **토큰 → 플레이어(닉네임 뱃지) → 안내문구(heading/subheading)** 순.
- **닉네임은 항상 뱃지**: heading에 닉네임을 인라인 텍스트로 넣지 않고 `name`/`names`/**`actorName`**
  슬롯의 카드로 보여준다(예: 까마귀지기·꼭두각시·메제펠레스 변절·미치광이 지목).
- `recipient`: actor(기본)/target(세레노버스처럼 대상에게)/none(제3자에게 — "님께" 숨김).
- **정체 노출 원칙**: 받는 사람에게 액터의 직업명은 노출하지 않는다. 재봉사·점쟁이·귀족처럼
  대상의 정체를 알면 안 되는 직업은 토큰 대신 닉네임 카드(`name`/`names` 슬롯)만 쓴다.
- **`?as=<직업id>`**: 한 좌석에 행동 노드가 2개(꼭두각시+가짜직업, 철학자+획득직업)일 때 어느 노드의
  showcase·행동기록을 그릴지 핀한다. 없으면 disguise → 실제 순으로 폴백. NightActionRow가 링크에 자동 부착.
- **특수 모드**(`?mode=`): `demon`(하수인에게 악마+마술사 노출), `bluffs`/`minions`(악마에게 —
  마술사 인플레이 시 닉네임 자동 포함, 꼭두각시는 제외), `lunatic-bluffs`/`lunatic-minions`(미치광이에게
  ST 지정 가짜 정보), `lunatic-choice`(미치광이의 가짜 공격 지목을 **진짜 악마에게**).
- 변형이 여러 개면 `?v=N`으로 선택(꼭두각시 정확/이웃, 마술사 악마용/하수인용).

## 가짜 직업(disguise) 시스템

미치광이·주정뱅이·꼭두각시는 본인이 다른 직업이라 믿는다. 첫밤 셋업
([FirstNightSetup](../../components/FirstNightSetup.tsx))에서 좌석별 가짜 직업을 지정 →
`games.disguises`.

- 밤 순서·행동 스펙이 가짜 직업 기준으로 구동(`effectiveCharacterId`).
- **직업배포/직업공유 화면에서 가짜 직업으로 보인다** — 토큰뿐 아니라 진영 색·뱃지도 가짜
  직업의 팀 기준([RoleCard](../../components/RoleCard.tsx)의 `disguised` prop. 꼭두각시는
  "선 진영 · 마을주민"으로 보여야 함).
- 미지정 상태면 직업배포·직업공유 버튼이 차단된다(헤더 툴바에서 안내).

## 폰 뷰 3종 — 직업공유 · 직업배포 · 직업 목록

| 뷰 | 라우트 | 용도 |
|---|---|---|
| 직업공유 | `/play/[gameId]/seat` | 각자 닉네임 눌러 자기 직업 확인. localStorage 기억, 가시성 기반 폴링 |
| 직업배포 | `/play/[gameId]/claim` | **잠금 배포**: 닉네임 선택 시 좌석 점유(쿠키)→30초만 표시→영구 숨김 |
| 직업 목록 | `/play/[gameId]/pick/[seat]` | 플레이어가 직접 직업을 고르는 화면 — 시각 피드백만. 직업 누르면 가운데 큰 모달(진한 배경) |

`직업 목록` 버튼은 **플레이어가 직접 직업을 고르는 능력**(`spec.playerPicks`: 철학자·도박사·마귀할멈·
세레노버스·폭풍 부르미)에만 뜬다. 세탁부·까마귀지기처럼 정보로 *알게만* 되는 직업엔 안 뜸(ST가 보여줌).

직업배포([ClaimCard](../../components/ClaimCard.tsx))의 안전장치:

- **서버가 만료를 강제**(점유시각+30초) — 새로고침해도 안 보임. 클라 타이머는 표시용.
- **proxy 가둠**([proxy.ts](../../proxy.ts)): claim 쿠키 보유자는 다른 페이지(직업/시트/내역)로
  못 빠져나감. 게임 간 격리 — A게임 점유자도 B게임 claim은 접근 가능.
- **재열람 허용**: 좌석 패널의 "직업 재열람 허용"(`releaseSeat`)으로 점유 해제 → 그
  플레이어가 다시 30초 열람.
- 헤더의 "직업공유"/"직업배포" 버튼이 현재 WiFi의 LAN 주소 기준 링크를 클립보드에 복사.

## 낮 타이머 — [TimerPanel](../../components/TimerPanel.tsx)

밀담(생존×30초)·공개토론(생존×15초) 기본값, 수동 조정 가능. 시작/정지/리셋,
페이즈별 `game_phases.timers`에 기록돼 복기에 남는다. 0초 도달 시 **비프 3회 + 진동(폰) +
빨강 플래시**(같은 시작에 대해 1회), 이후 초과 시간 표시.

## 실행 취소 — [undo.ts](../../lib/games/undo.ts)

파괴적 조작(재추첨·페이즈 전환·생사·투표·마커·행동 기록·블러핑·진영·닉네임·자리 교환·전역
마커·게임 종료·직업 변경 등 16종) 직전에 **게임 전체 스냅샷**(games+players+phases+actions)을
`game_undo_stack`에 push(최근 30개). 헤더의 ↩ 취소가 top을 pop해 복원. 라벨("전역 마커" 등)을
툴팁으로 표시.

## 직업 토큰 마커 — [markers.ts](../../lib/markers.ts) · [MarkerToken](../../components/MarkerToken.tsx)

상태이상(중독·취함·집착·보호·사망예정) 외에 **직업을 가리키는 마커**와 글자 뱃지:

| 마커 | 의미 | 표시 |
|---|---|---|
| `mad:<role>` | 집착 | 세레노버스 토큰 + 대상 직업 토큰 |
| `became:<role>` | 직업 변경(임프 별넘김 등) | 대상 직업 토큰 + ↺ |
| `gained:<role>` | 능력 획득(픽시·철학자 등) — **`multi`(누적 가능)** | 대상 직업 토큰 + ✦ |
| `noability:<role>` | 일회성 능력 소진(`능력 사용함`) — **`multi`** | 대상 직업 토큰 + ✕ |
| `turning` | 변절 예정(메제펠레스) | ⇄ (dusk에 소멸) |
| `herring` | 레드헤링 | 점쟁이 토큰 |
| `vortox` 등 | **전역 마커**(`scope:"global"`) | 좌석이 아닌 게임 전체 — 모든 정보 직업 거짓 |

아이콘 없는 마커는 `letter` 글리프 뱃지로 렌더(`<img src="">` 금지). `Marker.taints`면
좌석/전역 어디에 있든 정보 직업에 `⚠ 거짓` 경고를 띄운다.

- **`multi` 마커**(능력획득·능력없음): 한 좌석에 여러 인스턴스가 공존한다(식인종이 철학자를 먹고
  → 철학자 능력으로 또 다른 직업을 얻는 식). 단일 마커는 동일 base를 교체하지만, multi는 누적된다.
  [SelectionPanel](../../components/SelectionPanel.tsx)이 단일(집착·직업변경: 1개 교체)과
  다중(능력획득·능력없음: 칩별 개별 제거 + 추가 UI)을 분리 렌더.
- **`dying`(사망예정) 자동 사망**: 밤→낮 전환 시([advancePhase](../../lib/games/lifecycle.ts)),
  살아있던 좌석에 `dying` 마커(임프 밤 공격 등)가 있으면 자동으로 `status=dead`·`cause=night`로 처리한다.
  ST가 보호 판단까지 끝내고 '죽음 확정'으로 단 마커이며(보호되면 애초에 안 단다), `dying`은 phase 지속이라
  다음 스냅샷에선 사라진다. 낮에 다는 `dying`(슬레이어·처녀 즉시 처리)은 ST가 직접 사망 처리하므로 제외.
- **식인종 재획득**: 처형으로 다시 능력을 얻을 때 기존 `gained`/`noability`/`drunk`를 싹 비우고 새 능력만 적용.

## 주장(블러핑) 기록 — [ClaimsSidebar](../../components/ClaimsSidebar.tsx)

"아무나 임의 직업 능력을 공개적으로 주장". 행동 레코드와 **같은 배열**에 `bluff: true`로
저장하되 식별 키 분리: 실제 행동 `a:<seat>:<직업>` / 주장 `b:<seat>:<직업>`. 키에 **직업**을 넣어
한 좌석이 여러 직업으로 행동/주장을 동시에 가질 수 있다 — 철학자(능력획득+획득직업), 식인종(밤마다
다른 능력), 꼭두각시(본체+가짜) 등의 기록이 서로 안 덮어쓴다. 사이드바·show 조회는 `actorSeat`+
`characterId`로 매칭하고 행동은 `!a.bluff`로 거른다.

## 지목·투표 — [VotesSidebar](../../components/VotesSidebar.tsx)

낮의 핵심. `VoteRecord { nominator, nominee, votes, executed }`를 대상 기준 1건으로
`game_phases.votes`에 저장. 복기에 페이즈별로 표시.

- **사망자·유령표 블록**: 사이드바 상단에 사망자를 사망 원인 글리프(처형 ☠️ / 밤 🌙 / 기타 ✕)와 함께
  나열하고, 남은 유령표 수(`ghostLeft/dead`)를 표시한다. 각 행을 탭하면 `onToggleGhostVote`로
  유령표 사용/복구를 토글(금색 = 사용 가능, 흐림 = 사용함). 투표 정산 중 누가 죽었고 데드보트가
  몇 개 남았는지 한눈에 본다.
- **투표 정산 도우미**: 처형 커트라인(생존 과반)·여행자 추방선·현재 최다·동률·다음 지목으로 뒤집을 수 있는지를
  계산해 각 지목 카드와 상단에 표시. 이 계산은 [lib/voting.ts](../../lib/voting.ts) `computeTally`로 추출돼
  **온라인 낮 투표([DayConsole](../../components/DayConsole.tsx))와 규칙을 공유**한다(분기 방지). 처형은 조건 충족
  시에도 '아무 일도 안 일어나는' 능력이 있어 ST가 명시적으로 눌러야 한다.
- **플레이어 선택**: 지목자·대상 선택은 native `<select>` 대신 [PlayerPicker](../../components/PlayerPicker.tsx)
  (트리거 버튼 + 토큰 그리드 portal 모달 — 닉네임·좌석번호·사망 여부를 큰 칸으로). 모바일에서 고르기 쉽다.
- **온라인 낮 투표**: 온라인 방에서는 플레이어가 자기 화면에서 직접 지목·투표하는 시계바늘 순차 방식이 별도로 있다
  → deep wiki [11 · 온라인 플레이](11-online-play.md)의 "낮 지목·투표". LAN VotesSidebar는 ST가 집계 수를 직접 입력하는 경로로 유지.

## 첫밤 셋업 — [FirstNightSetup](../../components/FirstNightSetup.tsx)

1일차 밤(idx 0)에만 편집 가능(이후 페이즈에선 읽기 전용으로 볼 수만 있음).

- **셋업 직업 안내**: `setup === true` 직업의 setupNote + 팀 분포 보정 카운트 표시.
- **악마 블러핑**: 인플레이에 없는 선 직업 3개 토큰 선택 → `games.bluffs`. 위장(disguise)으로 쓰인 직업은
  *누군가 자기 직업이라 믿는* 직업이므로 인플레이처럼 취급해 블러핑 후보에서 제외한다. 새 가짜 직업을 지정할 때
  그 직업이 이미 악마 블러핑에 들어가 있으면 `setDisguiseAction`이 자동으로 제거한다.
- **가짜 직업 지정**: 미치광이/주정뱅이/꼭두각시 좌석의 disguise 선택(토큰 모달).
- **닉네임 수정 + 자리(닉네임) 교환**: 직업은 좌석 고정, 사람만 이동.

## 운영 보조

- **처리 완료 체크**(`done`): 순서 행의 ✓ — 행동 기록 저장 시 자동, 수동 토글 가능.
- **일회성 능력**(`spec.oncePerGame`): 기록 시 `noability:<직업>` 영구 마커 자동 부여(직업별 판정 →
  한 좌석 여러 일회성이 안 섞임). 다음 페이즈에도 `능력 사용함` 유지. 철학자는 능력획득(`gained`)과
  **별개로** 소진 처리. (처단자·성결자·까마귀지기·암살자·교수·낚시꾼·철학자·재봉사·화가·기계공·사냥꾼·야경꾼 등)
- **행 흐림 규칙**: `능력 사용함` 행은 흐리게 + ✓ 자동. **사망 행은 흐리지 않는다**(까마귀지기처럼
  사망 시 발동하는 능력이 가려지지 않게). 사망은 배지로만 표시.
- **식인종 자동 획득**: 낮→밤 전환 시 그 낮에 **처형**된 플레이어 능력을 식인종에게 `gained:<직업>`로
  부여. 대상이 악이면 취함(영구)도, 선이면 취함 해제. 처형마다 갱신([advancePhase](../../lib/games/lifecycle.ts)).
- **사망 원인**(`cause`): 밤 살해/처형/기타. 복기 표시.
- **유령표**(`ghost_vote_used`): 사망자 1회 투표권 토글, 토큰 🗳️ 배지.
- **진영 토글**: 좌석 패널에서 선↔악 전환(변절 등) — 직업배포/공유 화면 색도 따라감
  (disguise 좌석 제외).
- **게임 복제**([cloneGame](../../lib/games/lifecycle.ts)): 같은 사람들로 다음 판을 빠르게 시작. 정체성
  (좌석·닉네임·직업·진영·배치·고정)과 셋업(시트·구성·블러핑·위장·미치광이)은 그대로 가져오되 진행 상태
  (행동·투표·마커·사망·메모·유령표·되돌리기·직업배포 점유)는 모두 비운 '1일차 밤' 새 게임을 만든다.
  label에 '(사본)' 접미. [GamesBrowser](../../components/GamesBrowser.tsx) 각 게임 카드의 '복제' 버튼 →
  `cloneGameAction`이 새 게임 진행 화면으로 redirect.
- **생존·승리 상태바**([StatusBar](../../components/StatusBar.tsx)): 생존 선/악/악마 수 + 승리조건 힌트.
- **좌석 자동정렬**: 헤더 툴바([HeaderToolbar](../../components/HeaderToolbar.tsx))의 '정렬' 드롭다운으로
  **원형 정렬**(`arrangeCircle`) 또는 **사각 정렬**(`arrangeRect`)을 선택. 사각은 상/좌·우/하 십자 입력
  + 합계·인원 검증(합이 인원과 같아야 적용)을 거치며, '자동' 버튼이 [seat-layout.ts](../../lib/seat-layout.ts)의
  `autoRectSides(n)`로 면별 인원을 채운다(상·하를 좌·우보다 많게). 좌표는 `applyPositions`로 일괄 저장.
  - `rectPositions(sides)`: 시계방향(상L→R → 우 → 하R→L → 좌)으로 정규화 좌표를 균등 배치 → 원형과 동일하게
    둘레 따라 이웃 관계가 보존된다. 실제 직사각 테이블이라 좌/우 이웃·마주보는 자리가 더 정확히 드러난다.
- **서버 응답 타임아웃 가드**: 액션이 15초 내 응답 없으면 알림 + pending 해제(멈춤 방지).
- **모달 뒤로가기 닫기**([useBackClose](../../components/useBackClose.ts)): 모바일 뒤로가기가 페이지를
  떠나는 대신 모달만 닫는다(RolePickerModal·AbilityModal·AbilityFocus·직업목록). StrictMode 안전 위해
  popstate-only. RolePickerModal은 `createPortal`로 body에 그려 완료(✓)행 `opacity` 상속을 피한다
  (PlayCanvas 바깥클릭 닫기 핸들러는 `[data-modal]`을 예외 처리).

## 전체화면(첩자 시점) — [PlayCanvas](../../components/PlayCanvas.tsx) · [GrimoireLegend](../../components/GrimoireLegend.tsx)

보드만 네이티브 풀스크린으로 띄워 첩자에게 그리모어를 보여주는 모드. 토큰 배율을 1.8배로 키우고
([MarkerToken](../../components/MarkerToken.tsx)의 `showLabel`로 토큰 아래 한글 라벨 캡션 가능), Esc로 원복.

- **배치 보존 회전**: 첩자 시점은 저장된 좌표(슬롯)는 그대로 두고 좌석→슬롯 배정만 회전시킨다. 하단 중앙에
  가장 가까운 슬롯(score = `y - |x-0.5|*0.5` 최대)으로 첩자를 보내, 원형/사각/수동 어떤 배치든 보존된 채
  첩자만 6시 방향으로 온다(예전엔 무조건 원형 재배치라 사각/수동 배치가 깨졌다).
- **범례 오버레이**([GrimoireLegend](../../components/GrimoireLegend.tsx)): 보드(`boardRef`) 내부에 렌더돼
  네이티브 풀스크린에서도 보인다. '이 게임에 실제 등장하는' 진영색·상태 마커(base별 대표 1개)·사망 글리프
  (처형 ☠️ / 밤 🌙)·유령표(🗳️ 금색=남음 / 흐림=사용)의 의미만 골라 한국어로 설명한다. 보드 중앙 큰 패널이라
  멀리서도 읽힌다.

## 스크립트 PNG 내보내기 — [ScriptExporter](../../components/ScriptExporter.tsx)

시트 상세에서 'PNG 내보내기' 링크로 진입하는 라우트 `/sheets/[id]/export`([page.tsx](../../app/sheets/[id]/export/page.tsx)).
인쇄용 운영 자료를 A4 세로 2장으로 렌더한다(`modern-screenshot`의 `domToPng` 의존).

- **직업 설명 시트**: 진영별로 그룹화한 직업 설명. 직업 28개 초과 시 3열.
- **밤 순서 + 징크스 시트**: 첫날 밤/그 외 밤 2열 밤 순서 + 징크스. 첫날 밤에는 공식 운영 순서대로 하수인 정보
  (order 19)·악마 정보(order 22) 정보 단계 노드를 직업 행 사이에 끼워 넣는다(NightSidebar의 order·문구와 동일).
  징크스는 스크립트에 양쪽 직업이 모두 있는 쌍만 '파트너 : 규칙' 파싱으로 추출.
- **A4 1장 자동 축소**: `A4Sheet`가 내용이 A4 높이를 넘으면 `scrollHeight` 기준으로 자동 축소(fit-to-page)해
  항상 1장에 담고, 웹폰트 로드 후(`document.fonts.ready`) 재측정한다. 캡처는 width/height를 A4 원본(1240×1754)에
  고정하고 `scale:2`(2480×3508 = 300DPI)로 PNG 다운로드.
- **여행자 제외 옵션**: 시트에 여행자(`team='traveller'`)가 있을 때만 체크박스 노출. 체크 시 직업 설명·밤 순서·
  징크스 모두에서 여행자를 제외한다(정식 게임 구성엔 여행자가 안 들어가므로 인쇄물에서 빼는 용도).

---
[← 설계 결정·확장](08-decisions-and-extending.md) · [홈](README.md)
