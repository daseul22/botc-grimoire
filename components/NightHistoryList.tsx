"use client";

import type { Character } from "@/lib/types";
import { showcaseSummary } from "@/lib/showcase";
import { CharacterIcon } from "./CharacterIcon";
import type { NightRequestView } from "./NightRequestPanel";

const KIND_LABEL: Record<string, string> = {
  info: "정보",
  "pick-players": "플레이어 선택",
  "pick-character": "직업 선택",
  "pick-player-character": "플레이어+직업",
};
const STATUS_LABEL: Record<string, string> = {
  awaiting: "대기",
  responded: "응답 옴",
  delivered: "전달됨",
  done: "완료",
};

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

/**
 * 밤 행동 기록 목록(이야기꾼·플레이어 공용). 최근 순으로 받은 요청/응답/전달 정보를 보여준다.
 * nameOf(좌석→닉네임)는 응답 대상 좌석을 이름으로 보여주는 데 쓴다(닉네임은 공개 정보라 플레이어도 넘긴다).
 * showActor면 각 항목 헤더에 행동 좌석 이름을 앞에 붙인다(이야기꾼용 — 플레이어 본인 기록은 항상 자신이라 생략).
 */
export function NightHistoryList({
  requests,
  charMap,
  nameOf,
  showActor = false,
}: {
  requests: NightRequestView[];
  charMap: Record<string, Character>;
  nameOf?: (seat: number) => string;
  showActor?: boolean;
}) {
  if (requests.length === 0) {
    return <p className="pt-6 text-center text-xs text-muted">아직 기록이 없습니다.</p>;
  }
  const seatLabel = (seat: number) => nameOf?.(seat) ?? `좌석 ${seat + 1}`;

  return (
    <ul className="space-y-2">
      {requests.map((r) => (
        <li key={r.id} className="rounded-lg border border-border bg-bg p-2.5 text-xs">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-medium">
              {showActor && nameOf ? `${nameOf(r.seat)} · ` : ""}
              {KIND_LABEL[r.kind] ?? r.kind}
            </span>
            <span className="shrink-0 text-muted">
              {STATUS_LABEL[r.status] ?? r.status} · {fmtTime(r.createdAt)}
            </span>
          </div>
          {r.prompt && <p className="text-muted">요청: {r.prompt}</p>}
          {(r.playerTargets.length > 0 || r.playerChoice) && (
            <p>
              응답: {r.playerTargets.map(seatLabel).join(", ")}
              {r.playerChoice ? `${r.playerTargets.length ? " / " : ""}${charMap[r.playerChoice]?.name.ko ?? r.playerChoice}` : ""}
            </p>
          )}
          {r.info && (() => {
            const s = showcaseSummary(r.info, (id) => charMap[id]?.name.ko ?? id);
            return (
              <div className="mt-1">
                <span className="font-medium text-gold">{s.heading}</span>
                {s.subheading && <span className="text-muted"> — {s.subheading}</span>}
                {(s.roleTokens.length > 0 || s.nameTokens.length > 0) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {s.roleTokens.map((id, i) => {
                      const ch = charMap[id];
                      return ch ? (
                        <span key={`r${i}`} className="flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5">
                          <CharacterIcon character={ch} size={16} />
                          {ch.name.ko}
                        </span>
                      ) : null;
                    })}
                    {s.nameTokens.map((n, i) => (
                      <span key={`n${i}`} className="rounded-full border border-border px-2 py-0.5">{n}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </li>
      ))}
    </ul>
  );
}
