# 09 · 이야기꾼 운영 도구

[← 설계 결정·확장](08-decisions-and-extending.md) · [홈](README.md)

[04 그리모어 엔진](04-grimoire-engine.md)이 "정체성↔스냅샷" 뼈대라면, 이 문서는 그 위에 얹은
**실제 진행 보조 기능**들이다. 공통 원칙: 무슨 일이 있었는지를 **해당 페이즈 스냅샷에 기록**하고,
복기에서 페이즈별로 다시 보여준다. 정체성을 덮어쓰지 않으므로 과거 기록이 안 깨진다.

## 무엇이 어디에 저장되나

| 데이터 | 저장 위치 | 범위 | 모듈 |
|---|---|---|---|
| 야간/낮 행동·주장 | `game_phase_actions(actions JSON)` | 페이즈별 | [games.ts](../../lib/games.ts) |
| 지목·투표 | `game_phases.votes` | 페이즈별 | games.ts |
| 처리 완료 체크 | `game_phases.done` | 페이즈별 | games.ts |
| 이야기꾼 메모(스크래치패드) | `game_phases.note` | 페이즈별 | games.ts |
| 사망 원인 | `game_phases.state[seat].cause` | 페이즈별 | games.ts |
| 마커(상태이상·직업토큰) | `game_phases.state[seat].markers[]` | 페이즈별 | [markers.ts](../../lib/markers.ts) |
| 악마 블러핑 3직업 | `games.bluffs` | 전역 | games.ts |
| 유령표 사용 여부 | `game_players.ghost_vote_used` | 전역 | games.ts |
| 플레이어별 누적 메모 | `game_players.memo` | 전역 | games.ts |

규칙: **페이즈마다 달라지는 건 스냅샷(game_phases), 게임 내내 한 값인 건 전역(games/game_players).**

## 야간/낮 행동 기록 — [lib/night-actions.ts](../../lib/night-actions.ts)

"직업이 누구를 지목해서 무슨 결과를 받았는가". 직업 종류가 많아 **결과를 열거하지 않고**,
입력 위젯만 직업별로 구조화한다.

```ts
type ActionSpec = { targets: number; result: ResultKind; marker?: string; hint?: string };
type ResultKind = "none" | "number" | "yesno" | "role" | "team" | "text";
```

- `targets` = 지목 좌석 수 상한, `result` = 결과 종류(→ 입력 위젯 결정), `marker` = 결과로 대상에
  적용 제안할 마커.
- `ACTION_SPECS`(야간 행동 120직업) / `DAY_ACTION_SPECS`(낮 능력 16직업). 곡예사·험담꾼처럼
  밤/낮 둘 다 쓰는 직업은 양쪽 등재 → **페이즈별로 따로 기록**. `specForPhase()`가 복기에서
  맞는 스펙을 고른다.
- 누가 행동하는지·순서는 데이터(`firstNight`/`otherNight`)가 정한다 → 능력문 파싱 불필요.
- 결과는 종류와 무관하게 **문자열로 저장**(number→"2", yesno→"yes", role→characterId …),
  `formatResult()`로 표시.

저장: `NightActionRecord { actorSeat, characterId, targets[], result, bluff? }` 배열을
페이즈별 `game_phase_actions`에 둔다. **다음 페이즈로 복사하지 않는다**(그날 밤 고유) — 마커는
복사되지만 행동은 안 됨. 별도 테이블이라 `advancePhase`는 손대지 않는다.

UI: 야간순서/낮능력 사이드바의 각 행에 인라인 편집기([NightActionRow](../../components/NightActionRow.tsx)),
지목 칩+결과 위젯은 [ActionFields](../../components/ActionFields.tsx) 공용.

## 주장(블러핑) 기록 — [ClaimsSidebar](../../components/ClaimsSidebar.tsx)

"아무나 임의 직업 능력을 공개적으로 주장(처단자인 척 등)". 행동 레코드와 **같은 배열**에
`bluff: true`로 저장하되 식별 키를 분리한다:

```
실제 행동 : a:<actorSeat>           (좌석당 1개)
주장      : b:<actorSeat>:<role>    (좌석+주장직업당 1개)
```

→ 한 좌석이 실제 행동 + 여러 주장을 동시에 가질 수 있다. 야간/낮 사이드바의 행동 조회는
`!a.bluff`로 거른다.

## 지목·투표 — [VotesSidebar](../../components/VotesSidebar.tsx)

낮의 핵심. `VoteRecord { nominator, nominee, votes, executed }`를 대상(nominee) 기준 1건으로
`game_phases.votes`에 저장. 복기에 페이즈별로 표시.

## 악마 블러핑 · 셋업 안내 — [FirstNightSetup](../../components/FirstNightSetup.tsx)

1일차 밤(idx 0)에만 뜨는 배너.

- **셋업 직업 안내**: 인플레이 직업 중 `setup === true`(남작 등)를 setupNote와 함께 표시 →
  이야기꾼이 인원 분포를 수동 보정하게 안내.
- **악마 블러핑**: 인플레이에 없는 마을주민/외지인 중 3개를 토큰으로 선택 → `games.bluffs`.
  다른 페이즈엔 리마인더 칩, 복기에도 표시. 재추첨 시 초기화.

## 직업 토큰 마커 — [markers.ts](../../lib/markers.ts) · [MarkerToken](../../components/MarkerToken.tsx)

기존 상태이상(중독·취함·집착·보호·사망예정) 외에 **직업을 가리키는 마커** 추가:

| 마커 | 의미 | 표시 |
|---|---|---|
| `mad:<role>` | 집착 | 세레노버스 토큰 + 대상 직업 토큰 |
| `became:<role>` | 직업 변경(임프 별넘김·탕녀→임프 등) | 대상 직업 토큰 + ↺ |
| `gained:<role>` | 능력 획득(픽시·철학자 등) | 대상 직업 토큰 + ✦ |
| `herring` | 레드헤링(점쟁이에게 악마로 보임) | 점쟁이 토큰 |

`Marker.roleParam`이면 param이 직업 id → `MarkerToken`이 그 직업 심볼로 렌더. 정체성은
마커로만 얹어 과거 스냅샷을 안 깬다(전역 `character_id` 불변).

## 운영 보조

- **처리 완료 체크**(`done`): 야간/낮 순서 행의 ✓ — 그 페이즈에 처리한 직업 표시(빠뜨림 방지).
- **페이즈 메모**(`note`): 스냅샷별 이야기꾼 스크래치패드.
- **사망 원인**(`cause`): 밤 살해/처형/기타. `setStatus(seat,"dead",cause)`로 저장, 복기 표시.
- **유령표**(`ghost_vote_used`): 사망자 1회 투표권 토글, 토큰 🗳️ 배지.
- **거짓 정보 경고**: 정보 결과 직업이 취함/중독이면 순서 행에 `⚠ 거짓`(계산만).
- **생존·승리 상태바**([StatusBar](../../components/StatusBar.tsx)): 생존 선/악/악마 수 + 승리조건
  힌트(악마 전멸·악≥선·종반). 계산만, 저장 없음.
- **원형 자동정렬**: 토큰을 원형으로 재배치 → `savePositions`.

## 폰 플레이어 뷰 — [SeatView](../../components/SeatView.tsx) · `/play/[gameId]/seat`

LAN의 각 플레이어가 자기 폰에서 **자기 자리 직업만** 본다(직업·진영·능력). 자리 선택은
localStorage에 기억, 5초마다 `router.refresh()`로 갱신(직업 변경 등 반영). 이야기꾼 보드와
분리된 별도 라우트. 신뢰 기반(좌석 인증 없음) — 캐주얼 LAN 모임용.

이건 [08 향후 계획](08-decisions-and-extending.md)의 "멀티 디바이스"를 읽기 전용으로 먼저
구현한 것. 데이터 모델은 이미 이를 견디게 설계돼 있었다.

---
[← 설계 결정·확장](08-decisions-and-extending.md) · [홈](README.md)
