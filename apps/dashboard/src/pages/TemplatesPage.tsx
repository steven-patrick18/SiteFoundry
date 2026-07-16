import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export interface TemplateSummary {
  id: string;
  tenantId: string | null;
  name: string;
  category: string;
  description: string | null;
  version: number;
  previewImageUrl: string | null;
}

export const CATEGORY_LABELS: Record<string, string> = {
  ecom_showcase: 'E-com Showcase',
  offer_awareness: 'Offer Awareness',
  comparison: 'Comparison',
  lead_page: 'Lead Page',
  prelander: 'Prelander',
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const reload = useCallback(async () => {
    try {
      const query = category ? `?category=${category}` : '';
      setTemplates(await api<TemplateSummary[]>(`/templates${query}`));
    } catch (err: any) {
      setError(err.message);
    }
  }, [category]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <div className="page-head">
        <h1>Templates</h1>
        <select style={{ width: 200 }} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card-grid">
        {templates.map((t) => (
          <div key={t.id} className="card">
            <div className="card-preview">
              {t.previewImageUrl ? (
                <img src={t.previewImageUrl} alt="" />
              ) : (
                <span>{CATEGORY_LABELS[t.category] ?? t.category}</span>
              )}
            </div>
            <div className="card-body">
              <div className="card-title">
                {t.name}
                <span className="sub"> v{t.version}{t.tenantId ? '' : ' · stock'}</span>
              </div>
              <p className="sub">{t.description}</p>
              <button onClick={() => navigate(`/sites/new?template=${t.id}`)}>
                Use this template
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
