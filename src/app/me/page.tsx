import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import TopBar from "@/components/TopBar";
import MyPage from "./MyPage";

export const dynamic = "force-dynamic";

export default async function Me() {
  const session = getSession();
  if (!session) redirect("/");
  if (session.role === "owner") redirect("/owner");
  const config = await getConfig();

  return (
    <>
      <TopBar name={session.name} role={session.role} business={config.businessName} />
      <div className="container">
        <MyPage />
      </div>
    </>
  );
}
