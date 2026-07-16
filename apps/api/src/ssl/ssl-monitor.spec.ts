import { describe, expect, it } from 'vitest';
import { classifySsl } from './ssl-monitor.service';

const NOW = new Date('2026-07-16T12:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

describe('SSL expiry classification (§9: 14/7/1-day alerts)', () => {
  it('no alert while more than 14 days remain', () => {
    expect(classifySsl({ sslStatus: 'active', sslExpiresAt: inDays(30), now: NOW })).toBeNull();
    expect(classifySsl({ sslStatus: 'active', sslExpiresAt: inDays(15), now: NOW })).toBeNull();
  });

  it('notice at 14 days, warning at 7, critical at 1', () => {
    expect(classifySsl({ sslStatus: 'active', sslExpiresAt: inDays(14), now: NOW })?.level).toBe('notice');
    expect(classifySsl({ sslStatus: 'active', sslExpiresAt: inDays(7), now: NOW })?.level).toBe('warning');
    expect(classifySsl({ sslStatus: 'active', sslExpiresAt: inDays(1), now: NOW })?.level).toBe('critical');
  });

  it('expired when past due; renewal_failed passes through', () => {
    expect(classifySsl({ sslStatus: 'active', sslExpiresAt: inDays(-1), now: NOW })?.level).toBe('expired');
    expect(classifySsl({ sslStatus: 'renewal_failed', sslExpiresAt: inDays(50), now: NOW })?.level).toBe('renewal_failed');
  });

  it('sites without SSL are ignored', () => {
    expect(classifySsl({ sslStatus: 'none', sslExpiresAt: null, now: NOW })).toBeNull();
  });
});
