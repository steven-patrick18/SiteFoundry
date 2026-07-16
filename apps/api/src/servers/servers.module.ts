import { Module } from '@nestjs/common';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { SshService } from './ssh.service';

@Module({
  controllers: [ServersController],
  providers: [ServersService, SshService],
  exports: [ServersService],
})
export class ServersModule {}
