"use client";

import { useState } from "react";
import {
  FLAG_OPTIONS,
  MARKER_OPTIONS,
  PLACEHOLDERS,
  RECIPIENT_OPTIONS,
  RESULT_KIND_OPTIONS,
  SHOWCASE_PRESETS,
  SHOWCASE_TOKEN_OPTIONS,
  TARGET_COUNT_OPTIONS,
} from "@/lib/ability-catalog";
import type { ActionSpec, ResultKind, ShowcaseSpec, ShowcaseToken } from "@/lib/behaviors";

// 한 페이즈(첫밤 / 그 외 밤 / 낮)의 행동 스펙 편집기.
// "지목 → 결과 → 마커 → 보여주기" 순서가 이야기꾼이 실제로 겪는 흐름이라 그대로 배치했다.
// 세 페이즈가 같은 컴포넌트를 쓰므로 조합 규칙이 한 곳에만 존재한다.

const FIELD =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-gold/60";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** 설명이 붙은 라디오 카드 목록. 값 하나를 고른다. */
function OptionCards<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { id: T; label: string; desc: string; example?: string }[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <div className={`grid gap-2 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`rounded-lg border p-2.5 text-left transition-colors ${
              on ? "border-gold/70 bg-gold/10" : "border-border bg-surface hover:bg-surface-2"
            }`}
          >
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">{o.desc}</span>
            {o.example && (
              <span className="mt-1 block text-[11px] text-muted/70">예: {o.example}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AbilitySpecEditor({
  spec,
  onChange,
  phase = "night",
}: {
  spec: ActionSpec;
  onChange: (next: ActionSpec) => void;
  /** 편집 중인 페이즈 — 안내 문구를 밤/낮에 맞춘다(같은 에디터를 세 페이즈가 공유하므로). */
  phase?: "night" | "otherNight" | "day";
}) {
  const set = (patch: Partial<ActionSpec>) => onChange({ ...spec, ...patch });
  const isDay = phase === "day";

  // showcase는 단일/배열 둘 다 허용하지만, 빌더에서는 단일만 편집한다.
  // (변형 2개가 필요한 건 마술사·꼭두각시 같은 예외라 공식 직업에만 있다.)
  const showcase: ShowcaseSpec = Array.isArray(spec.showcase)
    ? (spec.showcase[0] ?? {})
    : (spec.showcase ?? {});
  const hasShowcase = Object.keys(showcase).length > 0;
  const setShowcase = (patch: Partial<ShowcaseSpec>) => {
    const next = { ...showcase, ...patch };
    // 빈 문자열 필드는 지워서 저장물이 깔끔하게 유지되도록 한다.
    for (const k of Object.keys(next) as (keyof ShowcaseSpec)[])
      if (next[k] === "" || next[k] === undefined) delete next[k];
    set({ showcase: Object.keys(next).length ? next : undefined });
  };

  const toggleToken = (t: ShowcaseToken) => {
    const cur = showcase.tokens ?? [];
    setShowcase({ tokens: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] });
  };

  const [presetOpen, setPresetOpen] = useState(!hasShowcase);

  return (
    <div className="space-y-6">
      <Section
        title="지목 인원"
        hint={
          isDay
            ? "이 능력이 낮에 대상으로 삼는 인원 수. 0이면 대상 없이 결과만 기록한다."
            : "이 능력이 밤에 고르는 좌석 수. 0이면 아무도 안 고르고 결과만 받는다."
        }
      >
        <div className="flex gap-2">
          {TARGET_COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set({ targets: n })}
              className={`h-10 flex-1 rounded-lg border text-sm font-medium transition-colors ${
                spec.targets === n
                  ? "border-gold/70 bg-gold/10 text-text"
                  : "border-border bg-surface text-muted hover:bg-surface-2"
              }`}
            >
              {n === 0 ? "없음" : `${n}명`}
            </button>
          ))}
        </div>
      </Section>

      <Section title="결과 종류" hint="이야기꾼이 기록할 값의 형태. 입력 위젯이 이걸 따라간다.">
        <OptionCards
          options={RESULT_KIND_OPTIONS}
          value={spec.result}
          onChange={(v: ResultKind) => set({ result: v })}
        />
        {spec.result !== "none" && (
          <input
            value={spec.hint ?? ""}
            onChange={(e) => set({ hint: e.target.value || undefined })}
            placeholder="입력 힌트 (예: 이웃 2명 중 악 수)"
            className={FIELD}
          />
        )}
      </Section>

      <Section
        title="대상에게 걸 마커"
        hint="기록할 때 원클릭으로 제안된다. 자동 적용이 아니라 이야기꾼이 눌러야 붙는다."
      >
        <select
          value={spec.marker ?? ""}
          onChange={(e) => set({ marker: e.target.value || undefined })}
          className={FIELD}
        >
          {MARKER_OPTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.id ? ` — ${m.desc}` : ""}
            </option>
          ))}
        </select>
      </Section>

      <Section title="운영 플래그" hint="그리모어가 이 능력을 다루는 방식.">
        <div className="grid gap-2 sm:grid-cols-2">
          {FLAG_OPTIONS.map((f) => {
            const on = !!spec[f.id];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => set({ [f.id]: on ? undefined : true } as Partial<ActionSpec>)}
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
                  <span className="mt-1 block pl-6 text-[11px] text-muted/70">예: {f.example}</span>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="보여주기 화면"
        hint="결과를 플레이어 화면에 띄우는 전체화면. 템플릿을 고르고 문구만 고치면 된다."
      >
        {presetOpen ? (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {SHOWCASE_PRESETS.filter(
                (p) => p.fits.includes(spec.result) || p.id === "none",
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    set({ showcase: Object.keys(p.spec).length ? { ...p.spec } : undefined });
                    setPresetOpen(false);
                  }}
                  className="rounded-lg border border-border bg-surface p-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{p.desc}</span>
                </button>
              ))}
            </div>
            {hasShowcase && (
              <button
                type="button"
                onClick={() => setPresetOpen(false)}
                className="text-xs text-muted hover:text-text"
              >
                취소하고 현재 설정 유지
              </button>
            )}
          </div>
        ) : !hasShowcase ? (
          <button
            type="button"
            onClick={() => setPresetOpen(true)}
            className="w-full rounded-lg border border-dashed border-border py-3 text-sm text-muted hover:border-gold/40 hover:text-text"
          >
            보여주기 화면 추가
          </button>
        ) : (
          <div className="space-y-3 rounded-lg border border-border bg-surface-2/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">템플릿에서 시작해 자유롭게 수정</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPresetOpen(true)}
                  className="text-xs text-muted hover:text-text"
                >
                  템플릿 변경
                </button>
                <button
                  type="button"
                  onClick={() => set({ showcase: undefined })}
                  className="text-xs text-red-400/80 hover:text-red-400"
                >
                  제거
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <input
                value={showcase.heading ?? ""}
                onChange={(e) => setShowcase({ heading: e.target.value })}
                placeholder="큰 문구 (예: 이 사람은 {role}입니다)"
                className={FIELD}
              />
              <input
                value={showcase.subheading ?? ""}
                onChange={(e) => setShowcase({ subheading: e.target.value })}
                placeholder="작은 설명 (선택)"
                className={FIELD}
              />
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                {PLACEHOLDERS.map((p) => (
                  <span key={p.token}>
                    <code className="text-gold/80">{p.token}</code> {p.desc}
                  </span>
                ))}
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted">화면에 띄울 항목</span>
              <div className="flex flex-wrap gap-1.5">
                {SHOWCASE_TOKEN_OPTIONS.map((t) => {
                  const on = (showcase.tokens ?? []).includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleToken(t.id)}
                      title={t.desc}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        on
                          ? t.revealsIdentity
                            ? "border-red-400/60 bg-red-400/10 text-red-200"
                            : "border-gold/70 bg-gold/10"
                          : "border-border bg-surface text-muted hover:bg-surface-2"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {(showcase.tokens ?? []).some(
                (t) => SHOWCASE_TOKEN_OPTIONS.find((o) => o.id === t)?.revealsIdentity,
              ) && (
                <p className="rounded border-l-2 border-red-400/50 bg-red-400/5 px-2 py-1 text-[11px] text-red-200/85">
                  붉은 항목은 대상의 <b>직업이 그대로 드러납니다</b>. 정체를 알면 안 되는 능력이면
                  닉네임 항목으로 바꾸세요.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted">누구에게 보여주나</span>
              <OptionCards
                options={RECIPIENT_OPTIONS}
                value={showcase.recipient ?? "actor"}
                onChange={(v) => setShowcase({ recipient: v === "actor" ? undefined : v })}
                columns={3}
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={!!showcase.stack}
                onChange={(e) => setShowcase({ stack: e.target.checked || undefined })}
                className="accent-[color:var(--gold,#c9a227)]"
              />
              항목을 세로로 쌓아 표시 (토큰 → 닉네임 → 문구)
            </label>
          </div>
        )}
      </Section>
    </div>
  );
}
