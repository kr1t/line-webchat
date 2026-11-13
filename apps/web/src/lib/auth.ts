import type { LoginStage } from "./types";

export const STAGE_PATHS: Record<LoginStage, string> = {
  change_password: "/login/password",
  setup_2fa: "/login/2fa/setup",
  verify_2fa: "/login/2fa",
};

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
  too_many_attempts: "ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่",
  invalid_code: "รหัสไม่ถูกต้องหรือหมดเวลาแล้ว",
  login_expired: "หมดเวลาเข้าสู่ระบบ กรุณาเริ่มใหม่",
  password_contains_username: "รหัสผ่านต้องไม่มีชื่อผู้ใช้อยู่ในนั้น",
  password_reused: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม",
  "2fa_already_enabled": "บัญชีนี้ตั้งค่า 2FA แล้ว",
  username_taken: "ชื่อผู้ใช้นี้มีอยู่แล้ว",
  cannot_manage_self: "จัดการบัญชีของตัวเองจากหน้านี้ไม่ได้",
  cannot_manage_super_admin: "จัดการบัญชี super admin จากหน้านี้ไม่ได้",
};

export const authErrorText = (code?: string) => (code && AUTH_ERRORS[code]) || "เกิดข้อผิดพลาด กรุณาลองใหม่";
