import { Module } from '@nestjs/common';
import { SshService } from '../servers/ssh.service';
import { StorageService } from '../storage/storage.service';
import { BuildService } from '../builds/build.service';
import { ProgressBus } from '../jobs/progress-bus';
import { JobRunner } from '../jobs/job-runner';
import { InstallerService } from './installer.service';
import { InstallController } from './install.controller';

@Module({
  controllers: [InstallController],
  providers: [
    InstallerService,
    BuildService,
    StorageService,
    SshService,
    ProgressBus,
    JobRunner,
  ],
  exports: [InstallerService, JobRunner, ProgressBus, BuildService],
})
export class InstallerModule {}
