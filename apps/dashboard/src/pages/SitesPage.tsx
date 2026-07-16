import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface BuildRow {
  id: string;
  status: string;
  durationMs: number | null;
  lighthouseScore: number | null;
  createdAt: string;
  artifactPath: string | null;
}

interface SiteRow {
  id: string;
  name: string;
  domain: string;
  status: string;
  installStatus: string;
  sslStatus: string;
  lighthouseScore: number | null;
  client: { name: string };
  server: { name: string };
  template: { name: string };
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#eab308',
  building: '#a855f7',
  published: '#22c55e',
  paused: '#6b7280',
  archived: '#4b5563',
};

interface SslAlert {
  site_id: string;
  domain: string;
  level: string;
  days_left: number | null;
}

export default function SitesPage() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [alerts, setAlerts] = useState<SslAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [buildsFor, setBuildsFor] = useState<SiteRow | null>(null);
  const navigate = useNavigate();

  const reload = useCallback(async () => {
    try {
      setSites(await api<SiteRow[]>('/sites'));
      setAlerts(await api<SslAlert[]>('/alerts/ssl'));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <div className="page-head">
        <h1>Sites</h1>
        <button onClick={() => navigate('/sites/new')}>+ New Site</button>
      </div>
      {error && <div className="error">{error}</div>}

      {alerts.length > 0 && (
        <div className="ssl-alerts">
          {alerts.map((a) => (
            <div key={a.site_id} className={`ssl-alert ${a.level}`}>
              🔒 <strong>{a.domain}</strong>{' '}
              {a.level === 'expired' ? 'SSL certificate EXPIRED'
                : a.level === 'renewal_failed' ? 'SSL renewal FAILED'
                : `SSL expires in ${a.days_left} day${a.days_left === 1 ? '' : 's'}`}
              <button style={{ marginLeft: 10, padding: '2px 10px', fontSize: 11 }} onClick={() => navigate(`/sites/${a.site_id}`)}>
                Open record
              </button>
            </div>
          ))}
        </div>
      )}

      {sites.length === 0 ? (
        <p className="placeholder">
          No sites yet. Start the wizard — pick a template, fill in the
          parameters, and pre-flight validation checks compliance before any
          server is touched.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Site</th><th>Client</th><th>Server</th><th>Template</th>
              <th>Status</th><th>Install</th><th>SSL</th><th />
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  <div className="sub mono">{s.domain}</div>
                </td>
                <td>{s.client.name}</td>
                <td>{s.server.name}</td>
                <td>{s.template.name}</td>
                <td>
                  <span className="badge" style={{ background: STATUS_COLORS[s.status] ?? '#6b7280' }}>
                    {s.status}
                  </span>
                </td>
                <td className="sub">{s.installStatus}</td>
                <td className="sub">{s.sslStatus}</td>
                <td className="actions">
                  <button onClick={() => navigate(`/sites/${s.id}`)}>Open record</button>
                  <button onClick={() => navigate(`/sites/new?site=${s.id}`)}>
                    {s.status === 'draft' ? 'Edit draft' : 'Edit content'}
                  </button>
                  <button onClick={() => setBuildsFor(s)}>Builds</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {buildsFor && (
        <BuildsModal
          site={buildsFor}
          onClose={() => setBuildsFor(null)}
          onChanged={() => void reload()}
        />
      )}
    </>
  );
}

function BuildsModal({
  site, onClose, onChanged,
}: {
  site: SiteRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [builds, setBuilds] = useState<BuildRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api<BuildRow[]>(`/sites/${site.id}/builds`)
      .then(setBuilds)
      .catch((err) => setError(err.message));
  }, [site.id]);

  async function rollback(buildId: string) {
    if (!window.confirm(`Roll back ${site.domain} to build ${buildId.slice(0, 8)}?`)) return;
    setBusyId(buildId);
    setError(null);
    setMessage(null);
    const started = Date.now();
    try {
      await api(`/sites/${site.id}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ build_id: buildId }),
      });
      setMessage(`Rolled back in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Builds — {site.domain}</h2>
        <p className="sub">Each build is an immutable artifact. Rollback swaps the live files in seconds.</p>
        {error && <div className="error">{error}</div>}
        {message && <div className="stream-line ok">✓ {message}</div>}
        {!builds ? (
          <p className="placeholder">Loading…</p>
        ) : builds.length === 0 ? (
          <p className="placeholder">No builds yet — builds appear after the first install.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Build</th><th>Status</th><th>Duration</th><th>Created</th><th /></tr>
            </thead>
            <tbody>
              {builds.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.id.slice(0, 8)}</td>
                  <td>
                    <span className="badge" style={{ background: b.status === 'success' ? '#22c55e' : b.status === 'failed' ? '#ef4444' : '#eab308' }}>
                      {b.status}
                    </span>
                  </td>
                  <td className="sub">{b.durationMs ? `${(b.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                  <td className="sub">{new Date(b.createdAt).toLocaleString()}</td>
                  <td>
                    {b.status === 'success' && b.artifactPath && (
                      <button disabled={busyId !== null} onClick={() => void rollback(b.id)}>
                        {busyId === b.id ? 'Rolling back…' : 'Rollback'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
