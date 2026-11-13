import { inputClass } from "./auth-card";

export function CodeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      placeholder="000000"
      required
      autoFocus
      aria-label="รหัส 6 หลัก"
      className={`${inputClass} text-center font-mono text-xl tracking-[0.5em]`}
    />
  );
}
