import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { AppModule } from './app.module';
import { InstallerService } from './installer/installer.service';
import { INSTALL_QUEUE, InstallJobData } from './jobs/job-runner';

/**
 * Deploy/build worker (§9). In JOBS_MODE=bullmq it consumes the Redis
 * queue; in inline mode (dev default) jobs run inside the API process and
 * this entrypoint just idles as a placeholder.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  const config = app.get(ConfigService);
  const installer = app.get(InstallerService);
  const mode = config.get<string>('JOBS_MODE') ?? 'inline';

  if (mode !== 'bullmq') {
    Logger.log(
      'JOBS_MODE=inline — installs run inside the API process; worker idle',
      'Worker',
    );
    return;
  }

  const worker = new Worker<InstallJobData>(
    INSTALL_QUEUE,
    async (job) => {
      Logger.log(`install job ${job.id} site=${job.data.siteId} from=${job.data.fromStep}`, 'Worker');
      await installer.run(job.data.tenantId, job.data.userId, job.data.siteId, job.data.fromStep);
    },
    {
      connection: { url: config.get<string>('REDIS_URL') } as any,
      concurrency: 3,
    },
  );
  worker.on('failed', (job, err) =>
    Logger.error(`install job ${job?.id} failed: ${err.message}`, 'Worker'),
  );
  Logger.log('Worker ready — consuming sf-install queue (bullmq mode)', 'Worker');
}

bootstrap();
