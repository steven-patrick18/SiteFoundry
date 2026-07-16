/**
 * §12 Settings — users/roles management, system configuration overview,
 * and integration status (SerpApi usage, PushVault/CallForge, ad APIs).
 * Admin-only data; secrets never leave the server (status flags only).
 */
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

interface UserRow {
  id: string;
  email: string;
  role: 'admin' | 'builder' | 'viewer';
  lastLoginAt: string | null;
  createdAt: string;
}

interface SystemInfo {
  tenant: { name: string; plan: string; createdAt: string } | null;
  counts: { users: number; servers: number; clients: number; sites: number; leads: number };
  system: {
    kms_provider: string;
    jobs_mode: string;
    skip_ssl: boolean;
    panel_public_url: string;
    node_env: string;
  };
  integrations: {
    serpapi: { configured: boolean; searches_this_month: number };
    pushvault: { configured: boolean; note: string };
    callforge: { configured: boolean; note: string };
    google_ads_api: { configured: boolean; note: string };
  };
}

const ROLE_HELP: Record<string, string> = {
  admin: 'Full access incl. users, templates, settings',
  builder: 'Create/deploy sites, servers, clients',
  viewer: 'Read-only',
};

export default function SettingsPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [u, s] = await Promise.all([
        api<UserRow[]>('/users'),
        api<SystemInfo>('/settings/system'),
      ]);
      setUsers(u);
      setInfo(s);
      setForbidden(false);
    } catch (err: any) {
      if (err.status === 403) setForbidden(true);
      else setError(err.message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function changeRole(u: UserRow, role: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setNotice(`${u.email} is now ${role}`);
      await reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(u: UserRow) {
    if (!window.confirm(`Delete user ${u.email}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      setNotice(`${u.email} deleted`);
      await reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <>
        <h1>Settings</h1>
        <p className="placeholder">Settings are admin-only. Ask an admin for access.</p>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        {info?.tenant && (
          <span className="sub">
            Tenant: <strong>{info.tenant.name}</strong> · plan {info.tenant.plan}
          </span>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {notice && <div className="stream-line ok">✓ {notice}</div>}

      <div className="record-grid">
        {/* ── Users & roles ── */}
        <section className="section-card wide">
          <h2>Users &amp; Roles</h2>
          <table className="data-table">
            <thead>
              <tr><th>Email</th><th>Role</th><th>Last login</th><th /></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={busy}
                      style={{ width: 130 }}
                      onChange={(e) => void changeRole(u, e.target.value)}
                      title={ROLE_HELP[u.role]}
                    >
                      <option value="admin">admin</option>
                      <option value="builder">builder</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </td>
                  <td className="sub">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'never'}
                  </td>
                  <td className="actions">
                    <button className="danger" disabled={busy} onClick={() => void removeUser(u)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setShowAdd(true)}>+ Add user</button>
          <p className="sub" style={{ marginTop: 8 }}>
            admin: {ROLE_HELP.admin} · builder: {ROLE_HELP.builder} · viewer: {ROLE_HELP.viewer}
          </p>
        </section>

        {/* ── System ── */}
        {info && (
          <section className="section-card">
            <h2>System</h2>
            <div className="kv"><span>Environment</span>{info.system.node_env}</div>
            <div className="kv">
              <span>Vault / KMS</span>
              <span>
                {info.system.kms_provider === 'aws' ? 'AWS KMS' : 'local-dev key'}
                {info.system.kms_provider !== 'aws' && (
                  <span className="sub"> — switch to AWS KMS in production</span>
                )}
              </span>
            </div>
            <div className="kv"><span>Job runner</span>{info.system.jobs_mode}</div>
            <div className="kv">
              <span>SSL issuance</span>
              {info.system.skip_ssl ? 'SKIPPED (dev)' : 'certbot enabled'}
            </div>
            <div className="kv"><span>Panel URL</span><span className="mono">{info.system.panel_public_url}</span></div>
            <div className="kv">
              <span>Inventory</span>
              {info.counts.servers} servers · {info.counts.clients} clients · {info.counts.sites} sites · {info.counts.leads} leads
            </div>
            <p className="sub" style={{ marginTop: 8 }}>
              Values come from the panel environment (.env) — secrets are never shown here.
            </p>
          </section>
        )}

        {/* ── Integrations ── */}
        {info && (
          <section className="section-card">
            <h2>Integrations</h2>
            <div className="kv">
              <span>SerpApi</span>
              <span>
                {info.integrations.serpapi.configured ? (
                  <>
                    <span className="badge" style={{ background: '#22c55e' }}>connected</span>
                    {' '}{info.integrations.serpapi.searches_this_month} searches this month
                  </>
                ) : (
                  <span className="sub">not configured — set SERPAPI_KEY</span>
                )}
              </span>
            </div>
            <div className="kv">
              <span>PushVault</span>
              <span className="sub">{info.integrations.pushvault.note}</span>
            </div>
            <div className="kv">
              <span>CallForge</span>
              <span className="sub">{info.integrations.callforge.note}</span>
            </div>
            <div className="kv">
              <span>Google Ads API</span>
              <span className="sub">{info.integrations.google_ads_api.note}</span>
            </div>
          </section>
        )}
      </div>

      <UpdateCard setError={setError} setNotice={setNotice} />

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

interface VersionInfo {
  short: string;
  subject: string;
  date: string;
  branch: string;
  behind: number;
  remote_short: string | null;
  update_available: boolean;
  self_update_enabled: boolean;
  is_git: boolean;
}

function UpdateCard({
  setError, setNotice,
}: {
  setError: (m: string | null) => void;
  setNotice: (m: string | null) => void;
}) {
  const [v, setV] = useState<VersionInfo | null>(null);
  const [busy, setBusy] = useState<'check' | 'update' | null>(null);
  const [log, setLog] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setV(await api<VersionInfo>('/settings/update'));
    } catch (err: any) {
      if (err.status !== 403) setError(err.message);
    }
  }, [setError]);

  useEffect(() => { void load(); }, [load]);

  async function check() {
    setBusy('check');
    setError(null);
    try {
      const info = await api<VersionInfo>('/settings/update');
      setV(info);
      setNotice(info.update_available ? `Update available (${info.behind} commit${info.behind === 1 ? '' : 's'} behind)` : 'Panel is up to date');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function runUpdate() {
    if (!window.confirm('Pull the latest code, run migrations, rebuild, and restart the panel? The panel will be briefly unavailable.')) return;
    setBusy('update');
    setError(null);
    setLog(null);
    try {
      const res = await api<{ from: string; to: string; log: string; restarting: boolean }>('/settings/update', { method: 'POST' });
      setLog(res.log.slice(-4000));
      setNotice(`Updated ${res.from} → ${res.to}${res.restarting ? ' — panel is restarting, this page will reconnect shortly' : ''}`);
      if (res.restarting) setTimeout(() => window.location.reload(), 8000);
      else await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (!v) return null;

  return (
    <section className="section-card wide" style={{ marginTop: 16 }}>
      <h2>Software Update</h2>
      {!v.is_git ? (
        <p className="sub">This panel is not running from a git checkout, so in-app updates aren't available. Deploy from git to enable this.</p>
      ) : (
        <>
          <div className="kv"><span>Current</span><span className="mono">{v.short}</span> — {v.subject}</div>
          <div className="kv"><span>Branch</span><span className="mono">{v.branch}</span></div>
          <div className="kv"><span>Committed</span>{v.date ? new Date(v.date).toLocaleString() : '—'}</div>
          <div className="kv">
            <span>Status</span>
            {v.update_available ? (
              <span>
                <span className="badge" style={{ background: '#eab308' }}>update available</span>
                {' '}{v.behind} commit{v.behind === 1 ? '' : 's'} behind
                {v.remote_short && <span className="mono"> (origin @ {v.remote_short})</span>}
              </span>
            ) : (
              <span className="badge" style={{ background: '#22c55e' }}>up to date</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button disabled={busy !== null} onClick={() => void check()}>
              {busy === 'check' ? 'Checking…' : 'Check for updates'}
            </button>
            <button
              disabled={busy !== null || !v.update_available || !v.self_update_enabled}
              title={!v.self_update_enabled ? 'Set ALLOW_SELF_UPDATE=true on the panel server' : undefined}
              onClick={() => void runUpdate()}
            >
              {busy === 'update' ? 'Updating…' : 'Update now'}
            </button>
          </div>
          {!v.self_update_enabled && (
            <p className="sub" style={{ marginTop: 8 }}>
              In-app updates are disabled here. On the panel server run{' '}
              <span className="mono">bash deploy/update.sh</span> (or enable ALLOW_SELF_UPDATE=true).
            </p>
          )}
          {log && (
            <pre className="update-log">{log}</pre>
          )}
        </>
      )}
    </section>
  );
}

function AddUserModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('builder');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({ email, password, role }) });
      onAdded();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2>Add user</h2>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password (min 8 chars)<input type="password" value={password} minLength={8} onChange={(e) => setPassword(e.target.value)} required /></label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">admin — full access</option>
            <option value="builder">builder — build &amp; deploy</option>
            <option value="viewer">viewer — read-only</option>
          </select>
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
        </div>
      </form>
    </div>
  );
}
