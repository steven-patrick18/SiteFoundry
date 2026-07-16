import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KMS_PROVIDER, KmsProviderFactory } from './kms.provider';
import { VaultService } from './vault.service';

@Global()
@Module({
  providers: [
    {
      provide: KMS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => KmsProviderFactory.create(config),
    },
    VaultService,
  ],
  exports: [VaultService],
})
export class VaultModule {}
