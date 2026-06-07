import { TEAM_MAP } from "@/lib/constants";
import type { Character } from "@/lib/types";

export function CharacterIcon({
  character,
  size = 40,
}: {
  character: Character;
  size?: number;
}) {
  const color = TEAM_MAP[character.team].color;

  if (character.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={character.image}
        alt={character.name.ko}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  const letter = (character.name.en || character.name.ko).charAt(0).toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none"
      style={{
        width: size,
        height: size,
        background: `${color}22`,
        color,
        border: `1px solid ${color}66`,
        fontSize: size * 0.4,
      }}
    >
      {letter}
    </span>
  );
}
