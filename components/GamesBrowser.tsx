"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { GameSummary } from "@/lib/games";
import { cloneGameAction, renameGameAction } from "@/app/play/actions";
import { DeleteGameButton } from "./DeleteGameButton";
import { Pill } from "./Pill";

type StatusFilter = "all" | "playing" | "finished";

/** 권한 플래그가 붙은 게임 요약 — 복제/삭제/이름변경 노출 판정용. */
type GameItem = GameSummary & { canManage: boolean };

function statusText(g: GameSummary): string {
  if (g.status === "finished")
    return `종료 · ${g.result === "good" ? "선 승리" : g.result === "evil" ? "악 승리" : "결과 없음"}`;
  return `진행 중 · ${g.day}일차 ${g.phase === "night" ? "밤" : "낮"}`;
}

/** 상태 칩 색 — 진행 중 금색, 선 승리 청색, 악 승리 적색 */
function statusChip(g: GameSummary): { label: string; cls: string } {
  if (g.status !== "finished")
    return { label: "진행 중", cls: "border-gold/40 bg-gold/10 text-gold" };
  if (g.result === "good")
    return { label: "선 승리", cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" };
  if (g.result === "evil")
    return { label: "악 승리", cls: "border-red-500/40 bg-red-500/10 text-red-300" };
  return { label: "종료", cls: "border-border bg-surface-2 text-muted" };
}

const fmtDateTime = (iso: string) => iso.slice(0, 16).replace("T", " ");
const dayOf = (iso: string) => iso.slice(0, 10);

function GameCard({
  g,
  displayName,
  editing,
  pending,
  cloning,
  onStartEdit,
  onCancel,
  onSave,
  onClone,
}: {
  g: GameItem;
  displayName: string;
  editing: boolean;
  pending: boolean;
  cloning: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: (label: string) => void;
  onClone: () => void;
}) {
  const finished = g.status === "finished";
  const canManage = g.canManage;
  const chip = statusChip(g);
  const hasLabel = g.label.trim().length > 0;
  const [draft, setDraft] = useState(g.label);

  return (
    <div className="relative flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-gold/60 hover:bg-surface-2">
      {/* 카드 전체 클릭 영역 (편집 컨트롤보다 뒤에 깔림) */}
      {!editing && (
        <Link
          href={`/play/${g.id}`}
          aria-label={`${displayName} ${finished ? "복기" : "이어서 진행"}`}
          className="absolute inset-0 z-0 rounded-xl"
        />
      )}

      <div className="pointer-events-none relative z-10 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2 pointer-events-none">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${chip.cls}`}
          >
            {chip.label}
          </span>
          {canManage && (
            <span className="pointer-events-auto">
              <DeleteGameButton id={g.id} />
            </span>
          )}
        </div>

        {editing ? (
          <div className="pointer-events-auto flex flex-col gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave(draft);
                if (e.key === "Escape") onCancel();
              }}
              placeholder={g.sheetName}
              maxLength={60}
              className="w-full rounded-lg border border-gold/60 bg-surface px-3 py-2 text-lg font-bold outline-none placeholder:font-normal placeholder:text-muted"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSave(draft)}
                disabled={pending}
                className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-40"
              >
                {pending ? "저장 중…" : "저장"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={pending}
                className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-text"
              >
                취소
              </button>
              <span className="ml-auto text-xs text-muted">{draft.length}/60</span>
            </div>
          </div>
        ) : (
          <div className="pointer-events-none">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-lg font-bold">
                {displayName}
              </h3>
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={onClone}
                    disabled={cloning}
                    title="이 게임의 셋업(좌석·닉네임·직업)을 그대로 복제해 새 게임 시작"
                    aria-label="복제"
                    className="pointer-events-auto shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-gold/60 hover:text-gold disabled:opacity-40"
                  >
                    {cloning ? "복제 중…" : "⧉ 복제"}
                  </button>
                  <button
                    type="button"
                    onClick={onStartEdit}
                    title="이름 지정"
                    aria-label="이름 지정"
                    className="pointer-events-auto shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-gold/60 hover:text-gold"
                  >
                    ✎ 이름
                  </button>
                </>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-muted">
              {hasLabel ? `스크립트 · ${g.sheetName}` : "이름 미지정"}
            </p>
          </div>
        )}

        <div className="pointer-events-none mt-1 space-y-1">
          <p className={`text-sm ${finished ? "text-muted" : "text-gold"}`}>
            {statusText(g)}
          </p>
          <p className="text-xs text-muted">
            {g.playerCount}인 · {fmtDateTime(g.createdAt)}
          </p>
        </div>

        <p className="pointer-events-none mt-2 text-xs text-gold/80">
          {finished ? "복기 보기 →" : "이어서 진행 →"}
        </p>
      </div>
    </div>
  );
}

export function GamesBrowser({ games }: { games: GameItem[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [script, setScript] = useState<string>("all");
  const [date, setDate] = useState<string>("all");
  const [sort, setSort] = useState<"new" | "old">("new");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const nameOf = (g: GameSummary) => {
    const lbl = (overrides[g.id] ?? g.label).trim();
    return lbl.length > 0 ? lbl : g.sheetName;
  };

  const scripts = useMemo(
    () => Array.from(new Set(games.map((g) => g.sheetName))).sort(),
    [games],
  );
  const dates = useMemo(
    () => Array.from(new Set(games.map((g) => dayOf(g.createdAt)))).sort().reverse(),
    [games],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = games.filter((g) => {
      if (status === "playing" && g.status === "finished") return false;
      if (status === "finished" && g.status !== "finished") return false;
      if (script !== "all" && g.sheetName !== script) return false;
      if (date !== "all" && dayOf(g.createdAt) !== date) return false;
      if (query) {
        const hay = `${overrides[g.id] ?? g.label} ${g.sheetName}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    return list.sort((a, b) =>
      sort === "new"
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
    );
  }, [games, q, status, script, date, sort, overrides]);

  const playing = filtered.filter((g) => g.status !== "finished");
  const finished = filtered.filter((g) => g.status === "finished");

  function save(id: string, label: string) {
    setOverrides((prev) => ({ ...prev, [id]: label.trim() }));
    startTransition(async () => {
      await renameGameAction(id, label);
      setEditingId(null);
    });
  }

  function clone(id: string) {
    setCloningId(id);
    // cloneGameAction은 새 게임 진행 화면으로 redirect → 성공 시 이 페이지를 떠난다.
    startTransition(() => cloneGameAction(id));
  }

  const renderCard = (g: GameItem) => (
    <GameCard
      key={`${g.id}:${editingId === g.id}`}
      g={{ ...g, label: overrides[g.id] ?? g.label }}
      displayName={nameOf(g)}
      editing={editingId === g.id}
      pending={pending && editingId === g.id}
      cloning={cloningId === g.id}
      onStartEdit={() => setEditingId(g.id)}
      onCancel={() => setEditingId(null)}
      onSave={(label) => save(g.id, label)}
      onClone={() => clone(g.id)}
    />
  );

  const filterActive =
    status !== "all" || script !== "all" || date !== "all" || q.trim().length > 0;

  return (
    <div>
      {/* 컨트롤 바 */}
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="게임 이름 · 스크립트 검색…"
            className="min-w-[16rem] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60"
          />
          <select
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-gold/60"
          >
            <option value="all">전체 날짜</option>
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Pill active={sort === "new"} onClick={() => setSort("new")}>
              최신순
            </Pill>
            <Pill active={sort === "old"} onClick={() => setSort("old")}>
              오래된순
            </Pill>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Pill active={status === "all"} onClick={() => setStatus("all")}>
            전체 상태
          </Pill>
          <Pill active={status === "playing"} onClick={() => setStatus("playing")}>
            진행 중
          </Pill>
          <Pill active={status === "finished"} onClick={() => setStatus("finished")}>
            종료됨
          </Pill>
        </div>

        {scripts.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <Pill active={script === "all"} onClick={() => setScript("all")}>
              전체 스크립트
            </Pill>
            {scripts.map((s) => (
              <Pill key={s} active={script === s} onClick={() => setScript(s)}>
                {s}
              </Pill>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          {filterActive
            ? "조건에 맞는 게임이 없습니다."
            : "아직 진행한 게임이 없습니다. 시트에서 시작하기로 게임을 시작하세요."}
        </p>
      ) : (
        <div className="space-y-8">
          {playing.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted">
                진행 중 · {playing.length}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {playing.map(renderCard)}
              </div>
            </section>
          )}
          {finished.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted">
                종료됨 · {finished.length}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {finished.map(renderCard)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
