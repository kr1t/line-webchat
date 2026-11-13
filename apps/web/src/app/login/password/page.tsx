import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { StageGuard } from "@/components/auth/stage-guard";

export default function ChangePasswordPage() {
  return (
    <AuthCard title="ตั้งรหัสผ่านใหม่" description="บัญชีนี้ใช้รหัสผ่านชั่วคราว กรุณาตั้งรหัสผ่านของคุณเองก่อนใช้งาน">
      <Suspense>
        <StageGuard stage="change_password">{() => <ChangePasswordForm />}</StageGuard>
      </Suspense>
    </AuthCard>
  );
}
