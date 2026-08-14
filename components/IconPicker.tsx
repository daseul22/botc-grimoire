"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { uploadIconAction } from "@/app/characters/custom/actions";
import type { Character } from "@/lib/types";

// 커스텀 직업의 토큰 이미지 선택기.
// 두 경로를 함께 지원한다 — 공식 183종 토큰 재사용(능력만 커스텀인 시트에 충분)과
// 직접 업로드(완전 커스텀 아트 시트). 아무것도 안 고르면 팀 색 원 + 첫 글자로 렌더된다.

/** 업로드 전에 브라우저에서 정사각 리사이즈 — 서버 payload와 저장 용량을 함께 억제한다. */
const SIZE = 256;

function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas를 쓸 수 없습니다."));
      // 원본 비율 유지 + 중앙 크롭(토큰은 원형이라 정사각이 가장 안전).
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
      resolve(canvas.toDataURL("image/webp", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    img.src = url;
  });
}

export function IconPicker({
  value,
  onChange,
  roster,
}: {
  value: string | undefined;
  onChange: (path: string | undefined) => void;
  /** 토큰을 빌려올 공식 직업 목록 */
  roster: Character[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const withIcons = useMemo(() => roster.filter((c) => c.image), [roster]);
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return withIcons;
    return withIcons.filter((c) =>
      `${c.name.ko} ${c.name.en}`.toLowerCase().includes(query),
    );
  }, [withIcons, q]);

  function pickFile(file: File) {
    setError(undefined);
    resizeToDataUrl(file)
      .then((dataUrl) =>
        startTransition(async () => {
          const res = await uploadIconAction(dataUrl);
          if ("error" in res) setError(res.error);
          else {
            onChange(res.path);
            setOpen(false);
          }
        }),
      )
      .catch((e: Error) => setError(e.message));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="토큰" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted">없음</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            공식 토큰에서 고르기
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-40"
          >
            {pending ? "올리는 중…" : "이미지 업로드"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-text"
            >
              제거
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {!value && (
        <p className="text-xs text-muted">
          토큰을 안 고르면 분류 색 원에 이름 첫 글자가 표시된다.
        </p>
      )}

      {open && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="직업 이름으로 검색…"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60"
          />
          <div className="grid max-h-64 grid-cols-6 gap-2 overflow-y-auto sm:grid-cols-10">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.name.ko}
                onClick={() => {
                  onChange(c.image);
                  setOpen(false);
                }}
                className={`overflow-hidden rounded-full border transition-colors ${
                  value === c.image ? "border-gold" : "border-border hover:border-gold/50"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image} alt={c.name.ko} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted">검색 결과가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
