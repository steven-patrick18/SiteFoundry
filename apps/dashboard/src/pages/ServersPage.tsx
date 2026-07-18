import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, apiStream } from '../lib/api';

interface ServerFacts {
  os?: string;
  os_version?: string;
  cpu_cores?: number;
  ram_gb?: number;
  disk_gb?: number;
  nginx_v?: string | null;
  certbot_v?: string | null;
  node_v?: string | null;
  uptime?: string;
}

interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  sshUsername: string;
  authType: string;
  credentialFingerprint: string | null;
  provider: string | null;
  baseProvisioned: boolean;
  status: string;
  lastCheckedAt: string | null;
  facts: ServerFacts;
  notes: string | null;
  last_error?: string;
}

interface ProvisionEvent {
  step: string;
  title: string;
  status: 'start' | 'ok' | 'fail' | 'done';
  detail?: string;
}

const STATUS_COLORS: Record<string, string> = {
  ready: '#22c55e',
  connected: '#3b82f6',
  pending: '#eab308',
  provisioning_base: '#a855f7',
  unreachable: '#ef4444',
  error: '#ef4444',
};

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [provisionLog, setProvisionLog] = useState<ProvisionEvent[] | null>(null);

  const reload = useCallback(async () => {
    try {
      setServers(await api<Server[]>('/servers'));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function testConnection(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api(`/servers/${id}/test-connection`, { method: 'POST' });
      await reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function repinHostKey(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api(`/servers/${id}/repin-host-key`, { method: 'POST' });
      await reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function provisionBase(id: string) {
    setBusyId(id);
    setError(null);
    setProvisionLog([]);
    try {
      for await (const event of apiStream<ProvisionEvent>(
        `/servers/${id}/provision-base`,
      )) {
        setProvisionLog((log) => {
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
      setBusyId(null);
      await reload();
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete server "${name}"? Its stored credential is deleted too.`)) return;
    try {
      await api(`/servers/${id}`, { method: 'DELETE' });
      await reload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Servers</h1>
        <button onClick={() => setShowAdd(true)}>+ Add Server</button>
      </div>
      {error && <div className="error">{error}</div>}

      {servers.length === 0 ? (
        <p className="placeholder">
          No servers yet. Add your first server with its SSH credentials — the
          credential is encrypted (AES-256-GCM envelope) before it is stored.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Host</th>
              <th>Status</th>
              <th>OS</th>
              <th>Resources</th>
              <th>Software</th>
              <th>Base</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  <div className="sub">
                    {s.sshUsername}@{s.host}:{s.port}
                  </div>
                  {s.credentialFingerprint && (
                    <div className="sub mono">{s.credentialFingerprint}</div>
                  )}
                </td>
                <td>{s.provider ?? '—'}</td>
                <td>
                  <span
                    className="badge"
                    style={{ background: STATUS_COLORS[s.status] ?? '#6b7280' }}
                  >
                    {s.status}
                  </span>
                  {s.last_error && <div className="sub error">{s.last_error}</div>}
                </td>
                <td>
                  {s.facts?.os
                    ? `${s.facts.os} ${s.facts.os_version ?? ''}`
                    : '—'}
                </td>
                <td>
                  {s.facts?.cpu_cores
                    ? `${s.facts.cpu_cores} cpu · ${s.facts.ram_gb ?? '?'} GB · ${s.facts.disk_gb ?? '?'} GB disk`
                    : '—'}
                </td>
                <td className="sub">
                  {[
                    s.facts?.nginx_v && `nginx ${s.facts.nginx_v}`,
                    s.facts?.certbot_v && `certbot ${s.facts.certbot_v}`,
                    s.facts?.node_v && `node ${s.facts.node_v}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </td>
                <td>{s.baseProvisioned ? '✓' : '—'}</td>
                <td className="actions">
                  <button
                    disabled={busyId === s.id}
                    onClick={() => testConnection(s.id)}
                  >
                    {busyId === s.id ? '…' : 'Test'}
                  </button>
                  {s.status === 'error' && (
                    <button
                      disabled={busyId === s.id}
                      title="The server's SSH host key changed (e.g. after a reboot). Re-pin it if this server is expected — only works if the saved credential still authenticates."
                      onClick={() => repinHostKey(s.id)}
                    >
                      Re-pin host key
                    </button>
                  )}
                  {!s.baseProvisioned && (
                    <button
                      disabled={busyId === s.id || s.status === 'unreachable'}
                      onClick={() => provisionBase(s.id)}
                    >
                      Provision Base
                    </button>
                  )}
                  <button className="danger" onClick={() => remove(s.id, s.name)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {provisionLog && (
        <div className="stream-panel">
          <h2>Base provisioning</h2>
          {provisionLog.length === 0 && <div className="sub">Connecting…</div>}
          {provisionLog.map((e) => (
            <div key={e.step} className={`stream-line ${e.status}`}>
              {e.status === 'ok' || e.status === 'done'
                ? '✓'
                : e.status === 'fail'
                  ? '✗'
                  : '→'}{' '}
              {e.title}
              {e.detail && <div className="sub">{e.detail}</div>}
            </div>
          ))}
          <button onClick={() => setProvisionLog(null)}>Close</button>
        </div>
      )}

      {showAdd && (
        <AddServerModal
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

function AddServerModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    host: '',
    port: 22,
    ssh_username: 'root',
    auth_type: 'ssh_key' as 'ssh_key' | 'password',
    private_key: '',
    password: '',
    provider: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        host: form.host,
        port: Number(form.port),
        ssh_username: form.ssh_username,
        auth_type: form.auth_type,
      };
      if (form.auth_type === 'ssh_key') body.private_key = form.private_key;
      else body.password = form.password;
      if (form.provider) body.provider = form.provider;
      if (form.notes) body.notes = form.notes;
      await api('/servers', { method: 'POST', body: JSON.stringify(body) });
      onAdded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: string) => (e: any) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2>Add Server</h2>
        <p className="sub">
          The system encrypts the credential, tests SSH, and detects installed
          software. Adding can take ~15s while the connection is verified.
        </p>
        <div className="grid2">
          <label>
            Name
            <input value={form.name} onChange={set('name')} placeholder="Hetzner-Frankfurt-1" required />
          </label>
          <label>
            Provider
            <select value={form.provider} onChange={set('provider')}>
              <option value="">—</option>
              <option value="hetzner">Hetzner</option>
              <option value="aws">AWS</option>
              <option value="contabo">Contabo</option>
              <option value="do">DigitalOcean</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Host / IP
            <input value={form.host} onChange={set('host')} placeholder="203.0.113.10" required />
          </label>
          <label>
            SSH port
            <input type="number" value={form.port} onChange={set('port')} min={1} max={65535} />
          </label>
          <label>
            Deploy username
            <input value={form.ssh_username} onChange={set('ssh_username')} required />
          </label>
          <label>
            Auth type
            <select value={form.auth_type} onChange={set('auth_type')}>
              <option value="ssh_key">SSH private key</option>
              <option value="password">Password</option>
            </select>
          </label>
        </div>
        {form.auth_type === 'ssh_key' ? (
          <label>
            SSH private key (PEM / OpenSSH)
            <textarea
              rows={6}
              value={form.private_key}
              onChange={set('private_key')}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              required
            />
          </label>
        ) : (
          <label>
            SSH password
            <input type="password" value={form.password} onChange={set('password')} required />
          </label>
        )}
        <label>
          Notes
          <textarea rows={2} value={form.notes} onChange={set('notes')} />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy}>
            {busy ? 'Encrypting & testing SSH…' : 'Add & Test Connection'}
          </button>
        </div>
      </form>
    </div>
  );
}
