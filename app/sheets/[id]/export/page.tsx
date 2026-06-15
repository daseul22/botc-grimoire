import Link from "next/link";
import { notFound } from "next/navigation";
import { charactersForSheet, getSheet, sheets } from "@/lib/data";
import { getCustomSheet } from "@/lib/custom-sheets";
import { ScriptExporter } from "@/components/ScriptExporter";

// 공식 시트는 정적 생성, 커스텀 시트는 요청 시 동적 렌더
export const dynamicParams = true;

export function generateStaticParams() {
  return sheets.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = getSheet(id) ?? getCustomSheet(id);
  return { title: s ? `${s.name.ko} — PNG 내보내기` : "PNG 내보내기" };
}

export default async function SheetExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sheet = getSheet(id) ?? getCustomSheet(id);
  if (!sheet) notFound();

  const list = charactersForSheet(sheet);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/sheets/${sheet.id}`} className="text-sm text-muted hover:text-text">
          ← {sheet.name.ko}
        </Link>
        <h1 className="mt-3 text-2xl font-bold">PNG 내보내기</h1>
        <p className="mt-1 text-sm text-muted">
          공식 스크립트 빌더처럼 직업 설명 시트와 밤 순서·징크스 시트를 이미지로 저장합니다.
        </p>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted">이 시트에는 직업이 없습니다.</p>
      ) : (
        <ScriptExporter sheetName={sheet.name} characters={list} />
      )}
    </div>
  );
}
