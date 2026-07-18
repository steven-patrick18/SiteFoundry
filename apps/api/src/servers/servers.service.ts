import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, TenantTx } from '../prisma/prisma.service';
import { VaultService } from '../vault/vault.service';
import { sanitizeForLog, outputTail } from '../vault/sanitize';
import { HostKeyMismatchError, SshService, SshSession } from './ssh.service';
import { probeFacts } from './facts';
import { buildProvisionSteps } from './provision-steps';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateServerDto, RotateCredentialDto, UpdateServerDto } from './dto';

/** Shape returned by every endpoint — no credential fields, ever. */
export interface ServerView {
  id: string;
  name: string;
  host: string;
  port: number;
  sshUsername: string;
  authType: string;
  credentialFingerprint: string | null;
  provider: string | null;
  os: string | null;
  osVersion: string | null;
  webServer: string;
  baseProvisioned: boolean;
  status: string;
  lastCheckedAt: Date | null;
  facts: unknown;
  notes: string | null;
  createdAt: Date;
}

export interface ProvisionEvent {
  step: string;
  title: string;
  status: 'start' | 'ok' | 'fail' | 'done';
  detail?: string;
}

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly ssh: SshService,
    private readonly config: ConfigService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────

  async create(user: AuthUser, dto: CreateServerDto): Promise<ServerView> {
    if (dto.auth_type === 'ssh_key' && !dto.private_key) {
      throw new BadRequestException('private_key required for auth_type ssh_key');
    }
    if (dto.auth_type === 'password' && !dto.password) {
      throw new BadRequestException('password required for auth_type password');
    }

    const secret =
      dto.auth_type === 'ssh_key' ? dto.private_key! : dto.password!;
    const fingerprint =
      dto.auth_type === 'ssh_key'
        ? this.vault.sshFingerprint(secret)
        : null;
    if (dto.auth_type === 'ssh_key' && !fingerprint) {
      throw new BadRequestException(
        'private_key is not a parseable SSH private key (OpenSSH or PEM format)',
      );
    }
    const encrypted = await this.vault.encrypt(Buffer.from(secret, 'utf8'));

    const server = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const credential = await tx.credential.create({
        data: {
          tenantId: user.tenantId,
          kind: dto.auth_type === 'ssh_key' ? 'ssh_private_key' : 'ssh_password',
          label: `SSH for ${dto.name}`,
          ciphertext: encrypted.ciphertext,
          dekWrapped: encrypted.dekWrapped,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          fingerprint,
          createdBy: user.userId,
        },
      });
      const created = await tx.server.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name,
          host: dto.host,
          port: dto.port ?? 22,
          sshUsername: dto.ssh_username,
          authType: dto.auth_type,
          credentialId: credential.id,
          provider: dto.provider ?? null,
          notes: dto.notes ?? null,
          status: 'pending',
        },
      });
      await this.audit(tx, user, 'server.create', 'server', created.id, null, {
        name: created.name,
        host: created.host,
      });
      return created;
    });

    // Test the connection immediately (§5 step 2-5).
    return this.testConnection(user, server.id);
  }

  async list(user: AuthUser): Promise<ServerView[]> {
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.server.findMany({
        orderBy: { createdAt: 'desc' },
        include: { credential: { select: { fingerprint: true } } },
      }),
    );
    return rows.map((r) => this.toView(r));
  }

  async get(user: AuthUser, id: string): Promise<ServerView> {
    const row = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.server.findFirst({
        where: { id },
        include: { credential: { select: { fingerprint: true } } },
      }),
    );
    if (!row) throw new NotFoundException('Server not found');
    return this.toView(row);
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateServerDto,
  ): Promise<ServerView> {
    const updated = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const before = await tx.server.findFirst({ where: { id } });
      if (!before) throw new NotFoundException('Server not found');
      const after = await tx.server.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.provider !== undefined ? { provider: dto.provider } : {}),
        },
        include: { credential: { select: { fingerprint: true } } },
      });
      await this.audit(
        tx, user, 'server.update', 'server', id,
        { name: before.name, notes: before.notes, provider: before.provider },
        { name: after.name, notes: after.notes, provider: after.provider },
      );
      return after;
    });
    return this.toView(updated);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    // TODO(M3): block deletion when the server has active sites.
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const server = await tx.server.findFirst({ where: { id } });
      if (!server) throw new NotFoundException('Server not found');
      await tx.server.delete({ where: { id } });
      await tx.credential.delete({ where: { id: server.credentialId } });
      await this.audit(tx, user, 'server.delete', 'server', id, {
        name: server.name,
        host: server.host,
      }, null);
    });
  }

  // ── Connection test + facts probe ─────────────────────────────────────

  async testConnection(user: AuthUser, id: string): Promise<ServerView> {
    const server = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.server.findFirst({ where: { id }, include: { credential: true } }),
    );
    if (!server) throw new NotFoundException('Server not found');

    let status = 'connected';
    let facts: unknown = server.facts;
    let hostKey = server.hostKey;
    let error: string | undefined;

    let session: SshSession | undefined;
    try {
      session = await this.openSession(server);
      hostKey = session.hostKey;
      facts = { ...(await probeFacts(session)) };
    } catch (err: any) {
      status = err instanceof HostKeyMismatchError ? 'error' : 'unreachable';
      error = this.friendlySshError(err);
    } finally {
      session?.close();
    }

    const updated = await this.prisma.withTenant(user.tenantId, async (tx) => {
      await tx.credential.update({
        where: { id: server.credentialId },
        data: { lastUsedAt: new Date() },
      });
      return tx.server.update({
        where: { id },
        data: {
          status: server.baseProvisioned && status === 'connected' ? 'ready' : status,
          facts: facts as any,
          hostKey,
          lastCheckedAt: new Date(),
          ...(status === 'connected' && (facts as any)?.os
            ? { os: (facts as any).os, osVersion: (facts as any).os_version }
            : {}),
        },
        include: { credential: { select: { fingerprint: true } } },
      });
    });

    const view = this.toView(updated);
    if (error) (view as any).last_error = error;
    return view;
  }

  /**
   * Re-pin the host key after a legitimate change (e.g. the server rebooted and
   * now presents a different host-key type). We connect while ignoring the old
   * pin, but only accept — and store — the new key if the saved credential
   * still AUTHENTICATES. Successful auth proves it's the same server, so this
   * is a safe recovery that never blindly trusts a new key.
   */
  async repinHostKey(user: AuthUser, id: string): Promise<ServerView> {
    const server = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.server.findFirst({ where: { id }, include: { credential: true } }),
    );
    if (!server) throw new NotFoundException('Server not found');

    let session: SshSession;
    try {
      session = await this.openSession(server, { ignorePin: true });
    } catch (err: any) {
      // auth (or reachability) failed — do NOT re-pin
      throw new BadRequestException(
        `Could not re-pin: ${this.friendlySshError(err)}`,
      );
    }
    const newHostKey = session.hostKey;
    let facts: unknown = server.facts;
    try {
      facts = { ...(await probeFacts(session)) };
    } catch {
      /* facts refresh best-effort */
    } finally {
      session.close();
    }

    const updated = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const row = await tx.server.update({
        where: { id },
        data: {
          hostKey: newHostKey,
          status: server.baseProvisioned ? 'ready' : 'connected',
          facts: facts as any,
          lastCheckedAt: new Date(),
        },
        include: { credential: { select: { fingerprint: true } } },
      });
      await this.audit(tx, user, 'server.repin_host_key', 'server', id, null, {
        old_host_key: server.hostKey,
        new_host_key: newHostKey,
      });
      return row;
    });
    return this.toView(updated);
  }

  // ── Credential rotation ───────────────────────────────────────────────

  async rotateCredential(
    user: AuthUser,
    id: string,
    dto: RotateCredentialDto,
  ): Promise<{ fingerprint: string | null }> {
    const secret = dto.auth_type === 'ssh_key' ? dto.private_key : dto.password;
    if (!secret) {
      throw new BadRequestException('key or password required');
    }
    const fingerprint =
      dto.auth_type === 'ssh_key' ? this.vault.sshFingerprint(secret) : null;
    if (dto.auth_type === 'ssh_key' && !fingerprint) {
      throw new BadRequestException('private_key is not a parseable SSH key');
    }
    const encrypted = await this.vault.encrypt(Buffer.from(secret, 'utf8'));

    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const server = await tx.server.findFirst({ where: { id } });
      if (!server) throw new NotFoundException('Server not found');
      await tx.credential.update({
        where: { id: server.credentialId },
        data: {
          kind: dto.auth_type === 'ssh_key' ? 'ssh_private_key' : 'ssh_password',
          ciphertext: encrypted.ciphertext,
          dekWrapped: encrypted.dekWrapped,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          fingerprint,
          rotatedAt: new Date(),
        },
      });
      await tx.server.update({
        where: { id },
        data: { authType: dto.auth_type },
      });
      await this.audit(tx, user, 'credential.rotate', 'server', id, null, {
        fingerprint,
      });
    });
    return { fingerprint };
  }

  // ── Base provisioning (§5) — async generator consumed by SSE ──────────

  async *provisionBase(
    user: AuthUser,
    id: string,
  ): AsyncGenerator<ProvisionEvent> {
    const server = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.server.findFirst({ where: { id }, include: { credential: true } }),
    );
    if (!server) throw new NotFoundException('Server not found');

    await this.setStatus(user.tenantId, id, 'provisioning_base');

    let session: SshSession;
    try {
      session = await this.openSession(server);
    } catch (err: any) {
      await this.setStatus(user.tenantId, id, 'unreachable');
      yield {
        step: 'connect', title: 'Connecting via SSH',
        status: 'fail', detail: this.friendlySshError(err),
      };
      return;
    }

    const steps = buildProvisionSteps({
      panelBaseUrl: this.config.get<string>('APP_BASE_URL', ''),
    });

    try {
      for (const step of steps) {
        yield { step: step.key, title: step.title, status: 'start' };
        const startedAt = Date.now();
        await this.recordDeployEvent(user.tenantId, id, step.key, 'start', step.command);

        let result;
        try {
          result = await session.exec(step.command, 300_000);
        } catch (err: any) {
          await this.recordDeployEvent(
            user.tenantId, id, step.key, 'fail', step.command, String(err?.message ?? err),
          );
          await this.setStatus(user.tenantId, id, 'error');
          yield {
            step: step.key, title: step.title, status: 'fail',
            detail: sanitizeForLog(String(err?.message ?? err)),
          };
          return;
        }

        if (result.code !== 0) {
          const detail = this.provisionFailureHint(result.stderr || result.stdout);
          await this.recordDeployEvent(
            user.tenantId, id, step.key, 'fail', step.command,
            result.stderr || result.stdout,
          );
          await this.setStatus(user.tenantId, id, 'error');
          yield { step: step.key, title: step.title, status: 'fail', detail };
          return;
        }

        await this.recordDeployEvent(
          user.tenantId, id, step.key, 'ok', step.command,
          result.stdout, Date.now() - startedAt,
        );
        yield { step: step.key, title: step.title, status: 'ok' };
      }
    } finally {
      session.close();
    }

    // Re-probe facts now that nginx/certbot/node are installed.
    let facts: unknown = server.facts;
    try {
      const probeSession = await this.openSession(server);
      facts = { ...(await probeFacts(probeSession)) };
      probeSession.close();
    } catch {
      // facts refresh is best-effort
    }

    await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.server.update({
        where: { id },
        data: { baseProvisioned: true, status: 'ready', facts: facts as any },
      }),
    );
    yield {
      step: 'complete', title: 'Base provisioning complete',
      status: 'done', detail: 'Server is site-ready',
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private async openSession(
    server: {
      host: string;
      port: number;
      sshUsername: string;
      authType: string;
      hostKey: string | null;
      credential: {
        ciphertext: Buffer | Uint8Array;
        dekWrapped: Buffer | Uint8Array;
        iv: Buffer | Uint8Array;
        authTag: Buffer | Uint8Array;
      };
    },
    opts: { ignorePin?: boolean } = {},
  ): Promise<SshSession> {
    const plaintext = await this.vault.decrypt({
      ciphertext: Buffer.from(server.credential.ciphertext),
      dekWrapped: Buffer.from(server.credential.dekWrapped),
      iv: Buffer.from(server.credential.iv),
      authTag: Buffer.from(server.credential.authTag),
    });
    try {
      return await this.ssh.connect(
        { host: server.host, port: server.port, pinnedHostKey: opts.ignorePin ? null : server.hostKey },
        {
          username: server.sshUsername,
          ...(server.authType === 'ssh_key'
            ? { privateKey: plaintext }
            : { password: plaintext.toString('utf8') }),
        },
      );
    } finally {
      plaintext.fill(0);
    }
  }

  private toView(row: any): ServerView {
    return {
      id: row.id,
      name: row.name,
      host: row.host,
      port: row.port,
      sshUsername: row.sshUsername,
      authType: row.authType,
      credentialFingerprint: row.credential?.fingerprint ?? null,
      provider: row.provider,
      os: row.os,
      osVersion: row.osVersion,
      webServer: row.webServer,
      baseProvisioned: row.baseProvisioned,
      status: row.status,
      lastCheckedAt: row.lastCheckedAt,
      facts: row.facts,
      notes: row.notes,
      createdAt: row.createdAt,
    };
  }

  private friendlySshError(err: any): string {
    const msg = String(err?.message ?? err);
    if (err instanceof HostKeyMismatchError) return msg;
    if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return 'Host not found — check the hostname/IP.';
    if (/ECONNREFUSED/.test(msg)) return 'Connection refused — is sshd running on that port?';
    if (/ETIMEDOUT|Timed out/i.test(msg)) return 'Connection timed out — host unreachable or firewalled.';
    if (/authentication/i.test(msg)) return 'Authentication rejected — check username and key/password.';
    return sanitizeForLog(msg);
  }

  private provisionFailureHint(output: string): string {
    if (/sudo: a password is required|sudo: no tty/i.test(output)) {
      return (
        'The deploy user needs passwordless sudo. On the server run: ' +
        `echo "<user> ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/sitefoundry`
      );
    }
    return outputTail(output);
  }

  private async setStatus(tenantId: string, id: string, status: string) {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.server.update({ where: { id }, data: { status } }),
    );
  }

  private async recordDeployEvent(
    tenantId: string,
    serverId: string,
    step: string,
    status: 'start' | 'ok' | 'fail',
    command: string,
    output = '',
    _durationMs?: number,
  ) {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.deployEvent.create({
        data: {
          tenantId,
          serverId,
          step,
          status,
          commandSummary: sanitizeForLog(command).slice(0, 500),
          outputTail: output ? outputTail(output) : null,
        },
      }),
    );
  }

  private async audit(
    tx: TenantTx,
    user: AuthUser,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        action,
        entityType,
        entityId,
        before: before as any,
        after: after as any,
      },
    });
  }
}
