import { notFound } from "next/navigation";
import { VerifyPage } from "../../../components/VerifyPage";
export const dynamic = "force-dynamic";
export default async function VerifyID({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  return <VerifyPage receiptId={id}/>;
}
