import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface VersionInfo {
  commit: string;
  short: string;
  subject: string;
  date: string;
  branch: string;
  behind: number; // commits behind origin
  remote_short: string | null;
  update_available: boolean;
  self_update_enabled: boolean;
  is_git: boolean;
}

export interface UpdateResult {
  ok: boolean;
  from: string;
  to: string;
  log: string;
  restarting: boolean;
}

/**
 * §12 Software update — pulls the panel's own code from git, installs,
 * migrates, rebuilds, and (on a real deploy) restarts the service. Admin
 * only; runs a fixed script, never operator-supplied commands. Disabled
 * unless ALLOW_SELF_UPDATE=true so it can't run in unexpected environments.
 */
@Injectable()
export class UpdateService {
  private readonly logger = new Logger(UpdateService.name);
  private readonly repoRoot: string;
  private updating = false;

  constructor(private readonly config: ConfigService) {
    this.repoRoot = resolve(process.cwd(), '..', '..');
  }

  get enabled(): boolean {
    return this.config.get<string>('ALLOW_SELF_UPDATE') === 'true';
  }

  private get isGit(): boolean {
    return existsSync(join(this.repoRoot, '.git'));
  }

  async version(): Promise<VersionInfo> {
    const base: VersionInfo = {
      commit: '', short: '', subject: '', date: '', branch: '',
      behind: 0, remote_short: null, update_available: false,
      self_update_enabled: this.enabled, is_git: this.isGit,
    };
    if (!this.isGit) return base;

    const [commit, short, subject, date, branch] = await Promise.all([
      this.git(['rev-parse', 'HEAD']),
      this.git(['rev-parse', '--short', 'HEAD']),
      this.git(['log', '-1', '--pretty=%s']),
      this.git(['log', '-1', '--pretty=%cI']),
      this.git(['rev-parse', '--abbrev-ref', 'HEAD']),
    ]);

    let behind = 0;
    let remoteShort: string | null = null;
    try {
      await this.git(['fetch', '--quiet', 'origin', branch], 30_000);
      const counts = await this.git(['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`]);
      behind = parseInt(counts.split(/\s+/)[1] ?? '0', 10) || 0;
      remoteShort = (await this.git(['rev-parse', '--short', `origin/${branch}`])).trim();
    } catch (err: any) {
      this.logger.warn(`update check failed: ${err?.message ?? err}`);
    }

    return {
      ...base,
      commit: commit.trim(), short: short.trim(), subject: subject.trim(),
      date: date.trim(), branch: branch.trim(),
      behind, remote_short: remoteShort, update_available: behind > 0,
    };
  }

  async update(): Promise<UpdateResult> {
    if (!this.enabled) {
      throw new Error('Self-update is disabled (set ALLOW_SELF_UPDATE=true on the panel server)');
    }
    if (!this.isGit) {
      throw new Error('Not a git checkout — cannot self-update');
    }
    if (this.updating) {
      throw new Error('An update is already running');
    }
    this.updating = true;
    const from = (await this.git(['rev-parse', '--short', 'HEAD'])).trim();
    try {
      const scriptPath = join(this.repoRoot, 'deploy', 'update.sh');
      const usesScript = existsSync(scriptPath);
      const log = usesScript
        ? await this.run('bash', [scriptPath], 600_000)
        : await this.fallbackUpdate();
      const to = (await this.git(['rev-parse', '--short', 'HEAD'])).trim();
      return { ok: true, from, to, log, restarting: usesScript };
    } finally {
      this.updating = false;
    }
  }

  /** Dev fallback (no deploy/update.sh): pull + install + migrate + build. */
  private async fallbackUpdate(): Promise<string> {
    let out = '';
    out += await this.git(['pull', '--ff-only']);
    out += await this.run('pnpm', ['install', '--frozen-lockfile'], 300_000);
    out += await this.run('pnpm', ['prisma', 'migrate', 'deploy'], 120_000);
    out += await this.run('pnpm', ['-r', 'build'], 300_000);
    return out;
  }

  private git(args: string[], timeoutMs = 15_000): Promise<string> {
    return this.run('git', args, timeoutMs);
  }

  private run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(cmd, args, {
        cwd: this.repoRoot,
        shell: process.platform === 'win32',
        windowsHide: true,
      });
      let out = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`${cmd} ${args[0]} timed out`));
      }, timeoutMs);
      child.stdout.on('data', (d) => (out += d.toString()));
      child.stderr.on('data', (d) => (out += d.toString()));
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolvePromise(out);
        else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${out.slice(-1500)}`));
      });
    });
  }
}
