import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { LocalDevKmsProvider } from './kms.provider';
import { VaultService } from './vault.service';
import { sanitizeForLog, outputTail } from './sanitize';

const vault = new VaultService(new LocalDevKmsProvider(randomBytes(32)));

describe('VaultService envelope encryption', () => {
  it('round-trips a secret', async () => {
    const secret = Buffer.from('super-secret-ssh-password');
    const enc = await vault.encrypt(secret);
    expect(enc.ciphertext.equals(secret)).toBe(false);
    const dec = await vault.decrypt(enc);
    expect(dec.toString()).toBe('super-secret-ssh-password');
  });

  it('produces a fresh DEK per secret (same plaintext, different ciphertext)', async () => {
    const a = await vault.encrypt(Buffer.from('same'));
    const b = await vault.encrypt(Buffer.from('same'));
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.dekWrapped.equals(b.dekWrapped)).toBe(false);
  });

  it('rejects tampered ciphertext (GCM auth)', async () => {
    const enc = await vault.encrypt(Buffer.from('payload'));
    enc.ciphertext[0] ^= 0xff;
    await expect(vault.decrypt(enc)).rejects.toThrow();
  });

  it('rejects a wrapped DEK from a different master key', async () => {
    const other = new VaultService(new LocalDevKmsProvider(randomBytes(32)));
    const enc = await vault.encrypt(Buffer.from('payload'));
    await expect(other.decrypt(enc)).rejects.toThrow();
  });

  it('computes SSH fingerprint from an RSA private key', () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    const fp = vault.sshFingerprint(privateKey as unknown as string);
    expect(fp).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
  });

  it('returns null fingerprint for junk input', () => {
    expect(vault.sshFingerprint('not a key')).toBeNull();
  });
});

describe('log sanitizer', () => {
  it('redacts PEM blocks', () => {
    const input =
      'deploying with -----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY----- done';
    expect(sanitizeForLog(input)).toBe('deploying with [REDACTED_PEM] done');
  });

  it('redacts password/token assignments', () => {
    expect(sanitizeForLog('sshpass password=hunter2 ok')).toContain(
      'password=[REDACTED]',
    );
    expect(sanitizeForLog('curl -H "Authorization: Bearer abc.def.ghi"')).not.toContain(
      'abc.def.ghi',
    );
  });

  it('redacts long base64 blobs', () => {
    const blob = 'A'.repeat(64);
    expect(sanitizeForLog(`key ${blob} end`)).toBe('key [REDACTED_BLOB] end');
  });

  it('outputTail keeps last 500 chars', () => {
    const long = 'word '.repeat(200); // 1000 chars, nothing secret-shaped
    expect(outputTail(long)).toHaveLength(500);
  });
});
