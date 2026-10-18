import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AdminDashboard } from "../../components/AdminDashboard";
export const dynamic = "force-dynamic";
export default async function Admin() {
  if (!(await auth()).userId) redirect("/");
  return <AdminDashboard/>;
}
