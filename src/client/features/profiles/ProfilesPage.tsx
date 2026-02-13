import { useNavigate } from 'react-router-dom';
import { useProfiles } from '../../hooks/useApi.ts';
import { formatEur, formatDate } from '../../lib/formatters.ts';
import { Plus, LogIn, Package, Loader2 } from 'lucide-react';

export function ProfilesPage() {
  const navigate = useNavigate();
  const { data: profiles, isLoading } = useProfiles();

  return (
    <div className="min-h-screen bg-sf-body relative">
      {/* Grid overlay */}
      <div className="grid-overlay" />

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 rounded-full bg-sf-cyan shadow-[0_0_10px_#00ccff]" />
            <span className="font-display text-2xl font-bold">SkinCapital</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sf-cyan text-black font-semibold text-sm hover:bg-sf-cyan/90 transition-colors shadow-[0_0_20px_rgba(0,204,255,0.3)]"
          >
            <Plus className="w-4 h-4" />
            Ajouter un compte
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="font-display text-2xl font-bold mb-1">Vos profils</h2>
          <span className="font-mono text-xs text-sf-dim">SELECT_PROFILE // MULTI_ACCOUNT_SYSTEM</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-sf-cyan" />
          </div>
        ) : profiles && profiles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((profile) => (
              <div
                key={profile.steamId}
                onClick={() => navigate(`/profile/${profile.steamId}`)}
                className="sf-card sf-card-hover p-6 cursor-pointer group"
              >
                <div className="flex items-center gap-3 mb-5">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.personaName || profile.username}
                      className="w-11 h-11 rounded-xl border border-sf-cyan/20 object-cover"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-sf-cyan/10 border border-sf-cyan/20 flex items-center justify-center font-display text-lg font-bold text-sf-cyan">
                      {(profile.personaName || profile.username).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate group-hover:text-sf-cyan transition-colors">
                      {profile.personaName || profile.username}
                    </p>
                    <p className="text-[10px] text-sf-dim font-mono">{profile.username}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="nav-label mb-1">Items</div>
                    <p className="font-mono text-base font-bold">{profile.itemCount}</p>
                  </div>
                  <div>
                    <div className="nav-label mb-1">Valeur</div>
                    <p className="font-mono text-base font-bold text-sf-cyan">{formatEur(profile.totalValue)}</p>
                  </div>
                </div>

                <div className="font-mono text-[10px] text-sf-dim">
                  {profile.lastRefresh
                    ? `LAST_SYNC // ${formatDate(profile.lastRefresh)}`
                    : 'NEVER_SYNCED'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sf-card p-16 text-center max-w-md mx-auto">
            <Package className="w-14 h-14 mx-auto text-sf-dim mb-5" />
            <h3 className="font-display text-xl font-bold mb-2">Aucun profil</h3>
            <p className="text-sm text-sf-secondary mb-6">
              Connectez-vous avec votre compte Steam pour commencer le suivi de votre inventaire CS2.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sf-cyan text-black font-semibold text-sm hover:bg-sf-cyan/90 transition-colors shadow-[0_0_20px_rgba(0,204,255,0.3)]"
            >
              <LogIn className="w-4 h-4" />
              Se connecter
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
