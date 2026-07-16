import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';

/**
 * File storage for template packages and (from M3) build artifacts.
 * Local-disk implementation for dev; an S3 driver replaces this in
 * production behind the same interface (paths stay relative keys).
 */
@Injectable()
export class StorageService {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    this.baseDir = config.get<string>('STORAGE_DIR', join(process.cwd(), '..', '..', '.local', 'storage'));
  }

  /** Resolve a storage key to an absolute path, refusing path traversal. */
  private resolve(key: string): string {
    const full = normalize(join(this.baseDir, key));
    if (!full.startsWith(normalize(this.baseDir) + sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<string> {
    const full = this.resolve(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    return key;
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }
}
