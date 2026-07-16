import { describe, it, expect } from 'vitest';
import { AutoRebuildService } from '../src/installer/auto-rebuild.service';

interface Opts {
  newest: { fetchedAt: Date } | null;
  sites: Array<{ id: string; tenantId: string; domain: string }>;
  lastBuilds: Record<string, { createdAt: Date } | undefined>;
  running?: string[];
  failOn?: string[];
  env?: Record<string, string>;
}

function makeService(opts: Opts) {
  const prisma = {
    admin: {
      searchCache: { findFirst: async () => opts.newest },
      site: { findMany: async () => opts.sites },
      build: {
        findFirst: async ({ where }: any) => opts.lastBuilds[where.siteId] ?? null,
      },
    },
  } as any;
  const rebuilt: string[] = [];
  const installer = {
    isRunning: (id: string) => (opts.running ?? []).includes(id),
    rebuildFiles: async (_t: string, id: string) => {
      if ((opts.failOn ?? []).includes(id)) throw new Error('boom');
      rebuilt.push(id);
      return 'ok';
    },
  } as any;
  const config = { get: (k: string, d: any) => opts.env?.[k] ?? d } as any;
  return { svc: new AutoRebuildService(prisma, installer, config), rebuilt };
}

const T0 = new Date('2026-07-17T00:00:00Z');
const T1 = new Date('2026-07-17T02:00:00Z');

describe('AutoRebuildService.sweep', () => {
  it('does nothing when there is no catalog yet', async () => {
    const { svc, rebuilt } = makeService({ newest: null, sites: [], lastBuilds: {} });
    expect(await svc.sweep()).toEqual({ considered: 0, rebuilt: 0 });
    expect(rebuilt).toEqual([]);
  });

  it('rebuilds only sites whose catalog changed since their last build', async () => {
    const { svc, rebuilt } = makeService({
      newest: { fetchedAt: T1 },
      sites: [
        { id: 'stale', tenantId: 'x', domain: 'stale.com' }, // built before newest -> rebuild
        { id: 'fresh', tenantId: 'x', domain: 'fresh.com' }, // built at newest -> skip
        { id: 'never', tenantId: 'x', domain: 'never.com' }, // never built -> rebuild
      ],
      lastBuilds: { stale: { createdAt: T0 }, fresh: { createdAt: T1 } },
    });
    const r = await svc.sweep();
    expect(rebuilt.sort()).toEqual(['never', 'stale']);
    expect(r).toEqual({ considered: 3, rebuilt: 2 });
  });

  it('skips sites that are already building', async () => {
    const { svc, rebuilt } = makeService({
      newest: { fetchedAt: T1 },
      sites: [{ id: 'busy', tenantId: 'x', domain: 'busy.com' }],
      lastBuilds: { busy: { createdAt: T0 } },
      running: ['busy'],
    });
    await svc.sweep();
    expect(rebuilt).toEqual([]);
  });

  it('continues past a failing site (best-effort)', async () => {
    const { svc, rebuilt } = makeService({
      newest: { fetchedAt: T1 },
      sites: [
        { id: 'bad', tenantId: 'x', domain: 'bad.com' },
        { id: 'good', tenantId: 'x', domain: 'good.com' },
      ],
      lastBuilds: {},
      failOn: ['bad'],
    });
    const r = await svc.sweep();
    expect(rebuilt).toEqual(['good']);
    expect(r.rebuilt).toBe(1);
  });

  it('respects AUTO_REBUILD_ENABLED=false', () => {
    const { svc } = makeService({ newest: { fetchedAt: T1 }, sites: [], lastBuilds: {}, env: { AUTO_REBUILD_ENABLED: 'false' } });
    expect(svc.enabled()).toBe(false);
  });
});
