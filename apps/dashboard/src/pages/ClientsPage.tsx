import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface Client {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  gstin: string | null;
  address: string | null;
  city: string | null;
  country: string;
  websiteUrl: string | null;
  notes: string | null;
  status: string;
  _count?: { sites: number };
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [editing, setEditing] = useState<Client | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setClients(await api<Client[]>('/clients'));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function remove(c: Client) {
    if (!window.confirm(`Delete client "${c.name}"?`)) return;
    try {
      await api(`/clients/${c.id}`, { method: 'DELETE' });
      await reload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Clients</h1>
        <button onClick={() => setEditing('new')}>+ Add Client</button>
      </div>
      {error && <div className="error">{error}</div>}

      {clients.length === 0 ? (
        <p className="placeholder">No clients yet — add the business you deploy sites for.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th><th>Contact</th><th>Location</th><th>Sites</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  {c.company && <div className="sub">{c.company}</div>}
                  {c.gstin && <div className="sub mono">EIN {c.gstin}</div>}
                </td>
                <td>
                  {c.contactName && <div>{c.contactName}</div>}
                  {c.email && <div className="sub">{c.email}</div>}
                  {c.phone && <div className="sub">{c.phone}</div>}
                </td>
                <td className="sub">{[c.city, c.country].filter(Boolean).join(', ') || '—'}</td>
                <td>{c._count?.sites ?? 0}</td>
                <td>
                  <span className="badge" style={{ background: c.status === 'active' ? '#22c55e' : '#6b7280' }}>
                    {c.status}
                  </span>
                </td>
                <td className="actions">
                  <button onClick={() => setEditing(c)}>Edit</button>
                  <button className="danger" onClick={() => remove(c)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <ClientModal
          client={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </>
  );
}

export function ClientModal({
  client, onClose, onSaved,
}: {
  client: Client | null;
  onClose: () => void;
  onSaved: (created?: { id: string; name: string }) => void;
}) {
  const [form, setForm] = useState({
    name: client?.name ?? '',
    contactName: client?.contactName ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    company: client?.company ?? '',
    gstin: client?.gstin ?? '',
    address: client?.address ?? '',
    city: client?.city ?? '',
    country: client?.country ?? 'US',
    websiteUrl: client?.websiteUrl ?? '',
    notes: client?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) if (v !== '') body[k] = v as string;
    try {
      const saved = client
        ? await api<Client>(`/clients/${client.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await api<Client>('/clients', { method: 'POST', body: JSON.stringify(body) });
      onSaved({ id: saved.id, name: saved.name });
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2>{client ? `Edit ${client.name}` : 'Add Client'}</h2>
        <div className="grid2">
          <label>Business name *<input value={form.name} onChange={set('name')} required /></label>
          <label>Company (legal)<input value={form.company} onChange={set('company')} /></label>
          <label>Contact person<input value={form.contactName} onChange={set('contactName')} /></label>
          <label>Email<input type="email" value={form.email} onChange={set('email')} /></label>
          <label>Phone<input value={form.phone} onChange={set('phone')} placeholder="+1 (555) 555-0134" /></label>
          <label>Tax ID (EIN)<input value={form.gstin} onChange={set('gstin')} placeholder="12-3456789" /></label>
          <label>City<input value={form.city} onChange={set('city')} /></label>
          <label>Country (ISO-2)<input value={form.country} maxLength={2} onChange={set('country')} placeholder="US" /></label>
        </div>
        <label>Address<textarea rows={2} value={form.address} onChange={set('address')} /></label>
        <label>Existing website<input value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://" /></label>
        <label>Notes<textarea rows={2} value={form.notes} onChange={set('notes')} /></label>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
