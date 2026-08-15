"use client";

import { useState } from "react";
import Link from "next/link";
import type { Character, Lang, Localized } from "@/lib/types";
import { EDITION_MAP, TEAM_MAP } from "@/lib/constants";
import { parseJinxEntry } from "@/lib/jinx";
import { CharacterIcon } from "./CharacterIcon";
import { Badge } from "./Badge";
import { AbilityPreview } from "./AbilityPreview";
import { BehaviorSettings } from "./BehaviorSettings";

const L = (v: Localized | undefined, lang: Lang) =>
  v ? v[lang] || v.ko || v.en || "" : "";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 border-t border-border pt-4">
      <h2 className="mb-2 text-sm font-semibold text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n+/).map(
        (p, i) =>
          p.trim() && (
            <p key={i} className="mb-2 leading-relaxed">
              {p}
            </p>
          ),
      )}
    </>
  );
}

export function CharacterDetail({
  character: c,
  roster,
}: {
  character: Character;
  roster: Character[];
}) {
  const [lang, setLang] = useState<Lang>("ko");
  const ko = lang === "ko";
  const team = TEAM_MAP[c.team];
  const edition = EDITION_MAP[c.edition];
  const t = (v?: Localized) => L(v, lang);
  // 선택 언어 리스트 → 비어있으면 한국어로 폴백
  const pickList = (v?: { ko: string[]; en: string[] }) =>
    v ? ((ko ? v.ko : v.en).length ? (ko ? v.ko : v.en) : v.ko) : [];
  const steps = pickList(c.howTo);
  const jinxes = pickList(c.jinxes);

  return (
    <div className="max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
      <article className="min-w-0">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-text">
          ← 직업 목록
        </Link>
        <button
          type="button"
          onClick={() => setLang(ko ? "en" : "ko")}
          className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text"
        >
          {ko ? "English" : "한국어"}
        </button>
      </div>

      <header className="mt-4 flex items-center gap-4">
        <CharacterIcon character={c} size={72} />
        <div>
          <h1 className="text-2xl font-bold">{t(c.name)}</h1>
          <p className="text-muted">{ko ? c.name.en : c.name.ko}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge label={t(team.label)} color={team.color} />
            <Badge label={t(edition.label)} />
            {c.setup && <Badge label={ko ? "셋업 영향" : "Setup"} color="#d4a23a" />}
          </div>
        </div>
      </header>

      {c.flavor && t(c.flavor) && (
        <p className="mt-4 whitespace-pre-line rounded-lg bg-surface px-4 py-3 text-sm italic text-muted">
          {t(c.flavor)}
        </p>
      )}

      <Section title={ko ? "능력" : "Ability"}>
        <p className="leading-relaxed">{t(c.ability)}</p>
      </Section>

      {(c.firstNight || c.otherNight) && (
        <Section title={ko ? "야간 순서" : "Night Order"}>
          <ul className="space-y-2 text-sm">
            {c.firstNight && (
              <li>
                <span className="text-muted">
                  {ko ? "첫째 밤" : "First Night"} #{c.firstNight.order}
                </span>
                {c.firstNight.reminder && t(c.firstNight.reminder) && (
                  <div className="mt-0.5">{t(c.firstNight.reminder)}</div>
                )}
              </li>
            )}
            {c.otherNight && (
              <li>
                <span className="text-muted">
                  {ko ? "그 외 밤" : "Other Nights"} #{c.otherNight.order}
                </span>
                {c.otherNight.reminder && t(c.otherNight.reminder) && (
                  <div className="mt-0.5">{t(c.otherNight.reminder)}</div>
                )}
              </li>
            )}
          </ul>
        </Section>
      )}

      {c.detail && t(c.detail) && (
        <Section title={ko ? "상세정보" : "Details"}>
          <div className="text-sm text-text/90">
            <Paragraphs text={t(c.detail)} />
          </div>
        </Section>
      )}

      {steps.length > 0 && (
        <Section title={ko ? "운영방식" : "How to Run"}>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-text/90">
            {steps.map((s, i) => (
              <li key={i} className="leading-relaxed">
                {s}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {c.setup && c.setupNote && t(c.setupNote) && (
        <Section title={ko ? "셋업 효과" : "Setup"}>
          <p className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-sm font-medium text-gold">
            {t(c.setupNote)}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {ko
              ? "게임 시작 시 직업 구성(인원 분포)을 바꿉니다."
              : "Changes the character setup at the start of the game."}
          </p>
        </Section>
      )}

      {jinxes.length > 0 && (
        <Section title={ko ? "징크스 (직업 상호작용)" : "Jinxes"}>
          <ul className="space-y-2 text-sm">
            {jinxes.map((s, i) => {
              const { partner: head, rule: body } = parseJinxEntry(s);
              return (
                <li
                  key={i}
                  className="rounded-lg border border-jinx/30 bg-jinx/10 px-3 py-2 leading-relaxed"
                >
                  {head && (
                    <span className="font-semibold text-jinx">{head}</span>
                  )}
                  {head && <span className="text-muted"> — </span>}
                  <span className="text-muted">{body}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {/* 관리자에게만 렌더된다(내부에서 권한 확인 후 null). 실제 강제는 서버 액션. */}
      <BehaviorSettings character={c} roster={roster} />
      </article>
      <aside className="mt-8 lg:mt-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <AbilityPreview character={c} roster={roster} />
      </aside>
    </div>
  );
}
