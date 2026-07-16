import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as PgClient } from 'pg';
import Redis from 'ioredis';

export type DependencyStatus = 'ok' | 'unavailable';

@Injectable()
export class HealthService {
  constructor(private readonly config: ConfigService) {}

  async checkDatabase(): Promise<DependencyStatus> {
    const client = new PgClient({
      connectionString: this.config.get<string>('DATABASE_URL'),
      connectionTimeoutMillis: 1500,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      return 'ok';
    } catch {
      return 'unavailable';
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async checkRedis(): Promise<DependencyStatus> {
    const redis = new Redis(this.config.get<string>('REDIS_URL')!, {
      lazyConnect: true,
      connectTimeout: 1500,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined); // reported via return value, not logs
    try {
      await redis.connect();
      await redis.ping();
      return 'ok';
    } catch {
      return 'unavailable';
    } finally {
      redis.disconnect();
    }
  }
}
