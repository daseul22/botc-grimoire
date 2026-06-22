import { redirect } from "next/navigation";
import { getCurrentUser, isStoryteller } from "@/lib/auth";
import { listPendingInvitesForUser, listRoomsForUser, type Room } from "@/lib/rooms";
import { RoomsHome, type RoomCard, type InviteCard } from "@/components/RoomsHome";

export const dynamic = "force-dynamic";
export const metadata = { title: "온라인 방" };

const ownerNick = (room: Room) =>
  room.members.find((m) => m.role === "storyteller")?.nickname ?? "이야기꾼";

const toCard = (room: Room): RoomCard => ({
  id: room.id,
  code: room.code,
  sheetName: room.sheetName,
  status: room.status,
  memberCount: room.members.length,
  ownerNickname: ownerNick(room),
});

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { owned, joined } = listRoomsForUser(user.id);
  const invites = listPendingInvitesForUser(user.id);
  const sp = await searchParams;

  const inviteCards: InviteCard[] = invites.map(({ invite, room }) => ({
    inviteId: invite.id,
    sheetName: room.sheetName,
    code: room.code,
    ownerNickname: ownerNick(room),
  }));

  return (
    <RoomsHome
      owned={owned.map(toCard)}
      joined={joined.map(toCard)}
      invites={inviteCards}
      prefillCode={sp.code ?? ""}
      canCreate={isStoryteller(user)}
    />
  );
}
