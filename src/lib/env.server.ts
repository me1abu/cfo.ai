import { z } from "zod";

// Validated once at server startup. Fails fast with a readable message instead of
// an undefined-credential error deep inside a request.
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATABASE_URL: z.string().startsWith("postgres"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Per organisation per Saudi calendar day; caps what one account can spend on AI.
  AI_DAILY_DOCUMENT_LIMIT: z.coerce.number().int().positive().default(50),
  AI_DAILY_ASSISTANT_LIMIT: z.coerce.number().int().positive().default(100),
  // Protects the sending domain's reputation if an account is misused.
  DAILY_EMAIL_LIMIT: z.coerce.number().int().positive().default(50),
  // Which ZATCA gateway to use. Must match where customers generate their OTP.
  ZATCA_ENVIRONMENT: z.enum(["developer-portal", "simulation", "core"]).default("developer-portal"),
  // 32 random bytes, Base64. Encrypts customers' signing keys; changing it strands them.
  ZATCA_KEY_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
  throw new Error(`Invalid server environment:\n  ${missing}\nSee .env.example.`);
}

export const serverEnv = parsed.data;
