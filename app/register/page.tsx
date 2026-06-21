import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "@/components/AuthForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "가입" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">가입</h1>
      <RegisterForm />
    </div>
  );
}
