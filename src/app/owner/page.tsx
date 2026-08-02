import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import TopBar from "@/components/TopBar";
import OwnerDashboard from "./OwnerDashboard";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const session = getSession();
  if (!session) redirect("/");
  if (session.role !== "owner") redirect("/me");
  const config = await getConfig();

  return (
    <>
      <TopBar name={session.name} role="owner" business={config.businessName} />
      <div className="container">
        <OwnerDashboard />
      </div>
    </>
  );
}
