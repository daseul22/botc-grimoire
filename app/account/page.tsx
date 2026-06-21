import { redirect } from "next/navigation";
import { getCurrentUser, nicknameChangeStatus } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/auth-roles";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { NicknameForm } from "@/components/NicknameForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "계정" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const nickStatus = nicknameChangeStatus(user);

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold">계정</h1>
        <p className="text-sm text-muted">내 정보와 권한.</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted">아이디</dt>
            <dd className="font-medium">{user.loginId}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted">닉네임</dt>
            <dd className="font-medium">{user.nickname}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted">권한</dt>
            <dd className="flex flex-wrap gap-1.5">
              {user.roles.map((r) => (
                <span
                  key={r}
                  className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs"
                >
                  {ROLE_LABEL[r]}
                </span>
              ))}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          이야기꾼·관리자 권한은 관리자만 부여할 수 있습니다.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">닉네임 변경</h2>
        <NicknameForm
          currentNickname={user.nickname}
          canChange={nickStatus.canChange}
          nextAt={nickStatus.nextAt}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">비밀번호 변경</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
