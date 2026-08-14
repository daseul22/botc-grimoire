"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { TEAM_MAP } from "@/lib/constants";
import { RESULT_KIND_LABEL } from "@/lib/night-actions";
import type { Character } from "@/lib/types";
import { deleteCharacterAction } from "@/app/characters/custom/actions";
import { CharacterIcon } from "./CharacterIcon";

// 내가 만든 커스텀 직업 목록. 카드마다 "그리모어에서 어떻게 작동하는지"를 한 줄로 요약해
// 목록만 훑어도 설정이 맞는지 확인되게 한다.

/** 동작 정의를 사람이 읽는 요약 칩으로 — 밤 순서·지목·결과·보여주기 유무. */
function summarize(c: Character): string[] {
  const b = c.behavior ?? {};
  const chips: string[] = [];
  if (c.firstNight) chips.push(`첫밤 ${c.firstNight.order}`);
  if (c.otherNight) chips.push(`그외밤 ${c.otherNight.order}`);
  if (b.day) chips.push("낮 능력");
  const spec = b.night ?? b.day;
  if (spec) {
    if (spec.targets > 0) chips.push(`지목 ${spec.targets}명`);
    if (spec.result !== "none") chips.push(RESULT_KIND_LABEL[spec.result]);
    if (spec.marker) chips.push(`마커 ${spec.marker}`);
    if (spec.oncePerGame) chips.push("1회");
    if (spec.showcase) chips.push("보여주기");
  }
  if (!chips.length) chips.push("패시브");
  return chips;
}

export function CustomCharacterList({ items }: { items: Character[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function remove(c: Character) {
    if (!confirm(`'${c.name.ko}' 직업을 삭제할까요?\n이 직업이 들어간 시트에서도 함께 빠집니다.`))
      return;
    setError(undefined);
    startTransition(async () => {
      const res = await deleteCharacterAction(c.id);
      if (res?.error) setError(res.error);
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="text-muted">아직 만든 직업이 없습니다.</p>
        <Link
          href="/characters/custom/new"
          className="mt-3 inline-block rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg"
        >
          첫 직업 만들기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {items.map((c) => (
        <div
          key={c.id}
          className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3"
        >
          <CharacterIcon character={c} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-medium">{c.name.ko}</span>
              <span
                className="shrink-0 text-xs"
                style={{ color: TEAM_MAP[c.team]?.color }}
              >
                {TEAM_MAP[c.team]?.label.ko}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{c.ability.ko}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {summarize(c).map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Link
              href={`/characters/custom/${c.id}/edit`}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-surface-2"
            >
              수정
            </Link>
            <button
              type="button"
              onClick={() => remove(c)}
              disabled={pending}
              className="rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-red-400 disabled:opacity-40"
            >
              삭제
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
