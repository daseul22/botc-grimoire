"use client";

import { useState, useTransition } from "react";
import { useAuth } from "./AuthProvider";
import { changeNicknameAction } from "@/app/auth/actions";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60";

type GameCount = { finished: number; inProgress: number };
type Confirm = { newNickname: string; incoming: GameCount };

export function NicknameForm({
  currentNickname,
  canChange,
  nextAt,
}: {
  currentNickname: string;
  canChange: boolean;
  nextAt: string | null;
}) {
  const { refresh } = useAuth();
  const [value, setValue] = useState("");
  const [current, setCurrent] = useState(currentNickname);
  const [done, setDone] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const locked = !canChange || done;

  function run(confirmed: boolean) {
    setError(undefined);
    start(async () => {
      const r = await changeNicknameAction({ newNickname: value, confirm: confirmed });
      if ("error" in r) {
        setError(r.error);
        setConfirm(null);
      } else if ("needConfirm" in r) {
        setConfirm({ newNickname: r.newNickname, incoming: r.incoming });
      } else {
        // 성공: 헤더(AccountMenu) 갱신 + 변경 후 잠금(3개월 쿨다운)
        setCurrent(r.nickname);
        setValue("");
        setConfirm(null);
        setDone(true);
        refresh();
      }
    });
  }

  return (
    <div className="max-w-sm space-y-3">
      <p className="text-sm">
        현재 닉네임: <span className="font-semibold">{current}</span>
      </p>

      {locked ? (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          {done
            ? "닉네임이 변경되었습니다. 다음 변경은 3개월 후 가능합니다."
            : `닉네임은 3개월에 한 번만 변경할 수 있습니다.${
                nextAt ? ` 다음 변경 가능일: ${nextAt.slice(0, 10)}` : ""
              }`}
        </p>
      ) : (
        <>
          <input
            className={inputCls}
            placeholder="새 닉네임 (1~20자, 고유)"
            value={value}
            maxLength={20}
            onChange={(e) => {
              setValue(e.target.value);
              setConfirm(null);
            }}
          />

          {confirm && (
            <div className="space-y-2 rounded-lg border border-gold/40 bg-gold/5 px-3 py-3 text-xs">
              <p className="font-semibold text-gold">변경 전 확인</p>
              <p className="text-muted">변경하면:</p>
              <ul className="list-disc space-y-1 pl-4 text-muted">
                <li>
                  <span className="text-text">&quot;{confirm.newNickname}&quot;</span>(으)로 기록된
                  게스트 게임이 내 계정에 <span className="text-text">흡수</span>됩니다:
                  {confirm.incoming.finished > 0 && (
                    <>
                      {" "}
                      종료 <span className="text-gold">{confirm.incoming.finished}건</span>
                      <span className="text-muted">(통계 집계)</span>
                    </>
                  )}
                  {confirm.incoming.finished > 0 && confirm.incoming.inProgress > 0 && ","}
                  {confirm.incoming.inProgress > 0 && (
                    <span className="text-muted">
                      {" "}
                      진행 중 {confirm.incoming.inProgress}건(종료 시 연결)
                    </span>
                  )}
                  .
                </li>
                <li>
                  내 기존 전적은 계정에 묶여 있어 <span className="text-text">그대로 유지</span>됩니다.
                </li>
                <li>3개월간 다시 변경할 수 없습니다.</li>
              </ul>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(true)}
                  className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-40"
                >
                  {pending ? "변경 중…" : "확인하고 변경"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirm(null)}
                  className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-text"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {!confirm && (
            <button
              type="button"
              disabled={pending || !value.trim()}
              onClick={() => run(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:border-gold/60 disabled:opacity-40"
            >
              {pending ? "확인 중…" : "닉네임 변경"}
            </button>
          )}
          <p className="text-xs text-muted">
            닉네임은 통계·내역 집계 기준입니다. 3개월에 한 번만 변경할 수 있습니다.
          </p>
        </>
      )}
    </div>
  );
}
