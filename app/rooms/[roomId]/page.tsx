import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getUserById } from "@/lib/auth";
import { getRoom, listInvitesForRoom } from "@/lib/rooms";
import { charactersForSheet } from "@/lib/data";
import { resolveSheet } from "@/lib/role-assign";
import { Lobby, type LobbyChar, type LobbyInvite } from "@/components/Lobby";
import { RoomRedirect } from "@/components/RoomRedirect";

export const dynamic = "force-dynamic";
export const metadata = { title: "대기실" };

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const room = getRoom(roomId);
  if (!room) notFound();

  const isOwner = room.ownerId === user.id;
  const me = room.members.find((m) => m.userId === user.id);

  // 이미 시작했으면 곧장 게임으로(이야기꾼=보드, 그 외=내 자리). 온라인 전용 라우트.
  // 서버 redirect()는 소프트 네비게이션에서 무한 진동하므로 클라이언트 replace로 우회.
  if (room.status === "started" && room.gameId) {
    return <RoomRedirect to={isOwner ? `/rooms/${roomId}/play` : `/rooms/${roomId}/seat`} />;
  }
  if (room.status === "closed") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="mb-2 text-xl font-bold">종료된 방</h1>
        <p className="text-sm text-muted">이 방은 닫혔습니다.</p>
      </div>
    );
  }
  // 멤버가 아니면 로비를 못 본다(코드/초대로 입장해야 함).
  if (!me) redirect("/rooms");

  // 이야기꾼에게만 직업 제외 UI용 시트 직업 + 보낸 초대 목록을 내려준다.
  let chars: LobbyChar[] = [];
  let invites: LobbyInvite[] = [];
  if (isOwner) {
    const sheet = resolveSheet(room.sheetId);
    if (sheet) {
      chars = charactersForSheet(sheet).map((c) => ({
        id: c.id,
        nameKo: c.name.ko,
        team: c.team,
        ability: c.ability.ko,
        image: c.image,
      }));
    }
    invites = listInvitesForRoom(roomId).map((inv) => ({
      id: inv.id,
      nickname: getUserById(inv.invitedUserId)?.nickname ?? `#${inv.invitedUserId}`,
      status: inv.status,
    }));
  }

  return (
    <Lobby
      room={{
        id: room.id,
        code: room.code,
        sheetName: room.sheetName,
        status: room.status,
        gameId: room.gameId,
        members: room.members.map((m) => ({
          userId: m.userId,
          nickname: m.nickname,
          role: m.role,
          seat: m.seat,
        })),
      }}
      meId={user.id}
      isOwner={isOwner}
      chars={chars}
      invites={invites}
    />
  );
}
