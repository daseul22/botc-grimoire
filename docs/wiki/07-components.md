# 07 · 컴포넌트 레퍼런스

[← 준비 스텝](06-setup-and-ratio.md) · [홈](README.md) · 다음: [설계 결정·확장 →](08-decisions-and-extending.md)

| 파일 | 종류 | 책임 |
|---|---|---|
| [CharacterBrowser](../../components/CharacterBrowser.tsx) | client | 직업 목록 필터(에디션·팀)·검색·팀 그룹핑 |
| [CharacterCard](../../components/CharacterCard.tsx) | server | 직업 카드(셋업·징크스 배지) |
| [CharacterDetail](../../components/CharacterDetail.tsx) | client | 직업 상세 + 한/영 토글 |
| [CharacterIcon](../../components/CharacterIcon.tsx) | server | 아이콘(없으면 글자 폴백) |
| [Badge](../../components/Badge.tsx) | server | 색상 배지 |
| [NightOrderTable](../../components/NightOrderTable.tsx) | server | 시트 야간 순서표(첫날밤/그외밤) |
| [SheetBuilder](../../components/SheetBuilder.tsx) | client | 커스텀 시트 생성/수정(직업 선택·능력 미리보기) |
| [DeleteSheetButton](../../components/DeleteSheetButton.tsx) | client | 커스텀 시트 삭제 |
| [SetupStep](../../components/SetupStep.tsx) | client | 준비 스텝(비율·제외·닉네임) |
| [PlayCanvas](../../components/PlayCanvas.tsx) | client | **진행 스텝** — 보드·페이즈 진행·상태/마커·5종 사이드바·상태바·메모·정렬 (총괄) |
| [StatusBar](../../components/StatusBar.tsx) | server | 생존 선/악/악마 수 + 승리조건 힌트(계산) |
| [MarkerToken](../../components/MarkerToken.tsx) | server | 마커 1개 토큰 렌더(집착=2토큰, 변경/획득=직업토큰+배지) |
| [NightActionRow](../../components/NightActionRow.tsx) | client | 야간/낮 행동 인라인 기록기(지목·결과·마커적용) |
| [ActionFields](../../components/ActionFields.tsx) | client | 지목 칩 + 결과 위젯(행동/주장 공용 입력부) |
| [ClaimsSidebar](../../components/ClaimsSidebar.tsx) | client | 주장(블러핑) 기록 — 임의 좌석×직업 |
| [VotesSidebar](../../components/VotesSidebar.tsx) | client | 지목·투표 기록(낮) |
| [FirstNightSetup](../../components/FirstNightSetup.tsx) | client | 1일차 밤 셋업 직업 안내 + 악마 블러핑 3선택 |
| [AbilityModal](../../components/AbilityModal.tsx) | client | 직업 능력 상세 모달(능력·상세정보·운영방식·징크스·분위기) |
| [GameReplay](../../components/GameReplay.tsx) | server | 종료 게임 복기(최종 직업·블러핑 + 페이즈별 마커/행동/투표/사망원인) |
| [SeatView](../../components/SeatView.tsx) | client | 폰 플레이어 뷰(자기 자리 직업만, 5초 갱신) |
| [DeleteGameButton](../../components/DeleteGameButton.tsx) | client | 게임 삭제 |

> 운영 컴포넌트(행동·주장·투표·셋업·상태바·마커토큰·폰뷰)의 동작·저장은 → [09 이야기꾼 운영 도구](09-storyteller-tools.md).

## PlayCanvas 내부 구조 (가장 큰 컴포넌트)

- **헤더**: 일차/페이즈, 이전│다음 페이즈, ◯ 정렬(원형 배치), 재추첨, 게임 종료, 📱 자리(폰 링크), 나가기.
- **상태바 + 페이즈 메모**: [StatusBar](../../components/StatusBar.tsx) + 스냅샷 메모 textarea.
- **1일차 밤 배너**: [FirstNightSetup](../../components/FirstNightSetup.tsx)(셋업 직업 + 악마 블러핑).
- **보드**: `game.players`를 절대 위치(0~1)로 렌더. 드래그=이동, 클릭=선택. 토큰에 사망(✕)·
  유령표(🗳️)·고정(📌)·메모(📝)·마커([MarkerToken](../../components/MarkerToken.tsx)) 오버레이.
- **우측 사이드바(토글)**: `🌙 행동 순서`(밤) / `☀️ 낮 능력`(낮) — 각 행에 행동 기록기·완료체크·거짓경고 /
  `📖 상세 능력` / `🗣️ 주장` / `🗳️ 투표`(낮).
- **하단 선택 패널**: 사망/부활(+원인·유령표)·고정·마커(중독/취함/보호/사망예정/레드헤링 +
  집착/직업변경/능력획득 대상선택)·누적 메모·(1일차 밤)직업 변경.

---
[← 준비 스텝](06-setup-and-ratio.md) · [홈](README.md) · 다음: [설계 결정·확장 →](08-decisions-and-extending.md)
