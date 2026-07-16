import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VaultService } from '../vault/vault.service';

/**
 * Global panel configuration stored envelope-encrypted in app_config
 * (e.g. the SerpApi key set from the Settings UI). Plaintext exists only
 * in-memory; values are never returned by the API — callers get status or
 * the decrypted value server-side only.
 */
@Injectable()
export class AppConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
  ) {}

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.admin.appConfig.findUnique({ where: { key } });
    if (!row) return null;
    const plain = await this.vault.decrypt({
      ciphertext: Buffer.from(row.ciphertext),
      dekWrapped: Buffer.from(row.dekWrapped),
      iv: Buffer.from(row.iv),
      authTag: Buffer.from(row.authTag),
    });
    try {
      return plain.toString('utf8');
    } finally {
      plain.fill(0);
    }
  }

  async set(key: string, value: string): Promise<void> {
    const enc = await this.vault.encrypt(Buffer.from(value, 'utf8'));
    await this.prisma.admin.appConfig.upsert({
      where: { key },
      create: {
        key,
        ciphertext: enc.ciphertext,
        dekWrapped: enc.dekWrapped,
        iv: enc.iv,
        authTag: enc.authTag,
      },
      update: {
        ciphertext: enc.ciphertext,
        dekWrapped: enc.dekWrapped,
        iv: enc.iv,
        authTag: enc.authTag,
      },
    });
  }

  async clear(key: string): Promise<void> {
    await this.prisma.admin.appConfig.deleteMany({ where: { key } });
  }

  async has(key: string): Promise<boolean> {
    return (await this.prisma.admin.appConfig.count({ where: { key } })) > 0;
  }
}
