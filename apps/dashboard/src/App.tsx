import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { SITEFOUNDRY_VERSION } from '@sitefoundry/shared';
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

export default function App() {
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
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/servers" replace />} />
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
