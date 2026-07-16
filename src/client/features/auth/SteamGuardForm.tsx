import { useState } from 'react';
import { KeyRound, Smartphone, Loader2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n.tsx';

interface SteamGuardFormProps {
  onSubmit: (code: string) => void;
  isLoading: boolean;
  error?: string;
  canConfirmMobile?: boolean;
}

export function SteamGuardForm({ onSubmit, isLoading, error, canConfirmMobile }: SteamGuardFormProps) {
  const [code, setCode] = useState('');
  const { t } = useI18n();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) onSubmit(code.trim());
  };

  return (
    <div className="sf-card p-6 mb-4">
      <div className="text-center mb-5">
        <div className="w-12 h-12 mx-auto mb-3 bg-sf-cyan/10 border border-sf-cyan/20 rounded-full flex items-center justify-center">
          {canConfirmMobile ? <Smartphone className="w-6 h-6 text-sf-cyan" /> : <KeyRound className="w-6 h-6 text-sf-cyan" />}
        </div>
        <h3 className="font-semibold text-lg">{t('auth.steamGuardRequired')}</h3>
        <span className="font-mono text-xs text-sf-dim">{t('auth.enter2fa')}</span>
      </div>

      {/* Mobile approval is the primary path: keep polling while it shows. */}
      {canConfirmMobile && (
        <div className="mb-4 p-4 rounded-xl bg-sf-cyan/10 border border-sf-cyan/20">
          <div className="flex items-center gap-3 text-sf-cyan">
            <Loader2 className="w-5 h-5 animate-spin shrink-0" />
            <div className="text-left">
              <p className="text-sm font-semibold leading-tight">{t('auth.confirmMobile')}</p>
              <p className="text-xs text-sf-dim mt-0.5">{t('auth.mobileWaiting')}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-sf-pink/10 border border-sf-pink/20 text-sf-pink text-sm font-mono">
          {error}
        </div>
      )}

      {canConfirmMobile && (
        <p className="text-center text-xs text-sf-dim mb-3">{t('auth.codeFallback')}</p>
      )}

      <form onSubmit={handleSubmit}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={5}
          autoFocus
          autoComplete="one-time-code"
          aria-label={t('auth.enter2fa')}
          className="w-full h-14 text-center text-2xl tracking-[0.3em] font-mono uppercase bg-sf-body border border-white/[0.08] rounded-xl text-white placeholder:text-sf-dim focus:outline-none focus:border-sf-cyan/40 mb-4"
          placeholder="XXXXX"
        />
        <button
          type="submit"
          disabled={isLoading || !code.trim()}
          className="w-full h-11 rounded-xl btn-accent font-semibold text-sm disabled:opacity-50 disabled:pointer-events-none"
        >
          {isLoading ? t('auth.validating') : t('auth.validate')}
        </button>
      </form>
    </div>
  );
}
