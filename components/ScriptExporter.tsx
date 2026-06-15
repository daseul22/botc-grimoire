"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { domToPng } from "modern-screenshot";
import { TEAMS } from "@/lib/constants";
import { nightInfoNode } from "@/lib/night-info";
import { parseJinxEntry } from "@/lib/jinx";
import type { Character, Localized, Team } from "@/lib/types";

// 팔레트(앱 테마와 동일, hex 고정 — 캡처 충실도용)
const C = {
  bg: "#0d0b14",
  card: "#14111c",
  surface2: "#211c2e",
  border: "#322a44",
  text: "#ece9f1",
  muted: "#a39bb5",
  gold: "#d4a23a",
  jinx: "#ec6cae",
};

// A4 세로 — 150DPI 기준 캔버스(1240×1754). 캡처 scale:2 → 2480×3508(=A4 300DPI, 인쇄용).
const A4 = { w: 1240, h: 1754, pad: 56 };
const PREVIEW_SCALE = 0.56; // 화면 미리보기 표시 배율(캡처는 원본 해상도)

const teamColor = (t: Team) => TEAMS.find((x) => x.id === t)?.color ?? C.muted;
const teamLabel = (t: Team) => TEAMS.find((x) => x.id === t)?.label.ko ?? t;

function groups(list: Character[]) {
  return TEAMS.map((t) => ({ team: t.id, items: list.filter((c) => c.team === t.id) })).filter(
    (g) => g.items.length > 0,
  );
}

type NightItem =
  | { kind: "role"; c: Character; reminder: string | null; order: number }
  | { kind: "info"; label: string; reminder: string; order: number };

// 첫밤엔 공식 운영 순서대로 하수인 정보(19)·악마 정보(22) 단계를 직업 사이에 끼워 넣는다.
// (NightSidebar의 정보 노드 order·문구와 동일)
function buildNightItems(list: Character[], phase: "firstNight" | "otherNight"): NightItem[] {
  const items: NightItem[] = list
    .map((c) => ({ c, n: c[phase] }))
    .filter((r): r is { c: Character; n: NonNullable<Character["firstNight"]> } => Boolean(r.n))
    .map((r) => ({ kind: "role" as const, c: r.c, reminder: r.n.reminder?.ko ?? null, order: r.n.order }));
  if (phase === "firstNight") {
    for (const kind of ["minion", "demon"] as const) {
      if (list.some((c) => c.team === kind)) {
        const n = nightInfoNode(kind);
        items.push({ kind: "info", label: n.label, reminder: n.reminder, order: n.order });
      }
    }
  }
  return items.sort((a, b) => a.order - b.order);
}

/** 스크립트에 양쪽 직업이 모두 있는 징크스 쌍만 추출 ("파트너 : 규칙" 파싱) */
function jinxPairs(list: Character[]) {
  const byName = new Map(list.map((c) => [c.name.ko, c]));
  const seen = new Set<string>();
  const out: { a: Character; b: Character; rule: string }[] = [];
  for (const c of list) {
    for (const entry of c.jinxes?.ko ?? []) {
      const { partner: partnerName, rule } = parseJinxEntry(entry);
      if (!partnerName) continue;
      const partner = byName.get(partnerName);
      if (!partner || partner.id === c.id) continue;
      const key = [c.id, partner.id].sort().join("|") + "::" + rule;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: c, b: partner, rule });
    }
  }
  return out;
}

function Icon({ c, size }: { c: Character; size: number }) {
  const color = teamColor(c.team);
  if (c.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={c.image}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: `${color}22`,
        color,
        border: `1px solid ${color}66`,
        fontSize: size * 0.4,
        fontWeight: 600,
      }}
    >
      {(c.name.en || c.name.ko).charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * A4 세로 1장 캔버스. 내부 콘텐츠가 A4 높이를 넘으면 자동 축소(fit-to-page)해
 * 항상 1장에 들어가게 한다. 캡처 대상(ref)은 A4 고정 픽셀 박스라 PNG가 A4 비율로 나온다.
 */
const A4Sheet = forwardRef<HTMLDivElement, { children: React.ReactNode }>(function A4Sheet(
  { children },
  ref,
) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const el = innerRef.current;
      if (!el) return;
      // scrollHeight는 transform 영향을 받지 않는 자연 높이
      const natural = el.scrollHeight;
      const avail = A4.h - A4.pad * 2;
      setScale(natural > avail ? avail / natural : 1);
    };
    fit();
    // 웹폰트(Geist) 로드 후 줄바꿈이 바뀔 수 있어 재측정
    document.fonts?.ready?.then(fit);
  }, [children]);

  return (
    <div
      ref={ref}
      style={{
        width: A4.w,
        height: A4.h,
        background: C.bg,
        color: C.text,
        position: "relative",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        ref={innerRef}
        style={{
          position: "absolute",
          top: A4.pad,
          left: A4.pad,
          width: A4.w - A4.pad * 2,
          transformOrigin: "top left",
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
});

function SheetHeader({ title, sub, count }: { title: string; sub?: string; count?: number }) {
  return (
    <div style={{ borderBottom: `2px solid ${C.gold}`, paddingBottom: 14, marginBottom: 22 }}>
      <div style={{ fontSize: 34, fontWeight: 800, color: C.gold }}>{title}</div>
      {sub && <div style={{ fontSize: 16, color: C.muted, marginTop: 3 }}>{sub}</div>}
      {count != null && (
        <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>{count}개 직업</div>
      )}
    </div>
  );
}

/** 밤 순서 한 줄 — 직업 행 또는 정보 단계(하수인/악마 정보) 노드 */
function NightItemRow({ item, index }: { item: NightItem; index: number }) {
  const badge = (
    <span
      style={{
        width: 22,
        height: 22,
        flexShrink: 0,
        marginTop: 3,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: C.surface2,
        color: C.muted,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {index + 1}
    </span>
  );
  if (item.kind === "info") {
    const accent = item.label === "하수인 정보" ? teamColor("minion") : teamColor("demon");
    return (
      <div
        style={{
          display: "flex",
          gap: 9,
          alignItems: "flex-start",
          background: C.card,
          borderLeft: `3px solid ${accent}`,
          borderRadius: 6,
          padding: "6px 9px",
        }}
      >
        {badge}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: accent }}>{item.label}</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.4, color: C.muted, marginTop: 1 }}>{item.reminder}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
      {badge}
      <Icon c={item.c} size={32} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: teamColor(item.c.team) }}>{item.c.name.ko}</div>
        {item.reminder && (
          <div style={{ fontSize: 12.5, lineHeight: 1.4, color: C.muted, marginTop: 1 }}>{item.reminder}</div>
        )}
      </div>
    </div>
  );
}

export function ScriptExporter({
  sheetName,
  characters,
}: {
  sheetName: Localized;
  characters: Character[];
}) {
  const scriptRef = useRef<HTMLDivElement>(null);
  const nightRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [excludeTravellers, setExcludeTravellers] = useState(false);

  const hasTravellers = characters.some((c) => c.team === "traveller");
  const list = excludeTravellers ? characters.filter((c) => c.team !== "traveller") : characters;
  const g = groups(list);
  const first = buildNightItems(list, "firstNight");
  const other = buildNightItems(list, "otherNight");
  const jinxes = jinxPairs(list);

  const fileBase = (sheetName.en || sheetName.ko || "script")
    .replace(/[^\w가-힣\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");

  async function save(ref: React.RefObject<HTMLDivElement | null>, suffix: string) {
    if (!ref.current) return;
    setBusy(suffix);
    try {
      // width/height를 A4 원본으로 고정 — 미리보기용 부모 transform(0.56)에 영향받지 않게.
      // scale:2 → 2480×3508 (A4 300DPI). 인쇄 시 "실제 크기"/"페이지에 맞춤" 모두 1장.
      const url = await domToPng(ref.current, {
        width: A4.w,
        height: A4.h,
        scale: 2,
        backgroundColor: C.bg,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBase}-${suffix}.png`;
      a.click();
    } catch (e) {
      console.error(e);
      alert("PNG 생성에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  // 직업 수가 많으면 3열로 — 높이를 줄여 과한 자동축소를 막는다.
  const scriptCols = list.length > 28 ? 3 : 2;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => save(scriptRef, "script")}
          disabled={busy !== null}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
        >
          {busy === "script" ? "생성 중…" : "직업 설명 PNG 저장 (A4)"}
        </button>
        <button
          type="button"
          onClick={() => save(nightRef, "night")}
          disabled={busy !== null}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text disabled:opacity-50"
        >
          {busy === "night" ? "생성 중…" : "밤 순서 PNG 저장 (A4)"}
        </button>
      </div>

      {hasTravellers && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={excludeTravellers}
            onChange={(e) => setExcludeTravellers(e.target.checked)}
            className="h-4 w-4 accent-gold"
          />
          여행자 제외하고 내보내기
        </label>
      )}

      <p className="text-xs text-muted">
        A4 세로 1장에 맞춘 고해상도(300DPI) PNG입니다. 직업이 많아 넘칠 경우 자동으로 축소해 1장에 담깁니다.
        인쇄 시 용지 A4·여백 없음(또는 페이지에 맞춤)으로 설정하세요. 미리보기는 {Math.round(PREVIEW_SCALE * 100)}% 축소 표시입니다.
      </p>

      <div className="overflow-x-auto">
        <div className="flex flex-wrap gap-6" style={{ alignItems: "flex-start" }}>
          {/* ───────── 직업 설명 시트 (A4) ───────── */}
          <div style={{ width: A4.w * PREVIEW_SCALE, height: A4.h * PREVIEW_SCALE, flexShrink: 0 }}>
            <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}>
              <A4Sheet ref={scriptRef}>
                <SheetHeader
                  title={sheetName.ko}
                  sub={sheetName.en && sheetName.en !== sheetName.ko ? sheetName.en : undefined}
                  count={list.length}
                />
                {g.map((grp) => (
                  <div key={grp.team} style={{ marginBottom: 18 }}>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: teamColor(grp.team),
                        marginBottom: 9,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{ width: 13, height: 13, borderRadius: "50%", background: teamColor(grp.team) }}
                      />
                      {teamLabel(grp.team)}
                      <span style={{ fontSize: 14, fontWeight: 400, color: C.muted }}>{grp.items.length}</span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${scriptCols}, 1fr)`,
                        gap: 9,
                      }}
                    >
                      {grp.items.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            display: "flex",
                            gap: 9,
                            alignItems: "flex-start",
                            background: C.card,
                            border: `1px solid ${C.border}`,
                            borderRadius: 9,
                            padding: "8px 10px",
                          }}
                        >
                          <Icon c={c} size={scriptCols === 3 ? 36 : 44} />
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: scriptCols === 3 ? 14 : 16,
                                fontWeight: 700,
                                color: teamColor(c.team),
                              }}
                            >
                              {c.name.ko}
                            </div>
                            <div
                              style={{
                                fontSize: scriptCols === 3 ? 12 : 13.5,
                                lineHeight: 1.4,
                                color: C.text,
                                marginTop: 2,
                              }}
                            >
                              {c.ability.ko}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </A4Sheet>
            </div>
          </div>

          {/* ───────── 밤 순서 + 징크스 시트 (A4) ───────── */}
          <div style={{ width: A4.w * PREVIEW_SCALE, height: A4.h * PREVIEW_SCALE, flexShrink: 0 }}>
            <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}>
              <A4Sheet ref={nightRef}>
                <SheetHeader title="밤 순서" sub={sheetName.ko} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 }}>
                  {[
                    { title: "첫날 밤", rows: first },
                    { title: "그 외 밤", rows: other },
                  ].map((col) => (
                    <div key={col.title}>
                      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{col.title}</div>
                      {col.rows.length === 0 ? (
                        <div style={{ fontSize: 13, color: C.muted }}>행동하는 직업이 없습니다.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {col.rows.map((item, i) => (
                            <NightItemRow
                              key={item.kind === "role" ? item.c.id : item.label}
                              item={item}
                              index={i}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {jinxes.length > 0 && (
                  <div style={{ marginTop: 24, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.jinx, marginBottom: 11 }}>
                      징크스 ({jinxes.length})
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: jinxes.length > 6 ? "1fr 1fr" : "1fr",
                        gap: 8,
                      }}
                    >
                      {jinxes.map(({ a, b, rule }, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "flex-start",
                            background: C.card,
                            borderLeft: `3px solid ${C.jinx}`,
                            borderRadius: 8,
                            padding: "8px 11px",
                          }}
                        >
                          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                            <Icon c={a} size={28} />
                            <Icon c={b} size={28} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>
                              {a.name.ko} <span style={{ color: C.muted, fontWeight: 400 }}>×</span> {b.name.ko}
                            </div>
                            <div style={{ fontSize: 12.5, lineHeight: 1.4, color: C.text, marginTop: 2 }}>
                              {rule}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </A4Sheet>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
