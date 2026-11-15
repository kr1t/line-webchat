import { z } from 'zod';

// Treat `KEY=` (empty) in .env files the same as an unset optional variable
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  // 32 random bytes, base64 encoded: `openssl rand -base64 32`
  TOTP_ENC_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes in base64'),
  // Optional customer features: rich menu linked to customers, and the LIFF app (LINE Login channel)
  CUSTOMER_RICH_MENU_ID: optional(z.string().regex(/^richmenu-[0-9a-f]{32}$/)),
  LIFF_ID: optional(z.string().regex(/^\d+-\w+$/)),
  LINE_LOGIN_CHANNEL_ID: optional(z.string().regex(/^\d+$/)),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    // Only list the variable names, never their values
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment variables: ${fields}`);
  }
  return result.data;
}
