import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SetupTotp } from "@/components/auth/setup-totp";
import { StageGuard } from "@/components/auth/stage-guard";

export default function SetupTotpPage() {
  return (
    <AuthCard title="ตั้งค่ายืนยันตัวตน 2 ขั้นตอน" description="ทุกบัญชีต้องใช้แอป Authenticator ในการเข้าสู่ระบบ">
      <Suspense>
        <StageGuard stage="setup_2fa">{(username) => <SetupTotp username={username} />}</StageGuard>
      </Suspense>
    </AuthCard>
  );
}
