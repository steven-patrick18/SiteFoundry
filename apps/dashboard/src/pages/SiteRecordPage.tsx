/**
 * §7 post-install site record — the permanent, editable home for everything
 * about one deployed site: client, domain/SSL, server, template & builds,
 * tracking, campaign links, analytics, and the activity log.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, apiStream, getToken } from '../lib/api';

interface SiteFull {
  id: string;
  name: string;
  domain: string;
  extraDomains: string[];
  destinationUrl: string;
  status: string;
  installStatus: string;
  sslStatus: string;
  sslExpiresAt: string | null;
  sslAutoRenew: boolean;
  siteSystemUser: string | null;
  documentRoot: string | null;
  lighthouseScore: number | null;
  lastVerifiedAt: string | null;
  publishedAt: string | null;
  lastBuildId: string | null;
  templateVersion: number | null;
  ga4Id: string | null;
  metaPixelId: string | null;
  googleAdsTag: { conversion_id?: string; conversion_label?: string; remarketing_id?: string } | null;
  bingUetTag: string | null;
  pushvaultPropertyKey: string | null;
  leadWebhookUrl: string | null;
  notes: string | null;
  client: { id: string; name: string; company: string | null; gstin: string | null; contactName: string | null; email: string | null; phone: string | null; address: string | null; city: string | null };
  server: { id: string; name: string; host: string; status: string; baseProvisioned: boolean; facts: any };
  template: { id: string; name: string; category: string; version: number };
}

interface CampaignLink {
  id: string;
  platform: string;
  campaignName: string;
  finalUrl: string;
  utm: Record<string, string>;
  createdAt: string;
}

interface FunnelStep { event: string; count: number; sessions: number }
interface Stats {
  series: { bucket: string; event: string; count: number }[];
  top_campaigns: { utm_campaign: string | null; visits: number; outbound: number }[];
  devices: { device: string; count: number }[];
}
interface DeployEventRow { id: string; step: string; status: string; outputTail: string | null; at: string }
interface BuildRow { id: string; status: string; durationMs: number | null; createdAt: string; artifactPath: string | null }
interface StreamEvent { step: string; title: string; status: string; detail?: string }

const FUNNEL_LABELS: Record<string, string> = {
  pageview: 'Pageview', cta_click: 'CTA Click', outbound_click: 'Outbound → Store',
  push_subscribed: 'Push Subscribed', lead_submit: 'Lead Submitted',
};

export default function SiteRecordPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState<SiteFull | null>(null);
  const [links, setLinks] = useState<CampaignLink[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<DeployEventRow[]>([]);
  const [builds, setBuilds] = useState<BuildRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamEvent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState('');

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const [s, l, f, st, ev, b] = await Promise.all([
        api<SiteFull>(`/sites/${id}`),
        api<CampaignLink[]>(`/sites/${id}/campaign-links`),
        api<{ steps: FunnelStep[] }>(`/sites/${id}/funnel${campaignFilter ? `?utm_campaign=${encodeURIComponent(campaignFilter)}` : ''}`),
        api<Stats>(`/sites/${id}/stats`),
        api<DeployEventRow[]>(`/sites/${id}/deploy-events`),
        api<BuildRow[]>(`/sites/${id}/builds`),
      ]);
      setSite(s); setLinks(l); setFunnel(f.steps); setStats(st); setEvents(ev); setBuilds(b);
    } catch (err: any) {
      setError(err.message);
    }
  }, [id, campaignFilter]);

  useEffect(() => { void reload(); }, [reload]);

  async function action(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setError(null); setNotice(null);
    try {
      await fn();
      await reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function rebuild() {
    setStream([]); setBusy('rebuild');
    try {
      for await (const e of apiStream<StreamEvent>(`/sites/${id}/rebuild`)) {
        setStream((log) => {
          const next = [...(log ?? [])];
          const i = next.findIndex((x) => x.step === e.step);
          if (i >= 0) next[i] = e; else next.push(e);
          return next;
        });
      }
    } catch (err: any) { setError(err.message); }
    finally { setBusy(null); await reload(); }
  }

  if (!site) return <p className="placeholder">{error ?? 'Loading…'}</p>;

  const maxFunnel = Math.max(1, ...funnel.map((s) => s.count));
  const isLive = site.status === 'published';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{site.name}</h1>
          <div className="sub">
            <a href={`https://${site.domain}`} target="_blank" rel="noreferrer">https://{site.domain}</a>
            {' '}· <span className="badge" style={{ background: isLive ? '#22c55e' : '#eab308' }}>{site.status}</span>
            {' '}· install: {site.installStatus}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate(`/sites/new?site=${site.id}`)}>
            {site.status === 'draft' ? 'Open wizard' : 'Edit content & products'}
          </button>
          <button onClick={() => navigate('/sites')}>All sites</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {notice && <div className="stream-line ok">✓ {notice}</div>}

      {stream && (
        <div className="stream-panel">
          <h2>Rebuild &amp; redeploy</h2>
          {stream.map((e) => (
            <div key={e.step} className={`stream-line ${e.status === 'skipped' ? 'ok' : e.status}`}>
              {['ok', 'done', 'skipped'].includes(e.status) ? '✓' : e.status === 'fail' ? '✗' : '→'} {e.title}
              {e.detail && <div className="sub">{e.detail}</div>}
            </div>
          ))}
          <button onClick={() => setStream(null)}>Close</button>
        </div>
      )}

      <div className="record-grid">
        {/* ── 7.1 Client ── */}
        <section className="section-card">
          <h2>Client</h2>
          <div className="kv"><span>Name</span><Link to="/clients">{site.client.name}</Link></div>
          {site.client.company && <div className="kv"><span>Company</span>{site.client.company}</div>}
          {site.client.gstin && <div className="kv"><span>GSTIN</span><span className="mono">{site.client.gstin}</span></div>}
          {site.client.contactName && <div className="kv"><span>Contact</span>{site.client.contactName}</div>}
          {site.client.email && <div className="kv"><span>Email</span>{site.client.email}</div>}
          {site.client.phone && <div className="kv"><span>Phone</span>{site.client.phone}</div>}
          {site.client.address && <div className="kv"><span>Address</span>{site.client.address}{site.client.city ? `, ${site.client.city}` : ''}</div>}
        </section>

        {/* ── 7.2 Domain & SSL ── */}
        <section className="section-card">
          <h2>Domain &amp; SSL</h2>
          <div className="kv"><span>Primary</span><span className="mono">{site.domain}</span></div>
          {site.extraDomains.length > 0 && (
            <div className="kv"><span>Aliases</span><span className="mono">{site.extraDomains.join(', ')}</span></div>
          )}
          <div className="kv"><span>DNS</span>Point an A record at <span className="mono">{site.server.host}</span></div>
          <div className="kv">
            <span>SSL</span>
            <span className="badge" style={{ background: site.sslStatus === 'active' ? '#22c55e' : site.sslStatus === 'renewal_failed' || site.sslStatus === 'expired' ? '#ef4444' : '#6b7280' }}>
              {site.sslStatus}
            </span>
          </div>
          {site.sslExpiresAt && (
            <div className="kv"><span>Expires</span>{new Date(site.sslExpiresAt).toLocaleDateString()}</div>
          )}
          <div className="kv">
            <span>Auto-renew</span>
            <label style={{ flexDirection: 'row', gap: 6, margin: 0 }}>
              <input
                type="checkbox" style={{ width: 'auto' }} checked={site.sslAutoRenew}
                onChange={(e) => void action('autorenew', () =>
                  api(`/sites/${site.id}`, { method: 'PATCH', body: JSON.stringify({ ssl_auto_renew: e.target.checked }) }))}
              />
              <span className="sub">{site.sslAutoRenew ? 'On' : 'Off'}</span>
            </label>
          </div>
          <button
            disabled={busy !== null || !isLive}
            onClick={() => void action('renew', async () => {
              await api(`/sites/${site.id}/renew-ssl`, { method: 'POST' });
              setNotice('Certificate renewed');
            })}
          >
            {busy === 'renew' ? 'Renewing…' : 'Force Renew Now'}
          </button>
        </section>

        {/* ── 7.3 Server ── */}
        <section className="section-card">
          <h2>Server</h2>
          <div className="kv"><span>Name</span><Link to="/servers">{site.server.name}</Link></div>
          <div className="kv"><span>Host</span><span className="mono">{site.server.host}</span></div>
          <div className="kv"><span>Status</span>{site.server.status}{site.server.baseProvisioned ? ' · base ✓' : ' · base not provisioned'}</div>
          {site.siteSystemUser && <div className="kv"><span>Site user</span><span className="mono">{site.siteSystemUser}</span></div>}
          {site.documentRoot && <div className="kv"><span>Docroot</span><span className="mono">{site.documentRoot}</span></div>}
          {site.server.facts?.os && (
            <div className="kv"><span>Facts</span>{site.server.facts.os} · {site.server.facts.ram_gb ?? '?'} GB RAM · {site.server.facts.disk_gb ?? '?'} GB disk</div>
          )}
        </section>

        {/* ── 7.4 Template & Build ── */}
        <section className="section-card">
          <h2>Template &amp; Builds</h2>
          <div className="kv"><span>Template</span>{site.template.name} v{site.templateVersion ?? site.template.version}</div>
          <div className="kv"><span>Lighthouse</span>{site.lighthouseScore ?? '— (measured on live install)'}</div>
          <button disabled={busy !== null || site.status === 'draft'} onClick={() => void rebuild()}>
            {busy === 'rebuild' ? 'Redeploying…' : 'Rebuild & Redeploy'}
          </button>
          <div style={{ marginTop: 10 }}>
            {builds.slice(0, 5).map((b) => (
              <div key={b.id} className="kv">
                <span className="mono">{b.id.slice(0, 8)}{b.id === site.lastBuildId ? ' ●' : ''}</span>
                <span>
                  {b.status}{b.durationMs ? ` · ${(b.durationMs / 1000).toFixed(1)}s` : ''} · {new Date(b.createdAt).toLocaleString()}
                  {b.status === 'success' && b.artifactPath && b.id !== site.lastBuildId && (
                    <button
                      style={{ marginLeft: 8, padding: '2px 10px', fontSize: 11 }}
                      disabled={busy !== null}
                      onClick={() => void action('rollback', async () => {
                        await api(`/sites/${site.id}/rollback`, { method: 'POST', body: JSON.stringify({ build_id: b.id }) });
                        setNotice(`Rolled back to ${b.id.slice(0, 8)}`);
                      })}
                    >
                      Rollback
                    </button>
                  )}
                </span>
              </div>
            ))}
            {builds.length === 0 && <p className="sub">No builds yet.</p>}
          </div>
        </section>

        {/* ── 7.6 Tracking & Integrations ── */}
        <TrackingSection site={site} busy={busy} onSave={(tracking) =>
          void action('tracking', async () => {
            await api(`/sites/${site.id}`, { method: 'PATCH', body: JSON.stringify({ tracking }) });
            setNotice(isLive ? 'Tracking saved — run Rebuild & Redeploy to update the live page' : 'Tracking saved');
          })} />

        {/* ── 7.7 Campaign links ── */}
        <section className="section-card wide">
          <h2>Ad Campaigns</h2>
          <AddCampaign siteId={site.id} onAdded={() => void reload()} disabled={busy !== null} />
          {links.length === 0 ? (
            <p className="sub">No campaign links yet — add one and paste the final URL into your ad.</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Platform</th><th>Campaign</th><th>Final URL</th><th /></tr></thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id}>
                    <td>{l.platform}</td>
                    <td>{l.campaignName}</td>
                    <td className="mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{l.finalUrl}</td>
                    <td className="actions">
                      <button onClick={() => { void navigator.clipboard.writeText(l.finalUrl); setNotice('URL copied'); }}>Copy</button>
                      <button className="danger" onClick={() => void action('dellink', () =>
                        api(`/sites/${site.id}/campaign-links/${l.id}`, { method: 'DELETE' }))}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── 7.8 Analytics ── */}
        <section className="section-card wide">
          <h2>Analytics (last 30 days)</h2>
          <label style={{ maxWidth: 320 }}>
            Filter by campaign
            <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
              <option value="">All traffic</option>
              {links.map((l) => (
                <option key={l.id} value={l.campaignName}>{l.campaignName}</option>
              ))}
            </select>
          </label>
          <div className="funnel">
            {funnel.map((s) => (
              <div key={s.event} className="funnel-row">
                <span className="funnel-label">{FUNNEL_LABELS[s.event] ?? s.event}</span>
                <div className="funnel-track">
                  <div className="funnel-bar" style={{ width: `${(s.count / maxFunnel) * 100}%` }} />
                </div>
                <span className="funnel-count">{s.count}</span>
              </div>
            ))}
          </div>
          {stats && stats.top_campaigns.length > 0 && (
            <table className="data-table" style={{ marginTop: 14 }}>
              <thead><tr><th>Campaign</th><th>Visits</th><th>Outbound clicks</th><th>Spend</th></tr></thead>
              <tbody>
                {stats.top_campaigns.map((c) => (
                  <tr key={c.utm_campaign ?? 'direct'}>
                    <td>{c.utm_campaign ?? '(direct / none)'}</td>
                    <td>{c.visits}</td>
                    <td>{c.outbound}</td>
                    <td className="sub">— (ad API sync, Phase 2)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── 7.9 Leads ── */}
        <LeadsSection site={site} setNotice={setNotice} setError={setError} />

        {/* ── 7.10 Activity log ── */}
        <section className="section-card wide">
          <h2>Activity</h2>
          {events.length === 0 ? (
            <p className="sub">No deploy activity yet.</p>
          ) : (
            events.slice(0, 20).map((e) => (
              <div key={e.id} className={`stream-line ${e.status === 'ok' ? 'ok' : e.status === 'fail' ? 'fail' : 'start'}`}>
                {e.status === 'ok' ? '✓' : e.status === 'fail' ? '✗' : '→'} {e.step}
                <span className="sub"> · {new Date(e.at).toLocaleString()}</span>
                {e.status === 'fail' && e.outputTail && <div className="sub">{e.outputTail}</div>}
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}

function LeadsSection({
  site, setNotice, setError,
}: {
  site: SiteFull;
  setNotice: (m: string | null) => void;
  setError: (m: string | null) => void;
}) {
  const [leads, setLeads] = useState<Array<{ id: string; fields: Record<string, string>; sourceUtm: Record<string, string> | null; at: string }>>([]);
  const [webhook, setWebhook] = useState(site.leadWebhookUrl ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<typeof leads>(`/sites/${site.id}/leads`).then(setLeads).catch(() => undefined);
  }, [site.id]);

  async function saveWebhook() {
    setBusy(true);
    setError(null);
    try {
      await api(`/sites/${site.id}/leads/webhook`, {
        method: 'PATCH',
        body: JSON.stringify({ url: webhook.trim() || null }),
      });
      setNotice(webhook.trim() ? 'Webhook saved' : 'Webhook cleared');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function testWebhook() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ delivered: boolean }>(`/sites/${site.id}/leads/webhook-test`, { method: 'POST' });
      setNotice(res.delivered ? 'Test payload delivered ✓' : 'Webhook did not accept the test payload');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    const res = await fetch(`/api/v1/sites/${site.id}/leads/export`, {
      headers: { authorization: `Bearer ${getToken()}` },
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${site.domain}-leads.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNotice('CSV exported (audit-logged)');
  }

  const fieldKeys = [...new Set(leads.flatMap((l) => Object.keys(l.fields)))].slice(0, 4);

  return (
    <section className="section-card wide">
      <h2>Leads ({leads.length})</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={{ margin: 0, flex: 1 }}>
          Delivery webhook (POST JSON on every lead)
          <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://hooks.example.com/leads" />
        </label>
        <button disabled={busy} onClick={() => void saveWebhook()}>Save</button>
        <button disabled={busy || !site.leadWebhookUrl} onClick={() => void testWebhook()}>Test send</button>
        <button disabled={leads.length === 0} onClick={() => void exportCsv()}>Export CSV</button>
      </div>
      {leads.length === 0 ? (
        <p className="sub">No leads yet — submissions from the site's consented form appear here.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Submitted</th>
              {fieldKeys.map((k) => <th key={k}>{k}</th>)}
              <th>Campaign</th>
            </tr>
          </thead>
          <tbody>
            {leads.slice(0, 25).map((l) => (
              <tr key={l.id}>
                <td className="sub">{new Date(l.at).toLocaleString()}</td>
                {fieldKeys.map((k) => <td key={k}>{l.fields[k] ?? '—'}</td>)}
                <td className="sub">{l.sourceUtm?.campaign ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function TrackingSection({
  site, busy, onSave,
}: {
  site: SiteFull;
  busy: string | null;
  onSave: (tracking: Record<string, unknown>) => void;
}) {
  const [t, setT] = useState({
    ga4_id: site.ga4Id ?? '',
    meta_pixel_id: site.metaPixelId ?? '',
    conversion_id: site.googleAdsTag?.conversion_id ?? '',
    conversion_label: site.googleAdsTag?.conversion_label ?? '',
    remarketing_id: site.googleAdsTag?.remarketing_id ?? '',
    bing_uet_tag: site.bingUetTag ?? '',
    pushvault_property_key: site.pushvaultPropertyKey ?? '',
  });
  const set = (k: string) => (e: any) => setT((v) => ({ ...v, [k]: e.target.value }));

  return (
    <section className="section-card">
      <h2>Tracking &amp; Integrations</h2>
      <label>Google Analytics 4<input value={t.ga4_id} onChange={set('ga4_id')} placeholder="G-XXXXXXXXXX" /></label>
      <label>Meta Pixel<input value={t.meta_pixel_id} onChange={set('meta_pixel_id')} placeholder="123456789012345" /></label>
      <label>Google Ads conversion ID<input value={t.conversion_id} onChange={set('conversion_id')} placeholder="AW-XXXXXXXXX" /></label>
      <label>Conversion label<input value={t.conversion_label} onChange={set('conversion_label')} /></label>
      <label>Bing UET tag<input value={t.bing_uet_tag} onChange={set('bing_uet_tag')} /></label>
      <label>PushVault property key<input value={t.pushvault_property_key} onChange={set('pushvault_property_key')} placeholder="pk_live_xxx" /></label>
      <div className="kv"><span>Google Ads API</span><span className="sub">Not connected (Phase 2)</span></div>
      <button
        disabled={busy !== null}
        onClick={() => onSave({
          ga4_id: t.ga4_id || undefined,
          meta_pixel_id: t.meta_pixel_id || undefined,
          google_ads_tag: t.conversion_id || t.conversion_label || t.remarketing_id
            ? { conversion_id: t.conversion_id || undefined, conversion_label: t.conversion_label || undefined, remarketing_id: t.remarketing_id || undefined }
            : undefined,
          bing_uet_tag: t.bing_uet_tag || undefined,
          pushvault_property_key: t.pushvault_property_key || undefined,
        })}
      >
        {busy === 'tracking' ? 'Saving…' : 'Save tracking'}
      </button>
    </section>
  );
}

function AddCampaign({
  siteId, onAdded, disabled,
}: {
  siteId: string;
  onAdded: () => void;
  disabled: boolean;
}) {
  const [platform, setPlatform] = useState('google');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      await api(`/sites/${siteId}/campaign-links`, {
        method: 'POST',
        body: JSON.stringify({ platform, campaign_name: name.trim() }),
      });
      setName('');
      onAdded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
      <label style={{ margin: 0, width: 140 }}>
        Platform
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="google">Google</option>
          <option value="meta">Meta</option>
          <option value="bing">Bing</option>
        </select>
      </label>
      <label style={{ margin: 0, flex: 1 }}>
        Campaign name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="AC-Repair-Delhi-Search" />
      </label>
      <button disabled={disabled || busy || !name.trim()} onClick={() => void add()}>
        {busy ? 'Generating…' : '+ Add campaign link'}
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
