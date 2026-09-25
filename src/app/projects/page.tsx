import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import TopBar from "@/components/TopBar";
import ProjectsBoard from "./ProjectsBoard";
import DailyLog from "./DailyLog";

export const dynamic = "force-dynamic";

// 로그인한 사람만 볼 수 있습니다 (임원 PIN으로 들어온 사람은 보기만).
export default async function ProjectsPage() {
  const session = getSession();
  if (!session) redirect("/");
  const config = await getConfig();

  return (
    <>
      <TopBar name={session.name} role={session.role} business={config.businessName} />
      <div className="container">
        <DailyLog />
        <ProjectsBoard />
      </div>
    </>
  );
}
