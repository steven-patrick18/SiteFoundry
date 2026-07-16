import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { InstallerService, InstallStep } from '../installer/installer.service';

export interface InstallJobData {
  tenantId: string;
  userId: string | null;
  siteId: string;
  fromStep: InstallStep;
}

export const INSTALL_QUEUE = 'sf-install';

/**
 * Job dispatch. JOBS_MODE=bullmq enqueues to Redis for the worker process
 * (spec architecture); JOBS_MODE=inline (dev default — no Redis needed)
 * runs the installer in-process, same code path.
 */
@Injectable()
export class JobRunner implements OnModuleDestroy {
  private readonly logger = new Logger(JobRunner.name);
  private readonly mode: 'inline' | 'bullmq';
  private queue?: Queue<InstallJobData>;

  constructor(
    private readonly installer: InstallerService,
    private readonly config: ConfigService,
  ) {
    this.mode = (config.get<string>('JOBS_MODE') as 'inline' | 'bullmq') ?? 'inline';
    if (this.mode === 'bullmq') {
      this.queue = new Queue<InstallJobData>(INSTALL_QUEUE, {
        connection: { url: config.get<string>('REDIS_URL') } as any,
      });
    }
  }

  async enqueueInstall(data: InstallJobData): Promise<void> {
    if (this.mode === 'bullmq' && this.queue) {
      await this.queue.add('install', data, {
        removeOnComplete: 100,
        removeOnFail: 100,
      });
      return;
    }
    // inline: fire and forget — progress flows via ProgressBus/deploy_events
    void this.installer
      .run(data.tenantId, data.userId, data.siteId, data.fromStep)
      .catch((err) => this.logger.error(`install ${data.siteId} crashed: ${err?.message ?? err}`));
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}
