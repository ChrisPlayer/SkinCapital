import { useState } from 'react';
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
    <div className="sf-card p-6 mb-4">
      <div className="text-center mb-5">
        <div className="w-12 h-12 mx-auto mb-3 bg-sf-cyan/10 border border-sf-cyan/20 rounded-full flex items-center justify-center">
          <KeyRound className="w-6 h-6 text-sf-cyan" />
        </div>
        <h3 className="font-semibold text-lg">Code Steam Guard requis</h3>
        <span className="font-mono text-xs text-sf-dim">ENTER_2FA_CODE</span>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-sf-pink/10 border border-sf-pink/20 text-sf-pink text-sm font-mono">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={5}
          autoFocus
          className="w-full h-14 text-center text-2xl tracking-[0.3em] font-mono uppercase bg-sf-body border border-white/[0.08] rounded-xl text-white placeholder:text-sf-dim focus:outline-none focus:border-sf-cyan/40 mb-4"
          placeholder="XXXXX"
        />
        <button
          type="submit"
          disabled={isLoading || !code.trim()}
          className="w-full h-11 rounded-xl bg-sf-cyan text-black font-semibold text-sm hover:bg-sf-cyan/90 transition-colors shadow-[0_0_20px_rgba(0,204,255,0.3)] disabled:opacity-50 disabled:pointer-events-none"
        >
          {isLoading ? 'Validation...' : 'Valider'}
        </button>
      </form>
    </div>
  );
}
