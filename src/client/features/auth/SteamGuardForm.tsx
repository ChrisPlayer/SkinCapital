import { useState } from 'react';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Button } from '../../components/ui/button.tsx';
import { KeyRound } from 'lucide-react';

interface SteamGuardFormProps {
  onSubmit: (code: string) => void;
  isLoading: boolean;
  error?: string;
}

export function SteamGuardForm({ onSubmit, isLoading, error }: SteamGuardFormProps) {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) onSubmit(code.trim());
  };

  return (
    <Card className="bg-cs-surface/80 backdrop-blur-xl border-white/10">
      <CardContent className="p-6">
        <div className="text-center mb-4">
          <div className="w-12 h-12 mx-auto mb-3 bg-cs-orange/20 rounded-full flex items-center justify-center">
            <KeyRound className="w-6 h-6 text-cs-orange" />
          </div>
          <h3 className="font-semibold text-lg text-white">Code Steam Guard requis</h3>
          <p className="text-sm text-gray-400">Entrez le code depuis votre app Steam</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={5}
            autoFocus
            className="text-center text-2xl tracking-widest font-mono uppercase py-4 mb-4"
            placeholder="XXXXX"
          />
          <Button type="submit" disabled={isLoading || !code.trim()} className="w-full" variant="gradient">
            {isLoading ? 'Validation...' : 'Valider'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
