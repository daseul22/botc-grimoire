"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BEHAVIOR_FLAG_OPTIONS, validateBehavior } from "@/lib/ability-catalog";
import {
  baseBehavior,
  installBehaviors,
  type ActionSpec,
  type CharacterBehavior,
} from "@/lib/behaviors";
import type { Character } from "@/lib/types";
import { resetBehaviorAction, saveBehaviorAction } from "@/app/characters/custom/actions";
import { useAuth } from "./AuthProvider";
import { AbilitySpecEditor } from "./AbilitySpecEditor";
import { AbilityPreview } from "./AbilityPreview";

// 직업 상세의 "그리모어 동작 설정" — 이 직업이 진행 중 어떻게 작동할지 직접 조작한다.
//
// **관리자 전용.** 공식 직업 수정은 진행 중인 게임을 포함해 모든 게임에 적용되고, 커스텀 직업도
// 남의 것을 포함해 여기서 손댈 수 있어서다. 개인 변형은 /characters/custom에서 자기 직업을 만든다.
//
// 저장 위치는 직업 종류에 따라 갈린다:
//   공식  → character_overrides (전역 적용)
//   커스텀 → custom_characters   (그 직업만)
//
// 권한 게이팅은 여기(클라 AuthProvider)에서, 실제 강제는 서버 액션에서 두 겹으로 한다
// (이 프로젝트의 기존 접근제어 방식과 동일).

/** 미리보기 전용 임시 id — 편집 중 값이 전역 레지스트리의 실제 직업을 오염시키지 않게 격리한다. */
const DRAFT_ID = "x-behavior-draft";

const EMPTY_SPEC: ActionSpec = { targets: 0, result: "none" };

type PhaseKey = "night" | "otherNight" | "day";
const PHASE_LABEL: Record<PhaseKey, string> = {
  night: "첫째 밤",
  otherNight: "그 외 밤",
  day: "낮",
};

/** 저장물 비교용 정규화 — 키 순서에 흔들리지 않게. */
const norm = (b: CharacterBehavior) => JSON.stringify(b, Object.keys(b).sort());

export function BehaviorSettings({
  character: c,
  roster,
}: {
  character: Character;
  roster: Character[];
}) {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  // 서버가 내려준 현재 동작 — 공식은 override가 있을 때만 채워지므로 기본값으로 폴백한다.
  const current = useMemo<CharacterBehavior>(
    () => c.behavior ?? baseBehavior(c.id) ?? {},
    [c.behavior, c.id],
  );
  const [draft, setDraft] = useState<CharacterBehavior>(current);

  // 서버 데이터가 갱신되면(저장 후 refresh) draft를 서버 진실로 재동기화 — 렌더 중 파생 리셋.
  const [lastCurrent, setLastCurrent] = useState(current);
  if (norm(current) !== norm(lastCurrent)) {
    setLastCurrent(current);
    setDraft(current);
  }

  const isCustom = !!c.custom;
  const canEdit = isAdmin;

  // 미리보기: draft를 격리 id로 주입하고 그 id를 가진 가짜 직업을 렌더한다(빌더와 같은 방식).
  const previewChar = useMemo<Character>(() => {
    installBehaviors({ [DRAFT_ID]: draft });
    return { ...c, id: DRAFT_ID, behavior: draft };
  }, [c, draft]);

  if (!canEdit) return null;

  const setBehavior = (patch: Partial<CharacterBehavior>) =>
    setDraft((p) => {
      const b = { ...p, ...patch };
      for (const k of Object.keys(b) as (keyof CharacterBehavior)[])
        if (b[k] === undefined) delete b[k];
      return b;
    });

  const phases: PhaseKey[] = ["night", "otherNight", "day"];
  const dirty = norm(draft) !== norm(current);
  const overridden = !isCustom && !!c.behavior; // 공식인데 behavior가 실려 왔다 = override 있음
  const invalid = validateBehavior(draft);

  function save() {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const res = await saveBehaviorAction(c.id, draft);
      if (res?.error) setError(res.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function reset() {
    if (!confirm("이 직업의 동작을 기본값으로 되돌릴까요? 모든 게임에 적용됩니다.")) return;
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const res = await resetBehaviorAction(c.id);
      if (res?.error) setError(res.error);
      else {
        setDraft(baseBehavior(c.id) ?? {});
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-sky-500/30 bg-sky-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span>
          <span className="text-sm font-semibold text-sky-200">그리모어 동작 설정</span>
          <span className="ml-2 text-xs text-muted">
            관리자 전용 · 지목 · 결과 · 마커 · 보여주기
          </span>
          {overridden && (
            <span className="ml-2 rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200">
              기본값에서 수정됨
            </span>
          )}
        </span>
        <span className="text-xs text-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-sky-500/20 px-4 py-4">
          <p className="rounded border-l-2 border-amber-400/50 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-100/85">
            {isCustom ? (
              <>
                이 커스텀 직업의 동작을 바꿉니다. 이름 · 아이콘 · 밤 순서까지 고치려면{" "}
                <Link href={`/characters/custom/${c.id}/edit`} className="underline">
                  전체 편집
                </Link>
                으로 가세요.
              </>
            ) : (
              <>
                공식 직업의 동작을 덮어씁니다. <b>진행 중인 게임을 포함해 모든 게임에 적용</b>됩니다.
                이 판에서만 다르게 쓰려면{" "}
                <Link href="/characters/custom/new" className="underline">
                  커스텀 직업
                </Link>
                으로 복제하는 쪽이 안전합니다.
              </>
            )}
          </p>

          {!c.firstNight && !c.otherNight && (
            <p className="text-xs text-muted">
              이 직업은 밤 순서가 없어 밤에 깨우지 않습니다. 밤 동작을 넣어도 순서표에 뜨지 않으니,
              밤에 깨워야 한다면 커스텀 직업으로 만들어 순서를 지정하세요.
            </p>
          )}

          {phases.map((p) => {
            const spec = draft[p];
            const enabled = !!spec;
            return (
              <div key={p} className="rounded-lg border border-border bg-surface p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) =>
                      setBehavior({ [p]: e.target.checked ? { ...EMPTY_SPEC } : undefined })
                    }
                    className="accent-[color:var(--gold,#c9a227)]"
                  />
                  <span className="font-medium">{PHASE_LABEL[p]}에 행동한다</span>
                  {p === "otherNight" && !enabled && (
                    <span className="text-xs text-muted">— 끄면 첫째 밤과 동일하게 동작</span>
                  )}
                </label>
                {enabled && spec && (
                  <div className="mt-3 border-t border-border pt-3">
                    <AbilitySpecEditor spec={spec} onChange={(next) => setBehavior({ [p]: next })} />
                  </div>
                )}
              </div>
            );
          })}

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">운영 규칙</h4>
            <input
              value={draft.criteria ?? ""}
              onChange={(e) => setBehavior({ criteria: e.target.value || undefined })}
              placeholder="이야기꾼 판정 기준 (밤 순서표에 별도 줄로 표시)"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {BEHAVIOR_FLAG_OPTIONS.map((f) => {
                const on = !!draft[f.id];
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
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface-2/30 p-3">
            <h4 className="mb-2 text-sm font-semibold">
              변경 후 미리보기
              {dirty && <span className="ml-2 text-xs font-normal text-gold">저장 안 됨</span>}
            </h4>
            <AbilityPreview character={previewChar} roster={roster} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <span className="text-xs">
              {error ? (
                <span className="text-red-400">{error}</span>
              ) : invalid ? (
                <span className="text-amber-300">{invalid}</span>
              ) : saved && !dirty ? (
                <span className="text-emerald-300">저장됨</span>
              ) : (
                <span className="text-muted">
                  {dirty ? "변경 사항이 있습니다" : "변경 사항 없음"}
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {dirty && (
                <button
                  type="button"
                  onClick={() => setDraft(current)}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-text"
                >
                  되돌리기
                </button>
              )}
              {overridden && (
                <button
                  type="button"
                  onClick={reset}
                  disabled={pending}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-text disabled:opacity-40"
                >
                  기본값으로
                </button>
              )}
              <button
                type="button"
                onClick={save}
                disabled={!dirty || !!invalid || pending}
                className="rounded-lg bg-gold px-4 py-1.5 text-sm font-semibold text-bg disabled:opacity-40"
              >
                {pending ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
