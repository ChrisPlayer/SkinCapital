import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from './lib/i18n.tsx';
import { LoginPage } from './features/auth/LoginPage.tsx';
import { DashboardPage } from './features/dashboard/DashboardPage.tsx';
import { ProfilesPage } from './features/profiles/ProfilesPage.tsx';
import { SettingsPage } from './features/settings/SettingsPage.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ProfilesPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/profile/:steamId" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/:steamId" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}
