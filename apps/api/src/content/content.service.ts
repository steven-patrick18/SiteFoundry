import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InstallerService } from '../installer/installer.service';

// Client self-service editing is content-only. Only these param paths may be
// changed from a deployed site — never tracking, legal, destinations, outbound
// links, or anything a client could use to harm the site or its ad account.
const ALLOWED_PATHS: RegExp[] = [
  /^brand\.(business_name|primary_color|secondary_color)$/,
  /^hero\.(headline|subheadline|cta_text)$/,
  /^seo\.(page_title|meta_description)$/,
  /^trust\.(business_name|contact_email|contact_phone|address)$/,
  /^ad_claims\.\d{1,2}$/,
  /^retailers\.[a-z0-9-]{1,60}\.(phone|hours|tagline|description|hq|founded|category)$/,
];
const MAX_LEN = 4000;
const MAX_EDITS = 300;

/** Keep only whitelisted paths; trim + cap every value. Pure, unit-tested. */
export function sanitizeEdits(input: unknown): Record<string, string> {
  const edits = input && typeof input === 'object' && !Array.isArray(input) ? (input as any) : {};
  const out: Record<string, string> = {};
  let n = 0;
  for (const [path, val] of Object.entries(edits)) {
    if (n >= MAX_EDITS) break;
    if (typeof path !== 'string' || val == null) continue;
    if (!ALLOWED_PATHS.some((re) => re.test(path))) continue;
    out[path] = String(val).replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
    n++;
  }
  return out;
}

/** Set a dotted path (with numeric array indices) on a plain object, in place. */
export function setPath(root: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split('.');
  let obj: any = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    if (obj[key] == null || typeof obj[key] !== 'object') obj[key] = nextIsIndex ? [] : {};
    obj = obj[key];
  }
  obj[parts[parts.length - 1]] = value;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly installer: InstallerService,
  ) {}

  /** Operator action: mint (or rotate) the site's client-editing key. */
  async generateKey(tenantId: string, siteId: string): Promise<string> {
    const key = randomBytes(24).toString('base64url');
    const res = await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.updateMany({ where: { id: siteId }, data: { contentEditKey: key } }),
    );
    if (!res.count) throw new NotFoundException('Site not found');
    return key;
  }

  async disableKey(tenantId: string, siteId: string): Promise<void> {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.updateMany({ where: { id: siteId }, data: { contentEditKey: null } }),
    );
  }

  /** Operator: read (or lazily create) the key so the panel can open the editor. */
  async ensureKey(tenantId: string, siteId: string): Promise<string> {
    const site = await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.findFirst({ where: { id: siteId }, select: { contentEditKey: true } }),
    );
    if (!site) throw new NotFoundException('Site not found');
    if (site.contentEditKey) return site.contentEditKey;
    return this.generateKey(tenantId, siteId);
  }

  async keyStatus(tenantId: string, siteId: string): Promise<{ enabled: boolean; edit_key: string | null }> {
    const site = await this.prisma.withTenant(tenantId, (tx) =>
      tx.site.findFirst({ where: { id: siteId }, select: { contentEditKey: true } }),
    );
    if (!site) throw new NotFoundException('Site not found');
    return { enabled: !!site.contentEditKey, edit_key: site.contentEditKey };
  }

  /**
   * Public (token-authed) save from a deployed site's inline editor. Validates
   * the key, whitelists + sanitizes the edits, merges them into the site's
   * params, and republishes the site (files-only, no nginx/SSL).
   */
  async saveEdits(
    siteKey: string,
    editKey: string,
    rawEdits: unknown,
  ): Promise<{ saved: number; publishing: boolean }> {
    const site = await this.prisma.admin.site.findFirst({
      where: { id: siteKey },
      select: { id: true, tenantId: true, contentEditKey: true, params: true, installStatus: true },
    });
    if (!site || !site.contentEditKey) throw new ForbiddenException('Editing is not enabled for this site');
    if (!editKey || !safeEqual(editKey, site.contentEditKey)) {
      throw new ForbiddenException('Invalid edit key');
    }

    const edits = sanitizeEdits(rawEdits);
    const paths = Object.keys(edits);
    if (!paths.length) return { saved: 0, publishing: false };

    const params: Record<string, any> =
      site.params && typeof site.params === 'object' ? structuredClone(site.params as any) : {};
    for (const path of paths) setPath(params, path, edits[path]);
    await this.prisma.admin.site.update({ where: { id: site.id }, data: { params } });

    let publishing = false;
    if (site.installStatus === 'live') {
      publishing = true;
      this.installer
        .rebuildFiles(site.tenantId, site.id)
        .then(() => this.logger.log(`content republish ${site.id} done (${paths.length} edits)`))
        .catch((e) => this.logger.error(`content republish ${site.id} failed: ${e?.message ?? e}`));
    }
    return { saved: paths.length, publishing };
  }
}
