import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

export type TenantTx = Prisma.TransactionClient;

/**
 * Two database identities:
 *
 * - `admin` (DATABASE_URL): owner/superuser. Used ONLY for the pre-auth login
 *   lookup and internal jobs. Never handed to request handlers.
 * - `app` (APP_DATABASE_URL): restricted `sitefoundry_app` role, subject to
 *   RLS. All tenant work goes through `withTenant`, which pins
 *   `app.tenant_id` for the duration of one transaction.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly admin: PrismaClient;
  private readonly app: PrismaClient;

  constructor(config: ConfigService) {
    this.admin = new PrismaClient({
      datasources: { db: { url: config.get<string>('DATABASE_URL') } },
    });
    this.app = new PrismaClient({
      datasources: { db: { url: config.get<string>('APP_DATABASE_URL') } },
    });
  }

  async onModuleInit() {
    // Lazy-connect: the API must boot (and /health respond) without a DB.
    await Promise.allSettled([this.admin.$connect(), this.app.$connect()]);
  }

  async onModuleDestroy() {
    await Promise.allSettled([
      this.admin.$disconnect(),
      this.app.$disconnect(),
    ]);
  }

  /** Run `fn` inside a transaction scoped to one tenant via RLS. */
  async withTenant<T>(
    tenantId: string,
    fn: (tx: TenantTx) => Promise<T>,
  ): Promise<T> {
    return this.app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }
}
