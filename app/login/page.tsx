import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/AuthForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "로그인" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">로그인</h1>
      <LoginForm />
    </div>
  );
}
