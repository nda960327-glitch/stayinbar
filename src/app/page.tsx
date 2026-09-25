import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = getSession();
  if (session) {
    redirect(session.role === "owner" ? "/owner" : session.role === "exec" ? "/exec" : "/me");
  }
  const config = await getConfig();
  const today = new Date().toISOString().slice(0, 10);
  const users = config.employees
    .filter((e) => !e.retiredAt || e.retiredAt > today)
    .map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role,
    position: e.position,
    }));
  return <LoginForm users={users} business={config.businessName} />;
}
