// 첫밤 '하수인 정보 / 악마 정보' 단계의 단일 출처 — 순수 모듈(클라/서버 공용).
//
// 진행 사이드바(NightSidebar)와 인쇄 PNG(ScriptExporter)가 이 라벨·순서·안내문을 공유한다.
// 두 곳에 따로 하드코딩하면 인쇄물과 진행 화면의 밤 운영 지시가 갈라져(용어·캐비엣 차이)
// 이야기꾼이 첫밤 정보 단계를 잘못 진행하게 된다.
export type NightInfoKind = "minion" | "demon";

export type NightInfoNode = {
  infoKind: NightInfoKind;
  /** botc 공식 firstNight order */
  order: number;
  label: string;
  /** public/icons 경로 */
  icon: string;
  /** 이야기꾼 운영 안내문 */
  reminder: string;
};

export const NIGHT_INFO_NODES: NightInfoNode[] = [
  {
    infoKind: "minion",
    order: 19,
    label: "하수인 정보",
    icon: "/icons/minion-info.png",
    reminder:
      "하수인들에게 서로 누구인지, 데몬이 누구인지 알려줍니다. (꼭두각시·마술사 인플레이 시 변형 적용)",
  },
  {
    infoKind: "demon",
    order: 22,
    label: "악마 정보",
    icon: "/icons/demon-info.png",
    reminder:
      "데몬에게 자기 직업·블러핑 3개·하수인 좌석을 알려줍니다. (꼭두각시·마술사 인플레이 시 변형 적용)",
  },
];

export const nightInfoNode = (kind: NightInfoKind): NightInfoNode =>
  NIGHT_INFO_NODES.find((n) => n.infoKind === kind)!;
