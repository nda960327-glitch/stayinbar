import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import TopBar from "@/components/TopBar";
import NoticeBoard from "@/components/NoticeBoard";
import OwnerDashboard from "./OwnerDashboard";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const session = getSession();
  if (!session) redirect("/");
  if (session.role === "exec") redirect("/exec");
  if (session.role !== "owner") redirect("/me");
  const config = await getConfig();

  return (
    <>
      <TopBar name={session.name} role="owner" business={config.businessName} />
      <div className="container">
        <NoticeBoard notices={config.notices} />
        <OwnerDashboard />
      </div>
    </>
  );
}
