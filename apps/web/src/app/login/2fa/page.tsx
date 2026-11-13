import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { StageGuard } from "@/components/auth/stage-guard";
import { VerifyForm } from "@/components/auth/verify-form";

export default function VerifyPage() {
  return (
    <AuthCard title="ยืนยันตัวตน" description="กรอกรหัส 6 หลักจากแอป Authenticator">
      <Suspense>
        <StageGuard stage="verify_2fa">{() => <VerifyForm />}</StageGuard>
      </Suspense>
    </AuthCard>
  );
}
