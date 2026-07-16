import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DecryptCommand,
  EncryptCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

/** Wraps/unwraps data-encryption keys with a master key held elsewhere. */
export interface KmsProvider {
  wrapKey(dek: Buffer): Promise<Buffer>;
  unwrapKey(wrapped: Buffer): Promise<Buffer>;
}

/** AWS KMS (or LocalStack via KMS_ENDPOINT). The DEK never touches the DB. */
export class AwsKmsProvider implements KmsProvider {
  private readonly client: KMSClient;

  constructor(
    endpoint: string,
    region: string,
    private readonly masterKeyId: string,
  ) {
    this.client = new KMSClient({
      region,
      ...(endpoint
        ? {
            endpoint,
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
          }
        : {}),
    });
  }

  async wrapKey(dek: Buffer): Promise<Buffer> {
    const out = await this.client.send(
      new EncryptCommand({ KeyId: this.masterKeyId, Plaintext: dek }),
    );
    return Buffer.from(out.CiphertextBlob!);
  }

  async unwrapKey(wrapped: Buffer): Promise<Buffer> {
    const out = await this.client.send(
      new DecryptCommand({ CiphertextBlob: wrapped }),
    );
    return Buffer.from(out.Plaintext!);
  }
}

/**
 * Dev-only stand-in for KMS: wraps the DEK with AES-256-GCM under a master
 * key from LOCAL_KMS_MASTER_KEY. Same envelope shape as AWS KMS, zero infra.
 * NEVER use in production — the master key lives in the same process.
 */
export class LocalDevKmsProvider implements KmsProvider {
  constructor(private readonly masterKey: Buffer) {}

  async wrapKey(dek: Buffer): Promise<Buffer> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]);
  }

  async unwrapKey(wrapped: Buffer): Promise<Buffer> {
    const iv = wrapped.subarray(0, 12);
    const tag = wrapped.subarray(12, 28);
    const enc = wrapped.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
  }
}

export const KMS_PROVIDER = Symbol('KMS_PROVIDER');

@Injectable()
export class KmsProviderFactory {
  static create(config: ConfigService): KmsProvider {
    const mode = config.get<string>('KMS_PROVIDER');
    if (mode === 'aws') {
      return new AwsKmsProvider(
        config.get<string>('KMS_ENDPOINT', ''),
        config.get<string>('KMS_REGION', 'us-east-1'),
        config.get<string>('KMS_MASTER_KEY_ID', ''),
      );
    }
    new Logger('Vault').warn(
      'KMS_PROVIDER=local-dev — dev-only key wrapping, do not use in production',
    );
    return new LocalDevKmsProvider(
      Buffer.from(config.get<string>('LOCAL_KMS_MASTER_KEY', ''), 'hex'),
    );
  }
}
