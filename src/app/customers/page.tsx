import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import TopBar from "@/components/TopBar";
import CustomersClient from "./CustomersClient";

export const dynamic = "force-dynamic";

export default async function Customers() {
  const session = getSession();
  if (!session) redirect("/");
  const config = await getConfig();

  return (
    <>
      <TopBar name={session.name} role={session.role} business={config.businessName} />
      <div className="container">
        <CustomersClient role={session.role} userName={session.name} />
      </div>
    </>
  );
}
