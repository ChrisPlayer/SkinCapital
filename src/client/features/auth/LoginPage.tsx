import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SteamGuardForm } from './SteamGuardForm.tsx';
import { useAuth } from './useAuth.ts';
import { useI18n } from '../../lib/i18n.tsx';
import { Lock, User, Shield, LogIn, ArrowLeft } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, steamGuard } = useAuth();
  const { t } = useI18n();
  const [form, setForm] = useState({ username: '', password: '' });
  const [needsSteamGuard, setNeedsSteamGuard] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const result = await login.mutateAsync({
        username: form.username,
        password: form.password,
      });
      if (result.needsSteamGuard) {
        setNeedsSteamGuard(true);
        setError(result.error || '');
      } else if (result.success && result.profile) {
        navigate(`/profile/${result.profile.steamId}`);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSteamGuard = async (code: string) => {
    setError('');
    try {
      const result = await steamGuard.mutateAsync(code);
      if (result.profile) {
        navigate(`/profile/${result.profile.steamId}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-sf-body flex items-center justify-center p-4 relative">
      <div className="grid-overlay" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-sf-cyan/10 border border-sf-cyan/20 flex items-center justify-center shadow-[0_0_40px_rgba(0,204,255,0.15)]">
            <Shield className="w-9 h-9 text-sf-cyan" />
          </div>
          <h1 className="font-display text-3xl font-bold mb-2">SkinCapital</h1>
          <span className="font-mono text-xs text-sf-dim">{t('auth.steamAuth')}</span>
        </div>

        {needsSteamGuard ? (
          <SteamGuardForm onSubmit={handleSteamGuard} isLoading={steamGuard.isPending} error={error} />
        ) : (
          <div className="sf-card p-6 mb-4">
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-sf-pink/10 border border-sf-pink/20 text-sf-pink text-sm font-mono">
                <strong>ERR: </strong>{error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="flex items-center gap-2 mb-2 text-sm text-sf-secondary">
                  <User className="w-4 h-4" /> {t('auth.username')}
                </label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  autoComplete="username"
                  placeholder={t('auth.usernamePlaceholder')}
                  className="w-full h-10 px-4 rounded-xl bg-sf-body border border-white/[0.08] text-sm text-white placeholder:text-sf-dim focus:outline-none focus:border-sf-cyan/40 transition-colors"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 mb-2 text-sm text-sf-secondary">
                  <Lock className="w-4 h-4" /> {t('auth.password')}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  autoComplete="current-password"
                  placeholder={t('auth.passwordPlaceholder')}
                  className="w-full h-10 px-4 rounded-xl bg-sf-body border border-white/[0.08] text-sm text-white placeholder:text-sf-dim focus:outline-none focus:border-sf-cyan/40 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={login.isPending}
                className="w-full h-11 rounded-xl bg-sf-cyan text-black font-semibold text-sm hover:bg-sf-cyan/90 transition-colors shadow-[0_0_20px_rgba(0,204,255,0.3)] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                {login.isPending ? t('auth.connecting') : t('auth.login')}
              </button>
            </form>
          </div>
        )}

        <button
          onClick={() => navigate('/')}
          className="w-full py-2.5 rounded-xl text-sf-dim hover:text-white transition-colors text-sm flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('auth.backToProfiles')}
        </button>
      </div>
    </div>
  );
}
