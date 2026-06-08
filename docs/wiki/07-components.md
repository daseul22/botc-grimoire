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
| [PlayCanvas](../../components/PlayCanvas.tsx) | client | **진행 스텝** — 보드 드래그·페이즈 진행·상태/마커/메모/고정·사이드바(행동순서/상세능력)·1일차 직업변경 |
| [AbilityModal](../../components/AbilityModal.tsx) | client | 직업 능력 상세 모달(능력·상세정보·운영방식·징크스·분위기) |
| [GameReplay](../../components/GameReplay.tsx) | server | 종료 게임 복기(최종 직업 + 페이즈별 기록) |
| [DeleteGameButton](../../components/DeleteGameButton.tsx) | client | 게임 삭제 |

## PlayCanvas 내부 구조 (가장 큰 컴포넌트)

- **헤더**: 일차/페이즈 표시, 이전│다음 페이즈, 재추첨, 게임 종료, 나가기.
- **보드**: `game.players`를 절대 위치(0~1 비율)로 렌더. 드래그=이동, 클릭=선택. 토큰에 사망(✕)·
  고정(📌)·메모(📝)·마커(원형 토큰 이미지) 오버레이.
- **우측 사이드바(토글)**: `🌙 행동 순서`(밤, 첫날밤/그외밤 순서 + 리마인더) / `📖 상세 능력`
  (인플레이 직업 + 시트 미사용 직업, 클릭 시 모달).
- **하단 선택 패널**: 사망/부활·고정·마커(지속 태그)·집착 대상 선택·누적 메모·(1일차 밤)직업 변경.

---
[← 준비 스텝](06-setup-and-ratio.md) · [홈](README.md) · 다음: [설계 결정·확장 →](08-decisions-and-extending.md)
