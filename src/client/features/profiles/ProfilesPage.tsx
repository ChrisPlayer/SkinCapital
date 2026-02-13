import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { useProfiles } from '../../hooks/useApi.ts';
import { formatEur, formatDate } from '../../lib/formatters.ts';
import { Plus, LogIn, Shield, Package } from 'lucide-react';

export function ProfilesPage() {
  const navigate = useNavigate();
  const { data: profiles, isLoading } = useProfiles();

  return (
    <div className="min-h-screen text-gray-100" style={{
      background: '#0f1218',
      backgroundImage: 'radial-gradient(at 0% 0%, rgba(136, 71, 255, 0.15) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(222, 155, 53, 0.1) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(211, 44, 230, 0.1) 0px, transparent 50%)',
      backgroundAttachment: 'fixed',
    }}>
      {/* Header */}
      <header className="glass-card border-b border-white/5 shadow-2xl">
        <div className="max-w-[1200px] mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-cs-orange to-cs-purple rounded-xl flex items-center justify-center shadow-lg">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-cs-orange to-cs-pink bg-clip-text text-transparent tracking-tight">
                CS2 Inventory Tracker
              </h1>
              <p className="text-xs text-gray-500">Suivi d'inventaire multi-comptes</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Vos profils</h2>
            <p className="text-sm text-gray-500 mt-1">
              Selectionnez un profil ou ajoutez un nouveau compte Steam
            </p>
          </div>
          <Button variant="gradient" onClick={() => navigate('/login')}>
            <Plus className="w-4 h-4 mr-2" />
            Ajouter un compte
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : profiles && profiles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((profile) => (
              <div
                key={profile.steamId}
                onClick={() => navigate(`/profile/${profile.steamId}`)}
                className="glass-card rounded-2xl p-5 cursor-pointer transition-all duration-200 hover:translate-y-[-2px] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] hover:border-cs-orange/30 group"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cs-orange to-cs-purple flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    {profile.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate group-hover:text-cs-orange transition-colors">
                      {profile.username}
                    </p>
                    <p className="text-[10px] text-gray-600 font-mono">{profile.steamId}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Items</p>
                    <p className="text-lg font-bold text-white">{profile.itemCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Valeur</p>
                    <p className="text-lg font-bold text-cs-orange">{formatEur(profile.totalValue)}</p>
                  </div>
                </div>

                <p className="text-[10px] text-gray-600">
                  {profile.lastRefresh
                    ? `Mis a jour le ${formatDate(profile.lastRefresh)}`
                    : 'Jamais synchronise'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-12 text-center">
            <Package className="w-16 h-16 mx-auto text-gray-600 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Aucun profil</h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Connectez-vous avec votre compte Steam pour commencer a suivre votre inventaire CS2
            </p>
            <Button variant="gradient" onClick={() => navigate('/login')}>
              <LogIn className="w-4 h-4 mr-2" />
              Se connecter
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
