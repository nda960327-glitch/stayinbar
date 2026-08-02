import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = getSession();
  if (session) {
    redirect(session.role === "owner" ? "/owner" : "/me");
  }
  const config = await getConfig();
  const users = config.employees.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role,
    position: e.position,
  }));
  return <LoginForm users={users} business={config.businessName} />;
}
