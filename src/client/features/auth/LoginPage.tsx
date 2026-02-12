import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Label } from '../../components/ui/label.tsx';
import { SteamGuardForm } from './SteamGuardForm.tsx';
import { useAuth } from './useAuth.ts';
import { Lock, User, Shield, LogIn } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, steamGuard, isLoggedIn } = useAuth();
  const [form, setForm] = useState({ username: '', password: '', sharedSecret: '' });
  const [needsSteamGuard, setNeedsSteamGuard] = useState(false);
  const [error, setError] = useState('');

  if (isLoggedIn) {
    navigate('/dashboard');
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const result = await login.mutateAsync({
        username: form.username,
        password: form.password,
        sharedSecret: form.sharedSecret || undefined,
      });

      if (result.needsSteamGuard) {
        setNeedsSteamGuard(true);
        setError(result.error || '');
      } else if (result.success) {
        navigate('/dashboard');
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
      await steamGuard.mutateAsync(code);
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{
      background: 'linear-gradient(135deg, #0E1419 0%, #1B2838 50%, #0E1419 100%)',
    }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-cs-orange to-cs-purple rounded-2xl flex items-center justify-center shadow-2xl">
            <Shield className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cs-orange to-cs-purple bg-clip-text text-transparent mb-2">
            CS2 Inventory Tracker
          </h1>
          <p className="text-gray-400">Connectez-vous avec votre compte Steam</p>
        </div>

        {needsSteamGuard ? (
          <SteamGuardForm
            onSubmit={handleSteamGuard}
            isLoading={steamGuard.isPending}
            error={error}
          />
        ) : (
          <Card className="bg-cs-surface/80 backdrop-blur-xl border-white/10 mb-4">
            <CardContent className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
                  <strong>Erreur: </strong>{error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4" /> Username Steam
                  </Label>
                  <Input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    required
                    autoComplete="username"
                    placeholder="Votre username Steam"
                  />
                </div>

                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <Lock className="w-4 h-4" /> Mot de passe
                  </Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    autoComplete="current-password"
                    placeholder="Votre mot de passe Steam"
                  />
                </div>

                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4" /> Shared Secret (2FA)
                  </Label>
                  <Input
                    type="password"
                    value={form.sharedSecret}
                    onChange={(e) => setForm({ ...form, sharedSecret: e.target.value })}
                    autoComplete="off"
                    placeholder="Optionnel - pour auto 2FA"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Laissez vide si vous entrez le code manuellement
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={login.isPending}
                  variant="gradient"
                  className="w-full"
                >
                  <LogIn className="w-5 h-5 mr-2" />
                  {login.isPending ? 'Connexion...' : 'Se connecter'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="bg-cs-surface/80 backdrop-blur-xl border-white/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-green-400 font-medium mb-1">Connexion securisee</p>
                <ul className="text-gray-400 text-xs space-y-1">
                  <li>Credentials chiffres AES-256-GCM en session</li>
                  <li>Aucun mot de passe sauvegarde sur le disque</li>
                  <li>Lecture seule de l'inventaire</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
