import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRoomByCode } from "@/lib/rooms";
import { JoinConfirm } from "@/components/JoinConfirm";

export const dynamic = "force-dynamic";
export const metadata = { title: "방 입장" };

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const room = getRoomByCode(code);
  const user = await getCurrentUser();

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="mx-auto max-w-md py-16">{children}</div>
  );

  if (!room) {
    return (
      <Shell>
        <p className="text-center text-sm text-muted">해당 코드(<span className="font-mono">{code}</span>)의 방을 찾을 수 없습니다.</p>
      </Shell>
    );
  }

  // 로그인 안 했으면 코드를 보여주고 로그인 유도(로그인 후 이 링크를 다시 열면 됨).
  if (!user) {
    return (
      <Shell>
        <div className="text-center">
          <p className="mb-1 text-xs text-muted">초대된 방</p>
          <h1 className="mb-1 text-2xl font-bold">{room.sheetName}</h1>
          <p className="mb-6 font-mono tracking-widest text-gold">{room.code}</p>
          <p className="mb-4 text-sm text-muted">입장하려면 로그인이 필요합니다.</p>
          <Link href="/login" className="rounded-lg bg-gold px-6 py-2.5 text-sm font-semibold text-bg">
            로그인
          </Link>
        </div>
      </Shell>
    );
  }

  // 이미 멤버면 바로 로비로.
  if (room.members.some((m) => m.userId === user.id)) redirect(`/rooms/${room.id}`);

  if (room.status !== "lobby") {
    return (
      <Shell>
        <p className="text-center text-sm text-muted">이미 시작했거나 닫힌 방입니다.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <JoinConfirm code={room.code} sheetName={room.sheetName} />
    </Shell>
  );
}
