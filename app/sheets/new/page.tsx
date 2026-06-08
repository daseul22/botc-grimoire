import { characters } from "@/lib/data";
import { SheetBuilder } from "@/components/SheetBuilder";

export const metadata = { title: "새 시트 만들기" };

export default function NewSheetPage() {
  return <SheetBuilder characters={characters} />;
}
