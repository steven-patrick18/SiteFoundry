import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Client, ConnectConfig } from 'ssh2';

export interface SshAuth {
  username: string;
  privateKey?: Buffer;
  password?: string;
}

export interface SshTarget {
  host: string;
  port: number;
  /** Pinned host key hash (SHA256:... base64). Undefined = first connect. */
  pinnedHostKey?: string | null;
}

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface SshSession {
  exec(command: string, timeoutMs?: number): Promise<ExecResult>;
  /** SFTP: upload a local file to an absolute remote path. */
  uploadFile(localPath: string, remotePath: string): Promise<void>;
  /** SHA256 hash of the server host key observed during handshake. */
  hostKey: string;
  close(): void;
}

export class HostKeyMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `SSH host key mismatch — expected ${expected}, got ${actual}. ` +
        'Possible MITM or server reinstall; rotate the pinned key if this is expected.',
    );
  }
}

@Injectable()
export class SshService {
  private readonly logger = new Logger(SshService.name);

  /** Open a connection with host-key pinning (trust on first use, §13). */
  connect(
    target: SshTarget,
    auth: SshAuth,
    timeoutMs = 15_000,
  ): Promise<SshSession> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let observedHostKey = '';
      let settled = false;

      const config: ConnectConfig = {
        host: target.host,
        port: target.port,
        username: auth.username,
        readyTimeout: timeoutMs,
        ...(auth.privateKey ? { privateKey: auth.privateKey } : {}),
        ...(auth.password ? { password: auth.password } : {}),
        hostVerifier: (key: Buffer) => {
          const digest = createHash('sha256').update(key).digest('base64');
          observedHostKey = `SHA256:${digest.replace(/=+$/, '')}`;
          if (target.pinnedHostKey && target.pinnedHostKey !== observedHostKey) {
            return false;
          }
          return true;
        },
      };

      conn.on('ready', () => {
        settled = true;
        resolve({
          hostKey: observedHostKey,
          close: () => conn.end(),
          exec: (command, execTimeoutMs = 120_000) =>
            this.execOn(conn, command, execTimeoutMs),
          uploadFile: (localPath, remotePath) =>
            new Promise<void>((res, rej) => {
              conn.sftp((err, sftp) => {
                if (err) return rej(err);
                sftp.fastPut(localPath, remotePath, (putErr) =>
                  putErr ? rej(putErr) : res(),
                );
              });
            }),
        });
      });

      conn.on('error', (err) => {
        if (settled) return;
        settled = true;
        if (
          target.pinnedHostKey &&
          observedHostKey &&
          target.pinnedHostKey !== observedHostKey
        ) {
          reject(new HostKeyMismatchError(target.pinnedHostKey, observedHostKey));
        } else {
          reject(err);
        }
      });

      conn.connect(config);
    });
  }

  private execOn(
    conn: Client,
    command: string,
    timeoutMs: number,
  ): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }
        let stdout = '';
        let stderr = '';
        stream.on('data', (d: Buffer) => (stdout += d.toString()));
        stream.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
        stream.on('close', (code: number | null) => {
          clearTimeout(timer);
          resolve({ code, stdout, stderr });
        });
      });
    });
  }
}
