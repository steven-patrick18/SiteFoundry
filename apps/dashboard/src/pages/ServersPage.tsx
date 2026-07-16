import { useEffect, useState } from 'react';

interface HealthResponse {
  status: string;
  version: string;
  dependencies: { database: string; redis: string };
}

export default function ServersPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <>
      <h1>Servers</h1>
      <p className="placeholder">
        Connected servers with status badges, add-server wizard, and base
        provisioning land in Milestone M1.
      </p>
      <div className="api-status">
        {health ? (
          <>
            API <code>{health.status}</code> (v{health.version}) — database{' '}
            <code>{health.dependencies.database}</code>, redis{' '}
            <code>{health.dependencies.redis}</code>
          </>
        ) : error ? (
          <>API unreachable: {error}</>
        ) : (
          <>Checking API…</>
        )}
      </div>
    </>
  );
}
