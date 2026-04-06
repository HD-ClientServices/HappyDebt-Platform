import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CloserDetail } from "../CloserDetail";

export default async function CloserDetailPage({
  params,
}: {
  params: Promise<{ closerId: string }>;
}) {
  const { closerId } = await params;
  const supabase = await createClient();
  const { data: closer } = await supabase
    .from("closers")
    .select("*")
    .eq("id", closerId)
    .single();
  if (!closer) notFound();
  return <CloserDetail closerId={closerId} initialCloser={closer} />;
}
