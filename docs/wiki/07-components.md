# 07 · 컴포넌트 레퍼런스

[← 준비 스텝](06-setup-and-ratio.md) · [홈](README.md) · 다음: [설계 결정·확장 →](08-decisions-and-extending.md)

| 파일 | 종류 | 책임 |
|---|---|---|
| [CharacterBrowser](../../components/CharacterBrowser.tsx) | client | 직업 목록 필터(에디션·팀)·검색·팀 그룹핑 |
| [CharacterCard](../../components/CharacterCard.tsx) | server | 직업 카드(셋업·징크스 배지) |
| [CharacterDetail](../../components/CharacterDetail.tsx) | client | 직업 상세 + 한/영 토글 + 능력 미리보기·동작 설정 패널 배치 |
| [BehaviorSettings](../../components/BehaviorSettings.tsx) | client | **그리모어 동작 설정**(직업 상세 하단, 관리자 전용) — 페이즈별 스펙·운영 규칙을 그 자리에서 수정. 공식은 override(전역), 커스텀은 그 직업만. 편집 중 값은 `x-behavior-draft` id로 격리해 저장 전 오염 방지 ([12](12-custom-characters.md)) |
| [CharacterIcon](../../components/CharacterIcon.tsx) | server | 아이콘(없으면 글자 폴백) |
| [Badge](../../components/Badge.tsx) | server | 색상 배지 |
| [NightOrderTable](../../components/NightOrderTable.tsx) | server | 시트 야간 순서표(첫날밤/그외밤) |
| [SheetBuilder](../../components/SheetBuilder.tsx) | client | 커스텀 시트 생성/수정(직업 선택·능력 미리보기). 공식 + 커스텀 직업을 함께 고른다 |
| [CharacterBuilder](../../components/CharacterBuilder.tsx) | client | **커스텀 직업 빌더** — 기본정보·밤 순서(이웃 안내)·페이즈별 동작·운영 규칙 + draft를 레지스트리에 주입한 라이브 미리보기 ([12](12-custom-characters.md)) |
| [AbilitySpecEditor](../../components/AbilitySpecEditor.tsx) | client | 한 페이즈의 행동 스펙 편집(지목→결과→마커→플래그→보여주기). 첫밤/그외밤/낮이 공유해 조합 규칙이 한 곳에만 존재 |
| [IconPicker](../../components/IconPicker.tsx) | client | 토큰 이미지 — 공식 183종 재사용 + 업로드(canvas 256px 정사각 크롭 → dataURL) |
| [CustomCharacterList](../../components/CustomCharacterList.tsx) | client | 커스텀 직업 목록 카드 — 동작을 요약 칩(밤순서·지목·결과·마커·1회·보여주기)으로 압축 표시 |
| [useCharacterBehaviors](../../components/useBehaviors.ts) | hook | `sheetChars`의 커스텀 동작을 레지스트리에 주입. useEffect가 아니라 **useMemo**(렌더 중 주입 → 첫 프레임부터 올바른 스펙) |
| [ScriptExporter](../../components/ScriptExporter.tsx) | client | 스크립트 직업 설명·밤 순서(징크스 포함) A4 1장 PNG 내보내기 — 여행자 제외 옵션·자동 축소·첫밤 하수인/악마 정보 단계 삽입 |
| [DeleteSheetButton](../../components/DeleteSheetButton.tsx) | client | 커스텀 시트 삭제 |
| [SetupStep](../../components/SetupStep.tsx) | client | 준비 스텝(비율·제외·닉네임 + 저장된 닉네임 datalist 자동완성) |
| [GamesBrowser](../../components/GamesBrowser.tsx) | client | 내역 목록 — 검색·날짜/스크립트/상태 필터·정렬, 게임별 이름 인라인 편집·복제(⧉) |
| [StatsView](../../components/StatsView.tsx) | client | 통계 — 요약 타일·플레이어 순위표·게임별 기록(복기 링크) |
| [PlayCanvas](../../components/PlayCanvas.tsx) | client | **진행 스텝** — 보드·페이즈 진행·상태/마커·5종 사이드바·상태바·메모·정렬(원형/사각) (총괄) |
| [HeaderToolbar](../../components/HeaderToolbar.tsx) | client | 진행 헤더 — 이전/다음 페이즈·취소·정렬(원형/사각 드롭다운)·재추첨·게임 종료·직업배포/공유 링크 복사 |
| [SelectionPanel](../../components/SelectionPanel.tsx) | client | 하단 좌석 패널 — 사망(원인 토글 버튼)/마커(다중 능력획득·능력없음 칩 분리)/진영/메모/(1일밤)닉네임·자리(PlayerPicker)·직업 변경 |
| [StatusBar](../../components/StatusBar.tsx) | server | 생존 선/악/악마 수 + 승리조건 힌트(계산) |
| [GrimoireLegend](../../components/GrimoireLegend.tsx) | client | 전체화면 첩자 그리모어용 범례 오버레이 — 이 게임에 실제 등장하는 진영색·마커·사망/유령표 의미를 보드 중앙에 풀어 설명 |
| [MarkerToken](../../components/MarkerToken.tsx) | server | 마커 1개 토큰 렌더(집착=2토큰, 변경/획득=직업토큰+배지). `showLabel`이면 토큰 아래 한글 라벨 캡션 |
| [NightActionRow](../../components/NightActionRow.tsx) | client | 야간/낮 행동 인라인 기록기(지목·결과·마커적용). showcase 링크에 `?as=<직업>` 부착, `직업 목록`은 `playerPicks`만 |
| [ActionFields](../../components/ActionFields.tsx) | client | 지목 칩 + 결과 위젯(행동/주장 공용 입력부). 정보 능력일 때 대상이 은둔자/첩자면 오인 경고(⚠) 표시 |
| [RolePickerModal](../../components/RolePickerModal.tsx) | client | 직업 선택 토큰 모달 — body `createPortal`·뒤로가기 닫기·`data-modal` |
| [PlayerPicker](../../components/PlayerPicker.tsx) | client | 플레이어(좌석) 선택 — 트리거 버튼 + 토큰 그리드 모달(`createPortal`·뒤로가기 닫기·`data-modal`)로 native select의 모바일 불편 대체 |
| [PickGrid](../../components/PickGrid.tsx) | client | 직업 목록 그리드(폰) — 선택 시 가운데 확대 모달 |
| [useBackClose](../../components/useBackClose.ts) | hook | 모달 열림 중 history push → 뒤로가기로 모달만 닫기(popstate-only) |
| [NightSidebar](../../components/NightSidebar.tsx) | client | 밤 행동 순서 — effective 직업 정렬·정보 노드·dual-node·일회성/흐림 |
| [DaySidebar](../../components/DaySidebar.tsx) | client | 낮 능력 행동 목록(처단자·성결자 등) |
| [AbilitiesSidebar](../../components/AbilitiesSidebar.tsx) | client | 상세 능력 사이드바(인플레이+나머지 직업) → 능력 모달, 직업별 보유 플레이어 닉네임 칩 표시 |
| [LunaticActionRow](../../components/LunaticActionRow.tsx) | client | 미치광이 전용 행 — 가짜 블러핑/하수인 지정·실제 악마 화면 복사 프리셋·보여주기 |
| [ClaimsSidebar](../../components/ClaimsSidebar.tsx) | client | 주장(블러핑) 기록 — 임의 좌석×직업 |
| [VotesSidebar](../../components/VotesSidebar.tsx) | client | 지목·투표 기록(낮) + 사망자·유령표(데드보트) 추적 — 사망 원인 글리프 표시·행 탭으로 유령표 사용/복구 토글 |
| [TimerPanel](../../components/TimerPanel.tsx) | client | 낮 타이머(밀담·공개토론) — 페이즈별 기록 |
| [FirstNightSetup](../../components/FirstNightSetup.tsx) | client | 1일차 밤 셋업 직업 안내 + 악마 블러핑 3선택(위장 직업은 후보 제외) + 미치광이·주정뱅이·꼭두각시 가짜 직업 지정(읽기 전용 모드 지원) |
| [AbilityModal](../../components/AbilityModal.tsx) | client | 직업 능력 상세 모달(능력·상세정보·운영방식·징크스·분위기) |
| [AbilityFocus](../../components/AbilityFocus.tsx) | client | 능력문 풀스크린 확대(모바일 가독성) |
| [GameReplay](../../components/GameReplay.tsx) | server | 종료 게임 복기(최종 직업·블러핑 + 페이즈별 마커/행동/투표/사망원인) |
| [SeatView](../../components/SeatView.tsx) | client | 폰 플레이어 뷰(자기 자리 직업만, 가시성 기반 15초 폴링) |
| [RoleCard](../../components/RoleCard.tsx) | server | 직업 공유/배포용 직업 카드(disguise면 가짜 직업·진영색) |
| [ClaimCard](../../components/ClaimCard.tsx) | client | 잠금 직업배포 카드(좌석 점유 30초 후 영구 숨김) |
| [DeleteGameButton](../../components/DeleteGameButton.tsx) | client | 게임 삭제 |

> 운영 컴포넌트(행동·주장·투표·셋업·상태바·마커토큰·폰뷰)의 동작·저장은 → [09 이야기꾼 운영 도구](09-storyteller-tools.md).

## PlayCanvas 내부 구조 (가장 큰 컴포넌트)

- **헤더**: 일차/페이즈, 이전│다음 페이즈, 정렬(원형/사각 드롭다운 — [HeaderToolbar](../../components/HeaderToolbar.tsx)),
  재추첨, 게임 종료, 자리(폰 링크), 나가기. (UI 장식용 이모지는 제거됨)
- **상태바 + 페이즈 메모**: [StatusBar](../../components/StatusBar.tsx) + 스냅샷 메모 textarea.
- **1일차 밤 배너**: [FirstNightSetup](../../components/FirstNightSetup.tsx)(셋업 직업 + 악마 블러핑).
- **보드**: `game.players`를 절대 위치(0~1)로 렌더. 드래그=이동, 클릭=선택. 토큰에 사망 글리프(처형 ☠️·밤 🌙·기타 ✕)·
  유령표(우하단 SVG 투표용지 아이콘 — 남음=금색 채움/사용=흐림)·고정·메모·마커([MarkerToken](../../components/MarkerToken.tsx)) 오버레이.
  전체화면 첩자 시점은 배치(원형/사각/수동)를 유지한 채 회전하며, [GrimoireLegend](../../components/GrimoireLegend.tsx) 범례를 함께 표시.
- **우측 사이드바(토글)**: `행동 순서`(밤) / `낮 능력`(낮) — 각 행에 행동 기록기·완료체크·거짓경고 /
  `상세 능력` / `주장` / `투표`(낮).
- **하단 선택 패널**: 사망/부활(+원인 토글·유령표)·고정·진영 토글·마커(중독/취함/보호/사망예정/레드헤링 +
  집착/직업변경 단일 대상선택, 능력획득/능력없음 다중 칩 — 토큰 모달)·누적 메모·(1일차 밤)직업 변경·자리 교환([PlayerPicker](../../components/PlayerPicker.tsx)).
  패널 밖 클릭 시 자동 닫힘(단 토큰·`[data-modal]` 클릭은 예외).

---
[← 준비 스텝](06-setup-and-ratio.md) · [홈](README.md) · 다음: [설계 결정·확장 →](08-decisions-and-extending.md)
