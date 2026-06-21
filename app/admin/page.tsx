import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin, listUsers } from "@/lib/auth";
import { AdminUsers } from "@/components/AdminUsers";

export const dynamic = "force-dynamic";
export const metadata = { title: "관리 — Admin" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect("/");

  const users = listUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold">
          관리 <span className="text-base font-normal text-muted">Admin</span>
        </h1>
        <p className="text-sm text-muted">
          사용자에게 이야기꾼·관리자 권한을 부여하거나 해제합니다. 모든 사용자는 기본
          플레이어 권한을 가집니다.
        </p>
      </div>
      <AdminUsers users={users} selfId={user!.id} />
    </div>
  );
}
