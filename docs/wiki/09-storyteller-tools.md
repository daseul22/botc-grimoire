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

## 밤 행동 순서 사이드바 — [NightSidebar](../../components/NightSidebar.tsx)

좌석마다 `effectiveCharacterId()`([markers.ts](../../lib/markers.ts))로 **운영상 다루는 직업**을
구해 그 직업의 밤 순서에 배치한다 (disguise > became/gained 마커 > 원래 직업).

- **정보 노드**: 첫밤에 하수인 정보(order 19)·악마 정보(order 22)를 가상 노드로 삽입
  (공식 순서: 마술사 18 < 하수인 정보 < 미치광이 21 < 악마 정보 < 꼭두각시 26).
  - **하수인 정보**: 하수인 전원에게 *악마가 누구인지* 보여준다 — 단일 `🎴 보여주기` 링크
    (`?mode=demon`). 마술사 인플레이 시 마술사 닉네임도 (가짜) 악마로 함께 노출.
  - **악마 정보**: 데몬마다 블러핑 3개(`?mode=bluffs`) + 하수인(`?mode=minions`) 보여주기.
- **본체 노드가 2개로 갈라지는 좌석**: disguise(주정뱅이·꼭두각시) 또는 `gained` 마커(철학자) 좌석은
  가짜/획득 직업 노드(그 order에서 깨움·행동) + 본체 노드(꼭두각시 보여주기·철학자 능력획득 보여주기 등)를
  둘 다 노출. 뱃지로 상호 표기(`←꼭두각시` / `→점쟁이`). `became`(직업 완전 교체)은 본체 노드 없음.
- **미치광이 특례**: 가짜 악마가 지정돼도 항상 **미치광이 자체 order**로 깨운다(진짜 악마보다
  먼저). 노드는 1개로 병합 — 첫밤엔 가짜 블러핑 3개·가짜 하수인 좌석 지정
  ([LunaticActionRow](../../components/LunaticActionRow.tsx)), 그 외 밤엔 같은 정보를 읽기
  전용으로 보여주고 + 가짜 악마 스펙으로 공격 흉내를 기록(킬 마커 없음).
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
- **특수 모드**(`?mode=`): `demon`(하수인에게 악마+마술사 노출), `bluffs`/`minions`(데몬에게 —
  마술사 인플레이 시 닉네임 자동 포함, 꼭두각시는 제외), `lunatic-bluffs`/`lunatic-minions`(미치광이에게
  ST 지정 가짜 정보), `lunatic-choice`(미치광이의 가짜 공격 지목을 **진짜 데몬에게**).
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

`직업 목록` 버튼은 **플레이어가 직접 직업을 고르는 능력**(`spec.playerPicks`: 철학자·도박꾼·핏쥐·
세레노버스·폭풍포착자)에만 뜬다. 세탁부·까마귀지기처럼 정보로 *알게만* 되는 직업엔 안 뜸(ST가 보여줌).

직업배포([ClaimCard](../../components/ClaimCard.tsx))의 안전장치:

- **서버가 만료를 강제**(점유시각+30초) — 새로고침해도 안 보임. 클라 타이머는 표시용.
- **proxy 가둠**([proxy.ts](../../proxy.ts)): claim 쿠키 보유자는 다른 페이지(직업/시트/내역)로
  못 빠져나감. 게임 간 격리 — A게임 점유자도 B게임 claim은 접근 가능.
- **재열람 허용**: 좌석 패널의 "🔓 직업 재열람 허용"(`releaseSeat`)으로 점유 해제 → 그
  플레이어가 다시 30초 열람.
- 헤더의 "📱 직업공유"/"🔒 직업배포" 버튼이 현재 WiFi의 LAN 주소 기준 링크를 클립보드에 복사.

## 낮 타이머 — [TimerPanel](../../components/TimerPanel.tsx)

밀담(생존×25초)·공개토론(생존×15초) 기본값, 수동 조정 가능. 시작/정지/리셋,
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
| `gained:<role>` | 능력 획득(픽시·철학자 등) | 대상 직업 토큰 + ✦ |
| `noability:<role>` | 일회성 능력 소진(`능력 사용함`) | 대상 직업 토큰 + ✕ |
| `turning` | 변절 예정(메제펠레스) | ⇄ (dusk에 소멸) |
| `herring` | 레드헤링 | 점쟁이 토큰 |
| `vortox` 등 | **전역 마커**(`scope:"global"`) | 좌석이 아닌 게임 전체 — 모든 정보 직업 거짓 |

아이콘 없는 마커는 `letter` 글리프 뱃지로 렌더(`<img src="">` 금지). `Marker.taints`면
좌석/전역 어디에 있든 정보 직업에 `⚠ 거짓` 경고를 띄운다.

## 주장(블러핑) 기록 — [ClaimsSidebar](../../components/ClaimsSidebar.tsx)

"아무나 임의 직업 능력을 공개적으로 주장". 행동 레코드와 **같은 배열**에 `bluff: true`로
저장하되 식별 키 분리: 실제 행동 `a:<seat>:<직업>` / 주장 `b:<seat>:<직업>`. 키에 **직업**을 넣어
한 좌석이 여러 직업으로 행동/주장을 동시에 가질 수 있다 — 철학자(능력획득+획득직업), 식인종(밤마다
다른 능력), 꼭두각시(본체+가짜) 등의 기록이 서로 안 덮어쓴다. 사이드바·show 조회는 `actorSeat`+
`characterId`로 매칭하고 행동은 `!a.bluff`로 거른다.

## 지목·투표 — [VotesSidebar](../../components/VotesSidebar.tsx)

낮의 핵심. `VoteRecord { nominator, nominee, votes, executed }`를 대상 기준 1건으로
`game_phases.votes`에 저장. 복기에 페이즈별로 표시.

## 첫밤 셋업 — [FirstNightSetup](../../components/FirstNightSetup.tsx)

1일차 밤(idx 0)에만 편집 가능(이후 페이즈에선 읽기 전용으로 볼 수만 있음).

- **셋업 직업 안내**: `setup === true` 직업의 setupNote + 팀 분포 보정 카운트 표시.
- **악마 블러핑**: 인플레이에 없는 선 직업 3개 토큰 선택 → `games.bluffs`.
- **가짜 직업 지정**: 미치광이/주정뱅이/꼭두각시 좌석의 disguise 선택(토큰 모달).
- **닉네임 수정 + 자리(닉네임) 교환**: 직업은 좌석 고정, 사람만 이동.

## 운영 보조

- **처리 완료 체크**(`done`): 순서 행의 ✓ — 행동 기록 저장 시 자동, 수동 토글 가능.
- **일회성 능력**(`spec.oncePerGame`): 기록 시 `noability:<직업>` 영구 마커 자동 부여(직업별 판정 →
  한 좌석 여러 일회성이 안 섞임). 다음 페이즈에도 `능력 사용함` 유지. 철학자는 능력획득(`gained`)과
  **별개로** 소진 처리. (처단자·성결자·까마귀지기·암살자·교수·어부·철학자·재봉사·예술가·기술자·사냥꾼·야경꾼 등)
- **행 흐림 규칙**: `능력 사용함` 행은 흐리게 + ✓ 자동. **사망 행은 흐리지 않는다**(까마귀지기처럼
  사망 시 발동하는 능력이 가려지지 않게). 사망은 배지로만 표시.
- **식인종 자동 획득**: 낮→밤 전환 시 그 낮에 **처형**된 플레이어 능력을 식인종에게 `gained:<직업>`로
  부여. 대상이 악이면 취함(영구)도, 선이면 취함 해제. 처형마다 갱신([advancePhase](../../lib/games/lifecycle.ts)).
- **사망 원인**(`cause`): 밤 살해/처형/기타. 복기 표시.
- **유령표**(`ghost_vote_used`): 사망자 1회 투표권 토글, 토큰 🗳️ 배지.
- **진영 토글**: 좌석 패널에서 선↔악 전환(변절 등) — 직업배포/공유 화면 색도 따라감
  (disguise 좌석 제외).
- **생존·승리 상태바**([StatusBar](../../components/StatusBar.tsx)): 생존 선/악/악마 수 + 승리조건 힌트.
- **원형 자동정렬**: 토큰을 원형으로 재배치 → `savePositions`.
- **서버 응답 타임아웃 가드**: 액션이 15초 내 응답 없으면 알림 + pending 해제(멈춤 방지).
- **모달 뒤로가기 닫기**([useBackClose](../../components/useBackClose.ts)): 모바일 뒤로가기가 페이지를
  떠나는 대신 모달만 닫는다(RolePickerModal·AbilityModal·AbilityFocus·직업목록). StrictMode 안전 위해
  popstate-only. RolePickerModal은 `createPortal`로 body에 그려 완료(✓)행 `opacity` 상속을 피한다
  (PlayCanvas 바깥클릭 닫기 핸들러는 `[data-modal]`을 예외 처리).

---
[← 설계 결정·확장](08-decisions-and-extending.md) · [홈](README.md)
