import { AwardsClient } from "@/components/awards/AwardsClient";
import { listAwards } from "@/lib/data/repos";

export default async function AwardsPage({
  searchParams,
}: {
  searchParams?: { open?: string };
}) {
  return (
    <AwardsClient
      initialOpenId={searchParams?.open ?? null}
      initial={await listAwards()}
    />
  );
}
