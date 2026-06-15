import Link from "next/link";
import { TEAM_MAP } from "@/lib/constants";
import type { Character } from "@/lib/types";
import { CharacterIcon } from "./CharacterIcon";

export function CharacterCard({ character }: { character: Character }) {
  const team = TEAM_MAP[character.team];
  return (
    <Link
      href={`/characters/${character.id}`}
      className="group flex gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-gold/60 hover:bg-surface-2"
    >
      <CharacterIcon character={character} size={44} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-semibold">{character.name.ko}</span>
          <span className="truncate text-xs text-muted">{character.name.en}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-xs" style={{ color: team.color }}>
            {team.label.ko}
          </span>
          {character.setup && (
            <span
              className="text-xs text-gold"
              title={
                character.setupNote
                  ? `셋업: ${character.setupNote.ko}`
                  : "셋업에 영향"
              }
            >
              셋업
            </span>
          )}
          {character.jinxes && (
            <span
              className="text-xs font-medium text-jinx"
              title="직업 상호작용(징크스) 있음"
            >
              징크스
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted">
          {character.ability.ko}
        </p>
      </div>
    </Link>
  );
}
