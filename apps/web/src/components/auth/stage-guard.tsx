import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { STAGE_PATHS } from "@/lib/auth";
import { apiGet } from "@/lib/api.server";
import type { LoginStage } from "@/lib/types";

/** Renders a login step only when the pending login is actually at that step. */
export async function StageGuard({ stage, children }: { stage: LoginStage; children: (username: string) => ReactNode }) {
  const pending = await apiGet<{ next: LoginStage; username: string }>("/auth/pending");
  if (pending.next !== stage) redirect(STAGE_PATHS[pending.next]);
  return <>{children(pending.username)}</>;
}
