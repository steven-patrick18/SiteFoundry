import { NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { SITEFOUNDRY_VERSION } from '@sitefoundry/shared';
import { getToken, setToken } from './lib/api';
import LoginPage from './pages/LoginPage';
import ServersPage from './pages/ServersPage';
import ClientsPage from './pages/ClientsPage';
import TemplatesPage from './pages/TemplatesPage';
import SitesPage from './pages/SitesPage';
import SettingsPage from './pages/SettingsPage';

const NAV = [
  { to: '/servers', label: 'Servers' },
  { to: '/clients', label: 'Clients' },
  { to: '/templates', label: 'Templates' },
  { to: '/sites', label: 'Sites' },
  { to: '/settings', label: 'Settings' },
];

function Shell() {
  const navigate = useNavigate();
  if (!getToken()) return <Navigate to="/login" replace />;
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          SiteFoundry
          <span className="version">v{SITEFOUNDRY_VERSION}</span>
        </div>
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          className="logout"
          onClick={() => {
            setToken(null);
            navigate('/login');
          }}
        >
          Sign out
        </button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Navigate to="/servers" replace />} />
        <Route path="/servers" element={<ServersPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/sites" element={<SitesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
