import { notFound } from "next/navigation";
import { characters, getCharacter } from "@/lib/data";
import { CharacterDetail } from "@/components/CharacterDetail";

export function generateStaticParams() {
  return characters.map((c) => ({ id: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = getCharacter(id);
  return { title: c ? `${c.name.ko} (${c.name.en})` : "직업" };
}

export default async function CharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = getCharacter(id);
  if (!c) notFound();

  return <CharacterDetail character={c} roster={characters} />;
}
