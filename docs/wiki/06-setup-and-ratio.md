# 06 · 준비 스텝과 비율

[← 상태 동기화](05-state-sync.md) · [홈](README.md) · 다음: [컴포넌트 →](07-components.md)

시트 상세에서 `시작하기` → 준비 스텝([components/SetupStep.tsx](../../components/SetupStep.tsx)).

## 흐름

1. **인원 입력** → 공식 비율표(5~15인) 자동 적용. 수동 조정 가능(합이 인원과 맞아야 시작).
   `자동` 버튼으로 현재 인원 비율표 값으로 되돌릴 수 있다.
2. **직업 제외**: 밸런스용으로 특정 직업을 이번 게임에서 뺀다. 배정은 핵심 4직업군에서만.
   직업군별로 `사용 가능/전체` 수가 표시되고, 비율이 사용 가능 수를 넘으면 빨간 테두리로 경고한다.
3. **닉네임**: 비우면 `플레이어 N` 기본값([play/actions.ts](../../app/play/actions.ts)). 이전 게임에서 쓴
   닉네임은 `datalist`(`known-nicks`)로 자동완성 — 인게임 좌석 패널의 닉네임 수정에서도 동일.
4. **게임 시작** → `startGameAction`:
   - 제외 빼고 비율대로 핵심 4직업군에서 랜덤 배정(`assignRoles`)
   - 진영은 팀에서 파생(`alignmentOf`: 하수인·악마=evil, 나머지=good)
   - 원형 기본 좌석 배치(좌석 인덱스 기준 각도) → 게임 생성(`createGame`, config에 `excludedIds`·`counts` 저장)
     → 진행 스텝(`/play/[gameId]`)으로 `redirect`

## 공식 인원 비율표 — [lib/ratio.ts](../../lib/ratio.ts)

[마을주민, 외지인, 하수인, 악마]:

| 인원 | 마을 | 외지 | 하수인 | 악마 |
|----|----|----|----|----|
| 5 | 3 | 0 | 1 | 1 |
| 6 | 3 | 1 | 1 | 1 |
| 7 | 5 | 0 | 1 | 1 |
| 8 | 5 | 1 | 1 | 1 |
| 9 | 5 | 2 | 1 | 1 |
| 10 | 7 | 0 | 2 | 1 |
| 11 | 7 | 1 | 2 | 1 |
| 12 | 7 | 2 | 2 | 1 |
| 13 | 9 | 0 | 3 | 1 |
| 14 | 9 | 1 | 3 | 1 |
| 15 | 9 | 2 | 3 | 1 |

규칙: 악마 항상 1, 외지인 0→1→2 순환, 하수인 5~9인=1·10~12=2·13~15=3, 나머지 마을주민.

주의:
- **여행자·전설**은 표 밖(별도 추가) → 자동 배정 대상 아님.
- **셋업 직업**(남작 `[외지인 +2]` 등)은 실제 분포를 바꾼다 → 자동 반영 안 됨, **수동 보정**.
  진행 화면 1일차 밤 셋업([FirstNightSetup](../../components/FirstNightSetup.tsx))이 인플레이 셋업
  직업을 표시해 보정을 돕는다. (→ [09](09-storyteller-tools.md))

## 1일차 밤 셋업 — [FirstNightSetup](../../components/FirstNightSetup.tsx)

진행 화면 1일차 밤에 뜨는 셋업 박스. ST가 게임 시작 직후 첫밤 정보를 준비한다(`readonly=true`면 이후 밤에서도 읽기 전용으로 같은 정보를 확인).

- **셋업 영향 직업**: 인플레이 중 `setup` 플래그가 있는 직업과 `setupNote`를 나열해 팀 분포 수동 보정을 돕는다.
- **악마 블러핑**: 인플레이에 없는 마을주민·외지인 중 3개 선택. **위장(가짜 직업)으로 지정된 직업은 후보에서
  제외**된다(누군가 자기 직업이라 믿는 직업은 인플레이처럼 취급). `setDisguiseAction`도 새 가짜 직업이 이미
  악마 블러핑에 들어가 있으면 자동 제거한다.
- **가짜 직업(위장)**: 미치광이=악마 토큰, 주정뱅이·꼭두각시=마을주민 토큰 중 골라 본인 폰에 진짜 직업 대신
  보여준다. 하나라도 미선택이면 직업배포·직업공유 버튼이 비활성된다. 저장은 `setDisguiseAction`(`game.disguises`).

### 미치광이 첫밤 정보 — [LunaticActionRow](../../components/LunaticActionRow.tsx)

미치광이는 진짜 악마처럼 가짜 블러핑 3개·가짜 하수인 좌석을 ST가 자유 지정한다(`game.lunaticBluffs`·`lunaticMinions`,
`setLunaticBluffsAction`·`setLunaticMinionsAction`). 진짜 악마 정보(`game.bluffs`)와 별개다.

- **실제 악마와 동일하게 채우기** 프리셋(첫밤 편집 시): 진짜 악마가 받는 블러핑 3개(`game.bluffs`)와
  하수인 좌석(`team='minion'` 중 꼭두각시 제외 + 마술사, 본인 제외)을 그대로 복사해 미치광이가 진짜 악마와 같은
  화면을 보게 한다. 복사 후 슬롯·좌석 자유 수정 가능. `show` 페이지의 `?mode=bluffs/minions` 계산과 1:1로 맞췄다.
- **보여주기 · 블러핑/하수인** 링크는 `/play/[gameId]/show/[seat]?mode=lunatic-bluffs|lunatic-minions`로 연다.

(→ [09 스토리텔러 도구](09-storyteller-tools.md))

---
[← 상태 동기화](05-state-sync.md) · [홈](README.md) · 다음: [컴포넌트 →](07-components.md)
