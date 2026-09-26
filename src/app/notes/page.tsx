import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import TopBar from "@/components/TopBar";
import NotesPanel from "./NotesPanel";

export const dynamic = "force-dynamic";

// 로그인한 직원만. 임원 계정은 사람이 아니라 열람용이라 쪽지함을 쓰지 않습니다.
export default async function NotesPage() {
  const session = getSession();
  if (!session) redirect("/");
  if (session.role === "exec") redirect("/exec");
  const config = await getConfig();

  return (
    <>
      <TopBar name={session.name} role={session.role} business={config.businessName} />
      <div className="container">
        <NotesPanel />
      </div>
    </>
  );
}
