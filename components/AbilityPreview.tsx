"use client";

import { useMemo, useState } from "react";
import { TEAM_MAP } from "@/lib/constants";
import {
  dayActionSpec,
  pickShowcase,
  RESULT_KIND_LABEL,
  showcaseVariants,
  specForPhase,
  type ActionSpec,
} from "@/lib/night-actions";
import type { Character, GamePlayer, Phase } from "@/lib/types";
import { ActionFields } from "./ActionFields";
import { RolePickerModal } from "./RolePickerModal";
import { ShowcaseView } from "./ShowcaseView";

// 직업 상세의 "능력 미리보기" — 게임 진행에 들어가지 않고도 행동 기록 → 보여주기를 시뮬레이션한다.
// 실제 show 페이지와 동일한 ShowcaseView 렌더러를 써서 보여주기가 1:1로 일치한다.

/** 모의 좌석 닉네임/직업 기본값(편집 가능). 0번은 능력 사용자(본인). */
const DEFAULT_NICKS = ["지환", "민준", "서연", "도윤", "하은", "지호", "수아", "유나"];
const DEFAULT_MOCK_ROLES = ["chef", "empath", "investigator", "librarian", "washerwoman", "butler", "ravenkeeper"];

type PhaseTab = { key: string; label: string; phase: Phase; day: number };
type Mock = { seat: number; nickname: string; characterId: string };

function mkPlayer(seat: number, nickname: string, characterId: string): GamePlayer {
  return {
    seat,
    nickname,
    characterId,
    alignment: "good",
    x: 0,
    y: 0,
    locked: false,
    status: "alive",
    markers: [],
    memo: "",
    deathCause: "",
    ghostVoteUsed: false,
  };
}

export function AbilityPreview({
  character,
  roster,
}: {
  character: Character;
  roster: Character[];
}) {
  const charMap = useMemo(
    () => Object.fromEntries(roster.map((c) => [c.id, c])) as Record<string, Character>,
    [roster],
  );

  // 시뮬레이션 가능한 페이즈 — 야간 순서(데이터) + 낮 능력 스펙 기준.
  const phaseTabs = useMemo<PhaseTab[]>(() => {
    const tabs: PhaseTab[] = [];
    if (character.firstNight) tabs.push({ key: "first", label: "첫째 밤", phase: "night", day: 1 });
    if (character.otherNight) tabs.push({ key: "other", label: "그 외 밤", phase: "night", day: 2 });
    if (dayActionSpec(character.id)) tabs.push({ key: "day", label: "낮", phase: "day", day: 1 });
    return tabs;
  }, [character]);

  const [activeKey, setActiveKey] = useState(phaseTabs[0]?.key ?? "");
  const active = phaseTabs.find((t) => t.key === activeKey) ?? phaseTabs[0];
  const spec: ActionSpec | undefined = active
    ? specForPhase(character.id, active.phase, active.day)
    : undefined;

  // 능력 사용자(본인) 닉네임 + 모의 다른 좌석들.
  const [actorNick, setActorNick] = useState(DEFAULT_NICKS[0]);
  const [mocks, setMocks] = useState<Mock[]>(() =>
    DEFAULT_NICKS.slice(1).map((nickname, i) => ({
      seat: i + 1,
      nickname,
      characterId: DEFAULT_MOCK_ROLES[i] ?? roster[i]?.id ?? character.id,
    })),
  );

  const [targets, setTargets] = useState<number[]>([]);
  const [result, setResult] = useState("");
  const [variant, setVariant] = useState(0);
  const [editSeat, setEditSeat] = useState<number | null>(null); // 모의 좌석 직업 편집 모달
  const [rosterOpen, setRosterOpen] = useState(false); // 모의 좌석 편집 패널 접힘 상태

  // 페이즈 전환 — 스펙이 달라져 지목 수/결과 종류가 바뀌므로 입력을 초기화한다.
  const switchPhase = (key: string) => {
    setActiveKey(key);
    setTargets([]);
    setResult("");
    setVariant(0);
  };

  const players = useMemo<GamePlayer[]>(
    () => [mkPlayer(0, actorNick, character.id), ...mocks.map((m) => mkPlayer(m.seat, m.nickname, m.characterId))],
    [actorNick, mocks, character.id],
  );

  // ─── 보여주기 입력 결정 (show 페이지와 같은 헬퍼로 변형 선택) ───
  const showcaseArr = spec ? showcaseVariants(spec) : [];
  const showcaseLabels = spec?.showcaseLabels ?? [];
  const showcase = spec ? pickShowcase(spec, variant) : undefined;
  // 게임 셋업(블러핑/하수인 좌석)에 의존하는 특수 모드는 시뮬레이션 불가 — 안내.
  const modeShowcase = showcase?.mode;

  const targetPlayers = targets.map((s) => players.find((p) => p.seat === s));
  const actorChar = charMap[character.id];
  const getChar = (id: string) => charMap[id];

  const editingPlayer = editSeat != null ? mocks.find((m) => m.seat === editSeat) : undefined;

  if (phaseTabs.length === 0 || !spec || !active) {
    return (
      <PreviewShell>
        <p className="text-sm text-muted">
          이 직업은 밤·낮 행동이 없어 보여주기 시뮬레이션이 없습니다.
        </p>
      </PreviewShell>
    );
  }

  return (
    <PreviewShell>
      {/* 페이즈 탭 */}
      {phaseTabs.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {phaseTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchPhase(t.key)}
              className={`rounded-full px-3 py-1 text-xs ${
                active.key === t.key
                  ? "bg-gold/20 text-gold ring-1 ring-gold/50"
                  : "bg-surface-2 text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* 스펙 요약 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        <SpecChip>지목 {spec.targets === 0 ? "없음" : `최대 ${spec.targets}`}</SpecChip>
        <SpecChip>결과 · {RESULT_KIND_LABEL[spec.result]}</SpecChip>
        {spec.oncePerGame && <SpecChip tone="gold">일회성</SpecChip>}
        {spec.deathTriggered && <SpecChip tone="gold">사망 시 발동</SpecChip>}
        {spec.playerPicks && <SpecChip tone="blue">직업 목록(플레이어 선택)</SpecChip>}
      </div>
      {spec.hint && <p className="mb-3 text-[11px] text-muted">기준: {spec.hint}</p>}

      {/* 능력 사용자(본인) 닉네임 */}
      <label className="mb-2 flex items-center gap-2 text-xs">
        <span className="shrink-0 text-muted">능력 사용자</span>
        <input
          value={actorNick}
          onChange={(e) => setActorNick(e.target.value)}
          className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 outline-none focus:border-gold/60"
        />
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px]"
          style={{ background: `${TEAM_MAP[character.team]?.color}22`, color: TEAM_MAP[character.team]?.color }}
        >
          {character.name.ko}
        </span>
      </label>

      {/* 모의 좌석 편집 (접힘) */}
      <button
        type="button"
        onClick={() => setRosterOpen((v) => !v)}
        className="mb-2 text-xs text-muted hover:text-text"
      >
        {rosterOpen ? "▾" : "▸"} 모의 좌석 편집 ({mocks.length}명)
      </button>
      {rosterOpen && (
        <div className="mb-3 space-y-1.5 rounded-md border border-border bg-surface-2/50 p-2">
          {mocks.map((m) => {
            const ch = charMap[m.characterId];
            return (
              <div key={m.seat} className="flex items-center gap-2 text-xs">
                <input
                  value={m.nickname}
                  onChange={(e) =>
                    setMocks((cur) => cur.map((x) => (x.seat === m.seat ? { ...x, nickname: e.target.value } : x)))
                  }
                  className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 outline-none focus:border-gold/60"
                />
                <button
                  type="button"
                  onClick={() => setEditSeat(m.seat)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 hover:border-gold/60"
                  title="이 좌석의 직업 변경"
                >
                  {ch?.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ch.image} alt="" className="h-4 w-4 rounded-full object-cover" />
                  )}
                  <span style={{ color: ch ? TEAM_MAP[ch.team]?.color : undefined }}>{ch?.name.ko ?? "?"}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 지목/결과 입력 — 실제 행동 기록과 동일한 위젯 */}
      <div className="mb-3 space-y-2 rounded-md border border-border bg-surface-2 p-2 text-xs">
        <ActionFields
          spec={spec}
          players={players}
          charMap={charMap}
          actorSeat={0}
          actorCharacterId={character.id}
          targets={targets}
          setTargets={setTargets}
          result={result}
          setResult={setResult}
        />
      </div>

      {/* showcase 변형 선택(마술사 악마용/하수인용, 꼭두각시 정확/이웃, 미치광이 블러핑/하수인) */}
      {showcaseArr.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">변형:</span>
          {showcaseArr.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setVariant(i)}
              className={`rounded px-2 py-0.5 ${
                variant === i ? "bg-gold/20 text-gold ring-1 ring-gold/50" : "bg-surface-2 text-muted hover:text-text"
              }`}
            >
              {showcaseLabels[i] ?? `#${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* 보여주기 미리보기 — 실제 풀스크린과 동일한 렌더러 */}
      <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">보여주기 미리보기</p>
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-5 rounded-lg border border-border bg-bg px-4 py-6">
        {modeShowcase ? (
          <p className="max-w-xs break-keep text-center text-sm text-muted">
            이 보여주기는 게임 셋업 데이터(블러핑·하수인 좌석)에 의존합니다.
            <br />
            실제 진행 화면에서 확인하세요.
          </p>
        ) : (
          <ShowcaseView
            actorNickname={actorNick}
            actorChar={actorChar}
            targetPlayers={targetPlayers}
            resultStr={result}
            spec={spec}
            showcase={showcase}
            getChar={getChar}
            hasRecord
          />
        )}
      </div>

      {spec.playerPicks && (
        <p className="mt-2 text-[11px] text-muted">
          ※ 이 능력은 플레이어가 폰에서 직접 직업을 고릅니다(진행 화면의 &lsquo;직업 목록&rsquo;).
        </p>
      )}

      <RolePickerModal
        open={editSeat != null}
        title="모의 좌석 직업 선택"
        candidates={roster}
        selected={editingPlayer?.characterId ?? ""}
        onPick={(id) =>
          setMocks((cur) => cur.map((x) => (x.seat === editSeat ? { ...x, characterId: id || x.characterId } : x)))
        }
        onClose={() => setEditSeat(null)}
      />
    </PreviewShell>
  );
}

function PreviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">능력 미리보기</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
          행동을 기록하면 진행 화면의 &lsquo;보여주기&rsquo;가 어떻게 보이는지 그대로 시뮬레이션합니다.
        </p>
      </div>
      {children}
    </div>
  );
}

function SpecChip({ children, tone }: { children: React.ReactNode; tone?: "gold" | "blue" }) {
  const cls =
    tone === "gold"
      ? "bg-gold/15 text-gold"
      : tone === "blue"
        ? "bg-blue-500/15 text-blue-300"
        : "bg-surface-2 text-muted";
  return <span className={`rounded px-1.5 py-0.5 ${cls}`}>{children}</span>;
}
