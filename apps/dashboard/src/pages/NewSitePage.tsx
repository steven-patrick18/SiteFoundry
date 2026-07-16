import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, apiStream } from '../lib/api';
import SchemaForm from '../components/SchemaForm';
import { ClientModal, Client } from './ClientsPage';
import { CATEGORY_LABELS, TemplateSummary } from './TemplatesPage';

interface TemplateFull extends TemplateSummary {
  paramSchema: any;
}

interface ServerRow {
  id: string;
  name: string;
  host: string;
  status: string;
  provider: string | null;
  baseProvisioned: boolean;
  facts: { os?: string; disk_gb?: number; ram_gb?: number };
}

interface PreflightResult {
  ok: boolean;
  errors: { field: string; message: string }[];
  pending_build_checks: string[];
}

interface InstallEvent {
  step: string;
  title: string;
  status: 'start' | 'ok' | 'fail' | 'done' | 'skipped';
  detail?: string;
}

const STEPS = ['Template', 'Client & Domain', 'Server', 'Parameters', 'Tracking', 'Pre-flight'];

const POLICY_CHECKLIST = [
  'Ad claims match what I will write in my ads',
  'Business identity and contact are visible on page',
  'Privacy policy and required disclosures are included',
  'No pop-up gates blocking page content',
  'Outbound links go to the real declared store',
];

export default function NewSitePage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateFull[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [showAddClient, setShowAddClient] = useState(false);

  const [templateId, setTemplateId] = useState(search.get('template') ?? '');
  const [clientId, setClientId] = useState('');
  const [serverId, setServerId] = useState('');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [extraDomains, setExtraDomains] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [params, setParams] = useState<Record<string, any>>({});
  const [tracking, setTracking] = useState({
    ga4_id: '', meta_pixel_id: '', conversion_id: '', conversion_label: '',
    remarketing_id: '', bing_uet_tag: '', pushvault_property_key: '',
  });

  const [siteId, setSiteId] = useState(search.get('site'));
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [checklist, setChecklist] = useState<boolean[]>(POLICY_CHECKLIST.map(() => false));
  const [busy, setBusy] = useState(false);
  const [installLog, setInstallLog] = useState<InstallEvent[] | null>(null);
  const [installing, setInstalling] = useState(false);

  /** §6 step 7 — live install stream; `from` resumes a failed install. */
  async function runInstall(from?: string) {
    if (!siteId) return;
    setInstalling(true);
    setInstallLog([]);
    try {
      const path = from
        ? `/sites/${siteId}/install?from=${from}`
        : `/sites/${siteId}/install`;
      for await (const event of apiStream<InstallEvent>(path)) {
        setInstallLog((log) => {
          const next = [...(log ?? [])];
          const i = next.findIndex((e) => e.step === event.step);
          if (i >= 0) next[i] = event;
          else next.push(event);
          return next;
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInstalling(false);
    }
  }

  const template = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  );

  const loadLists = useCallback(async () => {
    try {
      const [t, c, s] = await Promise.all([
        api<TemplateFull[]>('/templates'),
        api<Client[]>('/clients'),
        api<ServerRow[]>('/servers'),
      ]);
      setTemplates(t);
      setClients(c);
      setServers(s);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  // template list endpoint returns summaries; fetch full schema when selected
  useEffect(() => {
    if (!templateId) return;
    api<TemplateFull>(`/templates/${templateId}`)
      .then((full) =>
        setTemplates((list) => list.map((t) => (t.id === full.id ? { ...t, ...full } : t))),
      )
      .catch((err) => setError(err.message));
  }, [templateId]);

  // editing an existing draft
  useEffect(() => {
    if (!siteId) return;
    api<any>(`/sites/${siteId}`)
      .then((site) => {
        setTemplateId(site.template.id);
        setClientId(site.client.id);
        setServerId(site.server.id);
        setName(site.name);
        setDomain(site.domain);
        setExtraDomains((site.extraDomains ?? []).join(', '));
        setDestinationUrl(site.destinationUrl);
        setParams(site.params ?? {});
        setTracking({
          ga4_id: site.ga4Id ?? '',
          meta_pixel_id: site.metaPixelId ?? '',
          conversion_id: site.googleAdsTag?.conversion_id ?? '',
          conversion_label: site.googleAdsTag?.conversion_label ?? '',
          remarketing_id: site.googleAdsTag?.remarketing_id ?? '',
          bing_uet_tag: site.bingUetTag ?? '',
          pushvault_property_key: site.pushvaultPropertyKey ?? '',
        });
      })
      .catch((err) => setError(err.message));
  }, [siteId]);

  function buildBody() {
    const googleAds =
      tracking.conversion_id || tracking.conversion_label || tracking.remarketing_id
        ? {
            conversion_id: tracking.conversion_id || undefined,
            conversion_label: tracking.conversion_label || undefined,
            remarketing_id: tracking.remarketing_id || undefined,
          }
        : undefined;
    return {
      name,
      client_id: clientId,
      server_id: serverId,
      template_id: templateId,
      domain: domain.trim().toLowerCase(),
      extra_domains: extraDomains
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
      destination_url: destinationUrl.trim(),
      params,
      tracking: {
        ga4_id: tracking.ga4_id || undefined,
        meta_pixel_id: tracking.meta_pixel_id || undefined,
        google_ads_tag: googleAds,
        bing_uet_tag: tracking.bing_uet_tag || undefined,
        pushvault_property_key: tracking.pushvault_property_key || undefined,
      },
    };
  }

  /** Save draft (create or update) then run server-side pre-flight (§6 step 6). */
  async function saveAndValidate() {
    setBusy(true);
    setError(null);
    setPreflight(null);
    try {
      const body = buildBody();
      let id = siteId;
      if (id) {
        const { client_id, server_id, template_id, domain: _d, ...patch } = body as any;
        await api(`/sites/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      } else {
        const site = await api<{ id: string }>('/sites', { method: 'POST', body: JSON.stringify(body) });
        id = site.id;
        setSiteId(id);
      }
      setPreflight(await api<PreflightResult>(`/sites/${id}/validate`, { method: 'POST' }));
      setStep(5);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const canNext = [
    !!templateId,
    !!clientId && !!name.trim() && !!domain.trim() && !!destinationUrl.trim(),
    !!serverId,
    true,
    true,
  ];

  return (
    <>
      <div className="page-head">
        <h1>New Site</h1>
        <button onClick={() => navigate('/sites')}>Back to sites</button>
      </div>

      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <span key={label} className={`wstep ${i === step ? 'active' : i < step ? 'done' : ''}`}>
            {i + 1}. {label}
          </span>
        ))}
      </div>
      {error && <div className="error">{error}</div>}

      {step === 0 && (
        <div className="card-grid">
          {templates.map((t) => (
            <div
              key={t.id}
              className={`card selectable ${t.id === templateId ? 'selected' : ''}`}
              onClick={() => setTemplateId(t.id)}
            >
              <div className="card-preview"><span>{CATEGORY_LABELS[t.category] ?? t.category}</span></div>
              <div className="card-body">
                <div className="card-title">{t.name}</div>
                <p className="sub">{t.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="wizard-panel">
          <label>
            Client *
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">— pick a client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="button" onClick={() => setShowAddClient(true)}>+ New</button>
            </div>
          </label>
          <div className="grid2">
            <label>Site name (internal) *<input value={name} onChange={(e) => setName(e.target.value)} placeholder="AC-Repair-Delhi" /></label>
            <label>Primary domain *<input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acrepairs-delhi.com" /></label>
            <label>Alias domains (comma-separated)<input value={extraDomains} onChange={(e) => setExtraDomains(e.target.value)} placeholder="www.acrepairs-delhi.com" /></label>
            <label>Destination store URL (HTTPS) *<input value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://store.example.com" /></label>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-panel">
          {servers.length === 0 && (
            <p className="placeholder">No servers connected — add one on the Servers page first.</p>
          )}
          {servers.map((s) => (
            <label key={s.id} className="server-option">
              <input
                type="radio"
                style={{ width: 'auto' }}
                name="server"
                checked={serverId === s.id}
                onChange={() => setServerId(s.id)}
              />
              <span>
                <strong>{s.name}</strong> <span className="sub">({s.host})</span>
                <span className="sub">
                  {' '}{s.facts?.os ?? 'OS unknown'} · {s.facts?.ram_gb ?? '?'} GB RAM ·
                  {' '}{s.facts?.disk_gb ?? '?'} GB disk · status {s.status}
                  {!s.baseProvisioned && ' · base NOT provisioned'}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      {step === 3 && template?.paramSchema && (
        <div className="wizard-panel">
          <SchemaForm
            schema={template.paramSchema}
            value={params}
            onChange={setParams}
            errors={preflight?.errors}
          />
        </div>
      )}

      {step === 4 && (
        <div className="wizard-panel">
          <fieldset className="param-block">
            <legend>Analytics</legend>
            <div className="grid2">
              <label>Google Analytics 4 ID<input placeholder="G-XXXXXXXXXX" value={tracking.ga4_id} onChange={(e) => setTracking({ ...tracking, ga4_id: e.target.value })} /></label>
              <label>Meta Pixel ID<input placeholder="123456789012345" value={tracking.meta_pixel_id} onChange={(e) => setTracking({ ...tracking, meta_pixel_id: e.target.value })} /></label>
            </div>
          </fieldset>
          <fieldset className="param-block">
            <legend>Google Ads</legend>
            <div className="grid2">
              <label>Conversion ID<input placeholder="AW-XXXXXXXXX" value={tracking.conversion_id} onChange={(e) => setTracking({ ...tracking, conversion_id: e.target.value })} /></label>
              <label>Conversion label<input value={tracking.conversion_label} onChange={(e) => setTracking({ ...tracking, conversion_label: e.target.value })} /></label>
              <label>Remarketing ID<input value={tracking.remarketing_id} onChange={(e) => setTracking({ ...tracking, remarketing_id: e.target.value })} /></label>
            </div>
          </fieldset>
          <fieldset className="param-block">
            <legend>Microsoft / Bing Ads</legend>
            <div className="grid2">
              <label>UET tag ID<input value={tracking.bing_uet_tag} onChange={(e) => setTracking({ ...tracking, bing_uet_tag: e.target.value })} /></label>
            </div>
          </fieldset>
          <fieldset className="param-block">
            <legend>PushVault</legend>
            <div className="grid2">
              <label>Property key<input placeholder="pk_live_xxx" value={tracking.pushvault_property_key} onChange={(e) => setTracking({ ...tracking, pushvault_property_key: e.target.value })} /></label>
            </div>
          </fieldset>
        </div>
      )}

      {step === 5 && (
        <div className="wizard-panel">
          {!preflight ? (
            <p className="placeholder">Running pre-flight…</p>
          ) : preflight.ok ? (
            <>
              <div className="stream-line ok">✓ Pre-flight validation passed — draft saved</div>
              <fieldset className="param-block">
                <legend>Verified at install time (M3)</legend>
                {preflight.pending_build_checks.map((c) => (
                  <div key={c} className="sub">• {c}</div>
                ))}
              </fieldset>
              <fieldset className="param-block">
                <legend>Policy checklist — confirm each before install</legend>
                {POLICY_CHECKLIST.map((item, i) => (
                  <label key={item} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={checklist[i]}
                      onChange={(e) =>
                        setChecklist(checklist.map((v, j) => (j === i ? e.target.checked : v)))
                      }
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </fieldset>
              <button
                disabled={installing || !checklist.every(Boolean)}
                title={!checklist.every(Boolean) ? 'Confirm every policy item first' : undefined}
                onClick={() => void runInstall()}
              >
                {installing ? 'Installing…' : 'Install Site'}
              </button>

              {installLog && (
                <div className="stream-panel">
                  <h2>Live installation</h2>
                  {installLog.length === 0 && <div className="sub">Starting…</div>}
                  {installLog.map((e) => (
                    <div key={e.step} className={`stream-line ${e.status === 'skipped' ? 'ok' : e.status}`}>
                      {e.status === 'ok' || e.status === 'done' ? '✓'
                        : e.status === 'skipped' ? '↷'
                        : e.status === 'fail' ? '✗' : '→'}{' '}
                      {e.title}
                      {e.status === 'skipped' && ' (skipped)'}
                      {e.detail && <div className="sub">{e.detail}</div>}
                      {e.status === 'fail' && e.step !== 'preflight' && (
                        <div style={{ marginTop: 6 }}>
                          <button disabled={installing} onClick={() => void runInstall(e.step)}>
                            Retry from this step
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="stream-line fail">
                ✗ {preflight.errors.length} issue(s) block install
              </div>
              {preflight.errors.map((e) => (
                <div key={e.field + e.message} className="preflight-error">
                  <span className="mono">{e.field}</span> — {e.message}
                </div>
              ))}
              <p className="sub">
                Fix the fields above (steps 2–5), then run pre-flight again.
              </p>
            </>
          )}
        </div>
      )}

      <div className="wizard-nav">
        <button disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
        {step < 4 && (
          <button disabled={!canNext[step]} onClick={() => setStep(step + 1)}>Next →</button>
        )}
        {step === 4 && (
          <button disabled={busy} onClick={() => void saveAndValidate()}>
            {busy ? 'Validating…' : 'Save draft & run pre-flight'}
          </button>
        )}
        {step === 5 && (
          <button disabled={busy} onClick={() => void saveAndValidate()}>
            {busy ? 'Validating…' : 'Re-run pre-flight'}
          </button>
        )}
      </div>

      {showAddClient && (
        <ClientModal
          client={null}
          onClose={() => setShowAddClient(false)}
          onSaved={(created) => {
            setShowAddClient(false);
            void loadLists();
            if (created) setClientId(created.id);
          }}
        />
      )}
    </>
  );
}
