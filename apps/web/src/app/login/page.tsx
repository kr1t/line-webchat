import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthCard title="เข้าสู่ระบบ" description="สำหรับแอดมินของ LINE Official Account">
      <LoginForm />
    </AuthCard>
  );
}
