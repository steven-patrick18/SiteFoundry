import { Inject, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { utils as ssh2Utils } from 'ssh2';
import { KMS_PROVIDER, KmsProvider } from './kms.provider';

export interface EncryptedSecret {
  ciphertext: Buffer;
  dekWrapped: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * Envelope encryption (§4):
 *   1. random 256-bit DEK
 *   2. AES-256-GCM(DEK, plaintext) -> {ciphertext, iv, auth_tag}
 *   3. KMS wrap of the DEK -> dek_wrapped
 *   4. store envelope fields; DEK and plaintext discarded
 * Decrypt only in-memory, immediately before an SSH session.
 */
@Injectable()
export class VaultService {
  constructor(
    @Inject(KMS_PROVIDER) private readonly kms: KmsProvider,
  ) {}

  async encrypt(plaintext: Buffer): Promise<EncryptedSecret> {
    const dek = randomBytes(32);
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', dek, iv);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();
      const dekWrapped = await this.kms.wrapKey(dek);
      return { ciphertext, dekWrapped, iv, authTag };
    } finally {
      dek.fill(0);
    }
  }

  async decrypt(secret: EncryptedSecret): Promise<Buffer> {
    const dek = await this.kms.unwrapKey(secret.dekWrapped);
    try {
      const decipher = createDecipheriv('aes-256-gcm', dek, secret.iv);
      decipher.setAuthTag(secret.authTag);
      return Buffer.concat([
        decipher.update(secret.ciphertext),
        decipher.final(),
      ]);
    } finally {
      dek.fill(0);
    }
  }

  /**
   * SHA256 fingerprint of the public key derived from an SSH private key —
   * the only credential-derived value that is safe to show or store openly.
   * Returns null if the key cannot be parsed.
   */
  sshFingerprint(privateKeyPem: string, passphrase?: string): string | null {
    const parsed = ssh2Utils.parseKey(privateKeyPem, passphrase);
    if (parsed instanceof Error) return null;
    const pub = parsed.getPublicSSH();
    const digest = createHash('sha256').update(pub).digest('base64');
    return `SHA256:${digest.replace(/=+$/, '')}`;
  }
}
