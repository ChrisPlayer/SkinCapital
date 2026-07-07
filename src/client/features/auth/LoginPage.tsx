import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { SteamGuardForm } from './SteamGuardForm.tsx';
import { useAuth } from './useAuth.ts';
import { useI18n } from '../../lib/i18n.tsx';
import { useProfiles } from '../../hooks/useApi.ts';
import { formatEur } from '../../lib/formatters.ts';
import { api } from '../../lib/api-client.ts';
import { Lock, User, Shield, LogIn, ArrowLeft } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, steamGuard } = useAuth();
  const { t } = useI18n();
  const { data: profiles } = useProfiles();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ username: '', password: '' });
  const [needsSteamGuard, setNeedsSteamGuard] = useState(false);
  const [canConfirmMobile, setCanConfirmMobile] = useState(false);
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
        setCanConfirmMobile(result.canConfirmMobile ?? false);
        setError('');
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

  // While waiting for Steam Guard, poll for a mobile-app approval (no code typed).
  // If the user approves on their phone, Steam confirms the session and we land
  // on the dashboard automatically. The code form stays available as a fallback.
  // Email/code-only Guard cannot be approved on mobile, so polling would be pointless.
  useEffect(() => {
    if (!needsSteamGuard || !canConfirmMobile) return;
    let active = true;
    const id = setInterval(async () => {
      try {
        const r = await api.auth.poll();
        if (active && r.success && r.profile) {
          clearInterval(id);
          queryClient.invalidateQueries({ queryKey: ['profiles'] });
          queryClient.invalidateQueries({ queryKey: ['auth-status'] });
          navigate(`/profile/${r.profile.steamId}`);
        }
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [needsSteamGuard, canConfirmMobile, navigate, queryClient]);

  const teaserProfile = profiles?.[0];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="grid-overlay" />

      <div className="relative z-10 w-full max-w-md md:max-w-4xl md:grid md:grid-cols-2 md:gap-12 md:items-center">
        {/* Teaser panel (md+ only): brand + "pick up where you left off" card */}
        <div className="hidden md:flex flex-col">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-sf-cyan/10 border border-sf-cyan/20 flex items-center justify-center shadow-[0_0_40px_rgba(0,204,255,0.15)]">
              <Shield className="w-9 h-9 text-sf-cyan" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">SkinCapital</h1>
              <span className="font-mono text-xs text-sf-dim">{t('auth.steamAuth')}</span>
            </div>
          </div>
          {teaserProfile && (
            <div className="sf-card p-6">
              <div className="nav-label mb-4">{t('login.teaser')}</div>
              <div className="flex items-center gap-3 mb-5">
                {teaserProfile.avatarUrl ? (
                  <img
                    src={teaserProfile.avatarUrl}
                    alt={teaserProfile.personaName || teaserProfile.username}
                    className="w-11 h-11 rounded-xl border border-sf-cyan/20 object-cover"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-sf-cyan/10 border border-sf-cyan/20 flex items-center justify-center font-display text-lg font-bold text-sf-cyan">
                    {(teaserProfile.personaName || teaserProfile.username).charAt(0).toUpperCase()}
                  </div>
                )}
                <p className="font-semibold text-white truncate min-w-0">
                  {teaserProfile.personaName || teaserProfile.username}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="nav-label mb-1">{t('profiles.value')}</div>
                  <p className="font-mono text-base font-bold text-sf-cyan">{formatEur(teaserProfile.totalValue)}</p>
                </div>
                <div>
                  <div className="nav-label mb-1">{t('profiles.items')}</div>
                  <p className="font-mono text-base font-bold">{teaserProfile.itemCount}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Form column (unchanged on mobile; brand hidden on md+ to avoid duplication) */}
        <div className="w-full max-w-md mx-auto">
        {/* Brand */}
        <div className="text-center mb-10 md:hidden">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-sf-cyan/10 border border-sf-cyan/20 flex items-center justify-center shadow-[0_0_40px_rgba(0,204,255,0.15)]">
            <Shield className="w-9 h-9 text-sf-cyan" />
          </div>
          <h1 className="font-display text-3xl font-bold mb-2">SkinCapital</h1>
          <span className="font-mono text-xs text-sf-dim">{t('auth.steamAuth')}</span>
        </div>

        {needsSteamGuard ? (
          <SteamGuardForm
            onSubmit={handleSteamGuard}
            isLoading={steamGuard.isPending}
            error={error}
            canConfirmMobile={canConfirmMobile}
          />
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
                className="w-full h-11 rounded-xl btn-accent font-semibold text-sm disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
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
    </div>
  );
}
