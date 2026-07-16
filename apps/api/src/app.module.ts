import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { VaultModule } from './vault/vault.module';
import { AuthModule } from './auth/auth.module';
import { ServersModule } from './servers/servers.module';
import { ClientsModule } from './clients/clients.module';
import { TemplatesModule } from './templates/templates.module';
import { SitesModule } from './sites/sites.module';
import { InstallerModule } from './installer/installer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    VaultModule,
    AuthModule,
    HealthModule,
    ServersModule,
    ClientsModule,
    TemplatesModule,
    SitesModule,
    InstallerModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
