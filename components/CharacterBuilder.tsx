"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { TEAMS, TEAM_MAP } from "@/lib/constants";
import { BEHAVIOR_FLAG_OPTIONS } from "@/lib/ability-catalog";
import { installBehaviors, type ActionSpec, type CharacterBehavior } from "@/lib/behaviors";
import type { Character, Team } from "@/lib/types";
import type { CustomCharacterInput } from "@/lib/custom-characters";
import { createCharacterAction, updateCharacterAction } from "@/app/characters/custom/actions";
import { AbilitySpecEditor } from "./AbilitySpecEditor";
import { AbilityPreview } from "./AbilityPreview";
import { IconPicker } from "./IconPicker";

// 커스텀 직업 빌더 — 기존 기능 블록(지목·결과·마커·보여주기·플래그)을 조합해 직업 하나를 정의한다.
//
// 미리보기는 draft 동작을 레지스트리에 주입한 뒤 실제 진행 화면과 같은 AbilityPreview를 렌더한다.
// 별도 미리보기 렌더러를 두지 않으므로 "미리보기와 실제가 다른" 사고가 구조적으로 안 생긴다.

const DRAFT_ID = "x-draft-preview";
const FIELD =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60";

const EMPTY_SPEC: ActionSpec = { targets: 0, result: "none" };

export type CharacterBuilderExisting = {
  id: string;
  input: CustomCharacterInput;
};

type PhaseKey = "night" | "otherNight" | "day";
const PHASE_LABEL: Record<PhaseKey, string> = {
  night: "첫째 밤",
  otherNight: "그 외 밤",
  day: "낮",
};

export function CharacterBuilder({
  roster,
  existing,
}: {
  /** 공식 직업 전체 — 아이콘 빌리기·밤 순서 안내·미리보기 모의 좌석에 쓴다. */
  roster: Character[];
  existing?: CharacterBuilderExisting;
}) {
  const editing = !!existing;
  const [v, setV] = useState<CustomCharacterInput>(
    existing?.input ?? {
      nameKo: "",
      team: "townsfolk",
      abilityKo: "",
      behavior: {},
    },
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const set = (patch: Partial<CustomCharacterInput>) => setV((p) => ({ ...p, ...patch }));
  const setBehavior = (patch: Partial<CharacterBehavior>) =>
    setV((p) => {
      const b = { ...p.behavior, ...patch };
      for (const k of Object.keys(b) as (keyof CharacterBehavior)[])
        if (b[k] === undefined) delete b[k];
      return { ...p, behavior: b };
    });

  // 어떤 페이즈에 행동이 있는가 — 밤은 순서(order)가 있어야 실제로 깨어난다.
  const hasFirstNight = v.firstOrder != null;
  const hasOtherNight = v.otherOrder != null;
  const hasDay = !!v.behavior.day;

  const availablePhases = useMemo<PhaseKey[]>(() => {
    const list: PhaseKey[] = [];
    if (hasFirstNight) list.push("night");
    if (hasOtherNight) list.push("otherNight");
    if (hasDay) list.push("day");
    return list;
  }, [hasFirstNight, hasOtherNight, hasDay]);

  const [phase, setPhase] = useState<PhaseKey>("night");
  const activePhase = availablePhases.includes(phase) ? phase : availablePhases[0];

  // draft를 레지스트리에 주입 — 미리보기가 실제 조회 경로(specForPhase 등)를 그대로 타게 한다.
  const draft: Character = useMemo(() => {
    installBehaviors({ [DRAFT_ID]: v.behavior });
    return {
      id: DRAFT_ID,
      name: { ko: v.nameKo || "이름 없음", en: v.nameEn || v.nameKo || "Custom" },
      edition: "other",
      team: v.team,
      ability: { ko: v.abilityKo, en: v.abilityEn ?? v.abilityKo },
      firstNight: v.firstOrder != null ? { order: v.firstOrder, reminder: null } : null,
      otherNight: v.otherOrder != null ? { order: v.otherOrder, reminder: null } : null,
      reminders: v.reminders ?? [],
      setup: !!v.setup,
      custom: true,
      behavior: v.behavior,
      ...(v.image ? { image: v.image } : {}),
    };
  }, [v]);

  // 입력한 밤 순서가 공식 직업들 사이 어디에 끼는지 — 순서 숫자만 보면 감이 안 오므로 이웃을 보여준다.
  const neighborsAt = (order: number | null | undefined, key: "firstNight" | "otherNight") => {
    if (order == null) return null;
    const sorted = roster
      .filter((c) => c[key])
      .map((c) => ({ name: c.name.ko, order: c[key]!.order }))
      .sort((a, b) => a.order - b.order);
    const before = [...sorted].reverse().find((c) => c.order < order);
    const after = sorted.find((c) => c.order > order);
    return { before, after };
  };

  function save() {
    setError(undefined);
    startTransition(async () => {
      const res = editing
        ? await updateCharacterAction(existing.id, v)
        : await createCharacterAction(v);
      if (res?.error) setError(res.error);
    });
  }

  const canSave = v.nameKo.trim() && v.abilityKo.trim() && !pending;

  return (
    <div className="pb-24">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{editing ? "직업 수정" : "새 직업 만들기"}</h1>
        <Link href="/characters/custom" className="text-sm text-muted hover:text-text">
          취소
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {/* ── 편집 ── */}
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">기본 정보</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={v.nameKo}
                onChange={(e) => set({ nameKo: e.target.value })}
                placeholder="직업 이름 (필수)"
                className={FIELD}
              />
              <input
                value={v.nameEn ?? ""}
                onChange={(e) => set({ nameEn: e.target.value })}
                placeholder="영문 이름 (선택)"
                className={FIELD}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {TEAMS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set({ team: t.id as Team })}
                  className="rounded-full border px-3 py-1.5 text-sm transition-colors"
                  style={
                    v.team === t.id
                      ? { borderColor: t.color, background: `${t.color}22`, color: t.color }
                      : { borderColor: "var(--border, #333)" }
                  }
                >
                  {t.label.ko}
                </button>
              ))}
            </div>

            <textarea
              value={v.abilityKo}
              onChange={(e) => set({ abilityKo: e.target.value })}
              placeholder="능력 설명 (필수) — 시트와 직업 상세에 그대로 표시된다"
              rows={3}
              className={FIELD}
            />

            <IconPicker value={v.image} onChange={(p) => set({ image: p })} roster={roster} />

            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={!!v.setup}
                onChange={(e) => set({ setup: e.target.checked })}
                className="accent-[color:var(--gold,#c9a227)]"
              />
              게임 구성을 바꾸는 직업 (외지인 수 변경 등)
            </label>
            {v.setup && (
              <input
                value={v.setupNoteKo ?? ""}
                onChange={(e) => set({ setupNoteKo: e.target.value })}
                placeholder="구성 변경 안내 (예: 외지인 +1)"
                className={FIELD}
              />
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">언제 행동하나</h2>
            <p className="text-xs text-muted">
              밤 순서는 이야기꾼이 좌석을 깨우는 차례다. 숫자가 작을수록 먼저 깨운다.
            </p>

            {(
              [
                { key: "firstOrder", night: "firstNight", label: "첫째 밤", rem: "firstReminderKo" },
                { key: "otherOrder", night: "otherNight", label: "그 외 밤", rem: "otherReminderKo" },
              ] as const
            ).map((row) => {
              const order = v[row.key];
              const on = order != null;
              const nb = neighborsAt(order, row.night);
              return (
                <div key={row.key} className="rounded-lg border border-border bg-surface p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        set({
                          [row.key]: e.target.checked ? 20 : null,
                          ...(e.target.checked && !v.behavior[row.night === "firstNight" ? "night" : "otherNight"]
                            ? {}
                            : {}),
                        } as Partial<CustomCharacterInput>)
                      }
                      className="accent-[color:var(--gold,#c9a227)]"
                    />
                    <span className="font-medium">{row.label}에 깨운다</span>
                  </label>
                  {on && (
                    <div className="mt-2 space-y-2 pl-6">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={order ?? 0}
                          onChange={(e) =>
                            set({ [row.key]: Number(e.target.value) } as Partial<CustomCharacterInput>)
                          }
                          className="w-24 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-gold/60"
                        />
                        {nb && (
                          <span className="text-xs text-muted">
                            {nb.before ? nb.before.name : "맨 처음"} 다음 ·{" "}
                            {nb.after ? nb.after.name : "맨 마지막"} 앞
                          </span>
                        )}
                      </div>
                      <input
                        value={v[row.rem] ?? ""}
                        onChange={(e) =>
                          set({ [row.rem]: e.target.value } as Partial<CustomCharacterInput>)
                        }
                        placeholder="이야기꾼 안내 문구 (순서표에 표시)"
                        className={FIELD}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <div className="rounded-lg border border-border bg-surface p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasDay}
                  onChange={(e) => setBehavior({ day: e.target.checked ? { ...EMPTY_SPEC } : undefined })}
                  className="accent-[color:var(--gold,#c9a227)]"
                />
                <span className="font-medium">낮에 쓰는 능력이 있다</span>
              </label>
              <p className="mt-1 pl-6 text-xs text-muted">
                슬레이어·처녀처럼 낮에 공개적으로 발동하는 능력.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">동작</h2>
            {availablePhases.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
                위에서 밤 순서나 낮 능력을 먼저 켜세요. 행동이 없는 순수 패시브 직업이면 이대로 두면
                된다 — 능력 설명만으로 이야기꾼이 운영한다.
              </p>
            ) : (
              <>
                {availablePhases.length > 1 && (
                  <div className="flex gap-2">
                    {availablePhases.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPhase(p)}
                        className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                          activePhase === p
                            ? "border-gold/70 bg-gold/10"
                            : "border-border bg-surface text-muted hover:bg-surface-2"
                        }`}
                      >
                        {PHASE_LABEL[p]}
                      </button>
                    ))}
                  </div>
                )}
                {activePhase && (
                  <AbilitySpecEditor
                    spec={v.behavior[activePhase] ?? EMPTY_SPEC}
                    onChange={(next) => setBehavior({ [activePhase]: next })}
                  />
                )}
                {activePhase === "otherNight" && !v.behavior.otherNight && (
                  <p className="text-xs text-muted">
                    비워 두면 첫째 밤과 같은 동작을 쓴다. 다르게 하려면 위 항목을 조정하세요.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">운영 규칙</h2>
            <input
              value={v.behavior.criteria ?? ""}
              onChange={(e) => setBehavior({ criteria: e.target.value || undefined })}
              placeholder="이야기꾼 판정 기준 (예: 양옆 생존자 중 악의 수. 죽은 사람은 건너뛴다)"
              className={FIELD}
            />
            <p className="text-xs text-muted">
              밤 순서표에서 능력 설명 아래에 별도 줄로 표시된다. 셈하는 규칙이 헷갈리는 정보 능력에
              적어 두면 진행이 빨라진다.
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              {BEHAVIOR_FLAG_OPTIONS.map((f) => {
                const on = !!v.behavior[f.id];
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setBehavior({ [f.id]: on ? undefined : true })}
                    className={`rounded-lg border p-2.5 text-left transition-colors ${
                      on ? "border-gold/70 bg-gold/10" : "border-border bg-surface hover:bg-surface-2"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                          on ? "border-gold bg-gold text-bg" : "border-border text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      {f.label}
                    </span>
                    <span className="mt-0.5 block pl-6 text-xs leading-relaxed text-muted">
                      {f.desc}
                    </span>
                    {f.example && (
                      <span className="mt-1 block pl-6 text-[11px] text-muted/70">
                        예: {f.example}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* ── 미리보기 ── */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-border bg-surface-2/30 p-3">
            <h2 className="mb-2 text-sm font-semibold">미리보기</h2>
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2"
                style={{ borderColor: TEAM_MAP[v.team]?.color }}
              >
                {v.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span style={{ color: TEAM_MAP[v.team]?.color }}>
                    {(v.nameEn || v.nameKo || "?").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{v.nameKo || "이름 없음"}</p>
                <p className="line-clamp-2 text-xs text-muted">
                  {v.abilityKo || "능력 설명이 여기 표시된다"}
                </p>
              </div>
            </div>

            {availablePhases.length > 0 ? (
              <AbilityPreview character={draft} roster={roster} />
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
                행동을 켜면 보여주기 화면을 시뮬레이션할 수 있다.
              </p>
            )}
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[88rem] items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm text-muted">
            {error ? <span className="text-red-400">{error}</span> : "저장하면 시트에 넣을 수 있다"}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
          >
            {pending ? "저장 중…" : editing ? "변경 저장" : "직업 만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}
