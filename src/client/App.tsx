import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { I18nProvider } from './lib/i18n.tsx';
import { ToastProvider } from './components/toast.tsx';
import { useEventToasts } from './hooks/useEvents.ts';

// Route-level code splitting: each page is its own chunk, so the initial load
// only ships what the landing route needs.
const LoginPage = lazy(() => import('./features/auth/LoginPage.tsx').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage.tsx'));
const ProfilesPage = lazy(() => import('./features/profiles/ProfilesPage.tsx').then((m) => ({ default: m.ProfilesPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

// Bridges the server event journal to toasts. Rendered inside ToastProvider /
// I18nProvider so the hook can reach both contexts.
function EventToasts() {
  useEventToasts();
  return null;
}

function RouteFallback() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="w-16 h-16 rounded-2xl bg-sf-cyan/10 border border-sf-cyan/20 flex items-center justify-center animate-pulse">
        <Shield className="w-9 h-9 text-sf-cyan" />
      </div>
    </div>
  );
}

export function App() {
  // Re-apply the saved accent color (set from Settings) on boot. Only known
  // hex values are accepted so a corrupted localStorage entry can't inject CSS.
  useEffect(() => {
    const saved = localStorage.getItem('accentColor');
    if (saved && /^#[0-9a-f]{6}$/i.test(saved)) {
      document.documentElement.style.setProperty('--accent', saved);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ToastProvider>
          <EventToasts />
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<ProfilesPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/profile/:steamId" element={<DashboardPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/:steamId" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
