import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import AdmZip from 'adm-zip';
import { StorageService } from '../storage/storage.service';

export interface BuildInput {
  buildId: string;
  siteId: string;
  domain: string;
  category: string;
  destinationUrl: string;
  params: any;
  tracking: {
    ga4_id?: string | null;
    meta_pixel_id?: string | null;
    google_ads_conversion_id?: string | null;
    bing_uet_tag?: string | null;
    pushvault_property_key?: string | null;
  };
  /** storage key of an uploaded template package zip, or null for stock */
  templatePackageKey: string | null;
}

export interface BuildOutput {
  distDir: string;
  artifactKey: string;
  durationMs: number;
  log: string;
}

export interface HtmlVerification {
  ok: boolean;
  missing: string[];
}

/**
 * §9 step 4: stage params -> astro build -> lighthouse (optional) -> zip
 * artifact to storage. Builds run on the panel host; only the built static
 * files ever reach the target server.
 */
@Injectable()
export class BuildService {
  private readonly logger = new Logger(BuildService.name);
  private readonly workRoot: string;
  private readonly templatesDir: string;

  constructor(
    config: ConfigService,
    private readonly storage: StorageService,
  ) {
    const repoRoot = resolve(process.cwd(), '..', '..');
    this.workRoot = config.get<string>('BUILD_WORK_DIR', join(repoRoot, '.local', 'builds'));
    this.templatesDir = config.get<string>('TEMPLATES_DIR', join(repoRoot, 'templates'));
  }

  buildDir(buildId: string): string {
    return join(this.workRoot, buildId);
  }

  async run(input: BuildInput): Promise<BuildOutput> {
    const started = Date.now();
    const workDir = this.buildDir(input.buildId);
    const distDir = join(workDir, 'dist');
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });

    // 1. resolve template source
    let templateDir: string;
    if (input.templatePackageKey) {
      templateDir = join(workDir, 'template');
      const zip = new AdmZip(await this.storage.get(input.templatePackageKey));
      zip.extractAllTo(templateDir, true);
      await this.exec('pnpm', ['install', '--prod=false'], templateDir);
    } else {
      templateDir = join(this.templatesDir, 'stock'); // deps live in the workspace
    }

    // 2. stage params + site config
    const paramsPath = join(workDir, 'params.json');
    const sitePath = join(workDir, 'site.json');
    await writeFile(paramsPath, JSON.stringify(input.params, null, 2));
    await writeFile(
      sitePath,
      JSON.stringify(
        {
          domain: input.domain,
          category: input.category,
          destination_url: input.destinationUrl,
          site_key: input.siteId,
          tracking: input.tracking,
        },
        null,
        2,
      ),
    );

    // 3. astro build
    const log = await this.exec('pnpm', ['exec', 'astro', 'build'], templateDir, {
      SF_PARAMS_PATH: paramsPath,
      SF_SITE_PATH: sitePath,
      SF_OUTDIR: distDir,
      SF_SITE_URL: `https://${input.domain}`,
    });
    if (!existsSync(join(distDir, 'index.html'))) {
      throw new Error(`Build produced no index.html.\n${log.slice(-1000)}`);
    }

    // 4. PushVault service worker at site root (§9 step 4)
    if (input.tracking.pushvault_property_key) {
      await writeFile(
        join(distDir, 'pv-sw.js'),
        '/* PushVault service worker placeholder - replaced by the real pv-sw.js (M5). */\n' +
          "self.addEventListener('push', function () { /* PushVault M5 */ });\n",
      );
    }

    // 5. immutable artifact
    const zip = new AdmZip();
    zip.addLocalFolder(distDir);
    const artifactKey = `builds/${input.siteId}/${input.buildId}.zip`;
    await this.storage.put(artifactKey, zip.toBuffer());

    return { distDir, artifactKey, durationMs: Date.now() - started, log };
  }

  /** Restore a build's dist dir from its artifact (for retry/rollback). */
  async restoreDist(buildId: string, artifactKey: string): Promise<string> {
    const distDir = join(this.buildDir(buildId), 'dist');
    if (existsSync(join(distDir, 'index.html'))) return distDir;
    const zip = new AdmZip(await this.storage.get(artifactKey));
    await mkdir(distDir, { recursive: true });
    zip.extractAllTo(distDir, true);
    return distDir;
  }

  /**
   * §8/§9 step 7: confirm tracking tags, ad claims, and the beacon are in
   * the built HTML, and legal pages exist.
   */
  async verifyDist(
    distDir: string,
    expect: {
      claims: string[];
      ga4Id?: string | null;
      metaPixelId?: string | null;
      googleAdsConversionId?: string | null;
      bingUetTag?: string | null;
      pushvaultKey?: string | null;
      requireDisclosurePage?: boolean;
    },
  ): Promise<HtmlVerification> {
    const missing: string[] = [];
    const html = await readFile(join(distDir, 'index.html'), 'utf8');

    for (const claim of expect.claims) {
      if (!html.includes(claim)) missing.push(`ad claim not on page: "${claim}"`);
    }
    const tagChecks: Array<[string | null | undefined, string]> = [
      [expect.ga4Id, 'GA4 tag'],
      [expect.metaPixelId, 'Meta Pixel'],
      [expect.googleAdsConversionId, 'Google Ads tag'],
      [expect.bingUetTag, 'Bing UET tag'],
      [expect.pushvaultKey, 'PushVault key'],
    ];
    for (const [id, label] of tagChecks) {
      if (id && !html.includes(id)) missing.push(`${label} (${id}) not injected`);
    }
    if (!html.includes('/sf.js')) missing.push('sf.js beacon missing');

    const pages = ['privacy', 'terms', 'contact'];
    if (expect.requireDisclosurePage) pages.push('disclosure');
    for (const page of pages) {
      if (!existsSync(join(distDir, page, 'index.html'))) {
        missing.push(`legal page /${page}/ missing from build`);
      }
    }
    if (expect.pushvaultKey && !existsSync(join(distDir, 'pv-sw.js'))) {
      missing.push('pv-sw.js missing from build');
    }
    return { ok: missing.length === 0, missing };
  }

  private exec(
    cmd: string,
    args: string[],
    cwd: string,
    env: Record<string, string> = {},
  ): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...env },
        shell: process.platform === 'win32', // pnpm is a .cmd shim on Windows
        windowsHide: true,
      });
      let output = '';
      child.stdout.on('data', (d) => (output += d.toString()));
      child.stderr.on('data', (d) => (output += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolvePromise(output);
        else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${output.slice(-2000)}`));
      });
    });
  }
}
