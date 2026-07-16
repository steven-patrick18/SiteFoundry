import { z } from 'zod';

// §15 required .env keys. Defaults match docker-compose.yml so a fresh
// checkout runs without a .env; M1 tightens secrets to hard-required.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z
    .string()
    .default('postgresql://sitefoundry:sitefoundry@localhost:5432/sitefoundry'),
  // Restricted runtime role (no RLS bypass). DATABASE_URL stays owner-only
  // for migrations/seed and the pre-auth login lookup.
  APP_DATABASE_URL: z
    .string()
    .default(
      'postgresql://sitefoundry_app:sitefoundry_app@localhost:5432/sitefoundry',
    ),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_BUCKET: z.string().default('sitefoundry'),
  S3_KEY: z.string().default('minioadmin'),
  S3_SECRET: z.string().default('minioadmin'),
  // 'aws' talks to AWS KMS / LocalStack; 'local-dev' derives the master key
  // from LOCAL_KMS_MASTER_KEY (hex) — dev only, never production.
  KMS_PROVIDER: z.enum(['aws', 'local-dev']).default('local-dev'),
  LOCAL_KMS_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'must be 32 bytes hex')
    .default('5f8e2a1d4c7b9e0f3a6d8c1b5e9f2a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f'),
  KMS_ENDPOINT: z.string().default('http://localhost:4566'),
  KMS_MASTER_KEY_ID: z.string().default(''),
  KMS_REGION: z.string().default('us-east-1'),
  // SerpApi key for the product discovery finder (optional — feature is
  // disabled without it). Server-side only; never reaches the browser.
  SERPAPI_KEY: z.string().default(''),
  // Salt for lead IP hashing (§13: raw IPs are never stored)
  LEAD_IP_SALT: z.string().default('dev-lead-salt'),
  // Panel self-update from git (admin-only). Off by default; the production
  // deploy sets it to true. PANEL_PUBLIC_URL is the panel's own https URL.
  ALLOW_SELF_UPDATE: z.string().default('false'),
  PANEL_PUBLIC_URL: z.string().default('http://localhost:3000'),
  JWT_SECRET: z.string().default('dev-only-jwt-secret'),
  INTERNAL_SECRET: z.string().default('dev-only-internal-secret'),
  APP_BASE_URL: z.string().default('http://localhost:5173'),
  CDN_BASE_URL: z.string().default('http://localhost:9000/sitefoundry'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
