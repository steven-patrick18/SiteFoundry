import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

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

export default function SitesPage() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const reload = useCallback(async () => {
    try {
      setSites(await api<SiteRow[]>('/sites'));
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
                  <button onClick={() => navigate(`/sites/new?site=${s.id}`)}>Edit draft</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
