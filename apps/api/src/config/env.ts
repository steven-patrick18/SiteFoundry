import { z } from 'zod';

// §15 required .env keys. Defaults match docker-compose.yml so a fresh
// checkout runs without a .env; M1 tightens secrets to hard-required.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z
    .string()
    .default('postgresql://sitefoundry:sitefoundry@localhost:5432/sitefoundry'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_BUCKET: z.string().default('sitefoundry'),
  S3_KEY: z.string().default('minioadmin'),
  S3_SECRET: z.string().default('minioadmin'),
  KMS_ENDPOINT: z.string().default('http://localhost:4566'),
  KMS_MASTER_KEY_ID: z.string().default(''),
  KMS_REGION: z.string().default('us-east-1'),
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
