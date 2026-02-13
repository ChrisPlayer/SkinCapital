import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.tsx';
import { ChevronLeft } from 'lucide-react';

export function SettingsPage() {
  const { steamId } = useParams<{ steamId: string }>();
  const navigate = useNavigate();
  const { t, locale, setLocale, priceProvider, setPriceProvider } = useI18n();

  return (
    <div className="min-h-screen bg-[#050506]">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <button
          onClick={() => steamId ? navigate(`/profile/${steamId}`) : navigate('/')}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('settings.back')}
        </button>

        <h1 className="text-2xl font-bold mb-8">{t('settings.title')}</h1>

        {/* Language */}
        <div className="sf-card p-6 mb-4">
          <h2 className="text-sm font-semibold text-white mb-4">{t('settings.language')}</h2>
          <div className="flex gap-3">
            <button
              onClick={() => setLocale('fr')}
              className={`flex-1 py-3 rounded-xl text-sm transition-all ${locale === 'fr' ? 'bg-sf-cyan/15 text-sf-cyan border border-sf-cyan/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/[0.08]'}`}
            >
              {t('settings.french')}
            </button>
            <button
              onClick={() => setLocale('en')}
              className={`flex-1 py-3 rounded-xl text-sm transition-all ${locale === 'en' ? 'bg-sf-cyan/15 text-sf-cyan border border-sf-cyan/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/[0.08]'}`}
            >
              {t('settings.english')}
            </button>
          </div>
        </div>

        {/* Price Provider */}
        <div className="sf-card p-6 mb-4">
          <h2 className="text-sm font-semibold text-white mb-1">{t('settings.priceProvider')}</h2>
          <p className="text-xs text-gray-500 mb-4">{t('settings.steamFeesDesc')}</p>
          <div className="flex gap-3">
            <button
              onClick={() => setPriceProvider('steam')}
              className={`flex-1 py-3 rounded-xl text-sm transition-all ${priceProvider === 'steam' ? 'bg-sf-cyan/15 text-sf-cyan border border-sf-cyan/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/[0.08]'}`}
            >
              {t('settings.steam')}
            </button>
            <button
              onClick={() => setPriceProvider('steam_fees')}
              className={`flex-1 py-3 rounded-xl text-sm transition-all ${priceProvider === 'steam_fees' ? 'bg-sf-cyan/15 text-sf-cyan border border-sf-cyan/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/[0.08]'}`}
            >
              {t('settings.steamFees')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
