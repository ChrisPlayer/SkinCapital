import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n, type TranslationKey } from '../../lib/i18n.tsx';
import {
  usePricingSettings,
  useSetPricingSettings,
  useResetPricingSettings,
  useTestProxy,
  useSchedule,
  useSetSchedule,
  useRunScheduleNow,
  useBackupSettings,
  useSetBackupSettings,
  useRunBackup,
  useTrackedSources,
  useSetTrackedSources,
} from '../../hooks/useApi.ts';
import { api } from '../../lib/api-client.ts';
import { formatDate } from '../../lib/formatters.ts';
import { useToast } from '../../components/toast.tsx';
import { PillButton } from '../../components/controls.tsx';
import { SettingsSection } from './SettingsSection.tsx';
import { ChevronLeft, Check, Loader2, Play, RotateCcw, Download, Save } from 'lucide-react';

type PricingMode = 'auto' | 'proxy' | 'direct';
type Source = 'steam' | 'csfloat' | 'skinport';

// Accent swatches: cyan (default), violet, gold. Applied via the --accent CSS
// variable (partial theming: Tailwind sf-cyan classes intentionally stay cyan).
const ACCENT_COLORS = ['#00ccff', '#a855f7', '#f0b90b'] as const;
const DEFAULT_ACCENT = ACCENT_COLORS[0];

const TRACKABLE_SOURCES: Array<{ id: Source; labelKey: TranslationKey }> = [
  { id: 'steam', labelKey: 'settings.steam' },
  { id: 'csfloat', labelKey: 'settings.csfloat' },
  { id: 'skinport', labelKey: 'settings.skinport' },
];

function getInitialAccent(): string {
  const stored = localStorage.getItem('accentColor');
  return stored && (ACCENT_COLORS as readonly string[]).includes(stored) ? stored : DEFAULT_ACCENT;
}

export function SettingsPage() {
  const { steamId } = useParams<{ steamId: string }>();
  const navigate = useNavigate();
  const { t, locale, setLocale, priceProvider, setPriceProvider } = useI18n();
  const toast = useToast();

  const { data: pricing } = usePricingSettings();
  const savePricing = useSetPricingSettings();
  const resetPricing = useResetPricingSettings();
  const testProxy = useTestProxy();
  const [mode, setMode] = useState<PricingMode>('auto');
  const [newProxies, setNewProxies] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const savedFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [accent, setAccent] = useState(getInitialAccent);

  // Tracked price sources (daily reload; 2+ sources unlock the comparator tab).
  const { data: trackedData } = useTrackedSources();
  const setTracked = useSetTrackedSources();
  const trackedSources = trackedData?.sources ?? ['steam'];

  const toggleSource = (source: Source) => {
    if (source === 'steam') return; // mandatory: the app's summaries are steam-based
    const next = trackedSources.includes(source)
      ? trackedSources.filter((s) => s !== source)
      : [...trackedSources, source];
    setTracked.mutate(next, {
      onSuccess: () => toast.success(t('toast.settingsSaved')),
      onError: (err) => toast.error((err as Error).message),
    });
  };

  // Daily automatic price reload (prices only — no Steam login involved).
  const { data: schedule } = useSchedule();
  const saveSchedule = useSetSchedule();
  const runNow = useRunScheduleNow();
  const [schedEnabled, setSchedEnabled] = useState(true);
  const [schedTime, setSchedTime] = useState('12:00');

  useEffect(() => {
    if (schedule) {
      setSchedEnabled(schedule.enabled);
      setSchedTime(
        `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`,
      );
    }
  }, [schedule]);

  const handleSaveSchedule = () => {
    const [h, m] = schedTime.split(':').map((v) => parseInt(v, 10));
    if (!Number.isInteger(h) || !Number.isInteger(m)) return;
    saveSchedule.mutate(
      { enabled: schedEnabled, hour: h, minute: m },
      {
        onSuccess: () => toast.success(t('toast.scheduleSaved')),
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  const handleRunNow = () => {
    runNow.mutate(undefined, {
      onSuccess: (result) => {
        if (result.started) toast.success(t('toast.runStarted'));
        else toast.error(t('toast.runAlready'));
      },
      onError: (err) => toast.error((err as Error).message),
    });
  };

  // Automatic backup (anti data-loss).
  const { data: backup } = useBackupSettings();
  const saveBackup = useSetBackupSettings();
  const runBackup = useRunBackup();

  const handleToggleBackup = () => {
    if (!backup) return;
    saveBackup.mutate(
      { enabled: !backup.enabled },
      { onError: (err) => toast.error((err as Error).message) },
    );
  };

  const handleRunBackup = () => {
    runBackup.mutate(undefined, {
      onSuccess: (result) => {
        if (result.ran) toast.success(t('toast.backupDone'));
        else toast.error(t('toast.backupRunning'));
      },
      onError: (err) => toast.error((err as Error).message || t('toast.backupFailed')),
    });
  };

  const applyAccent = (hex: string) => {
    setAccent(hex);
    localStorage.setItem('accentColor', hex);
    document.documentElement.style.setProperty('--accent', hex);
  };

  useEffect(() => {
    if (pricing) setMode(pricing.mode);
  }, [pricing]);

  // Clear the saved-flash timer on unmount so it never fires on an unmounted component.
  useEffect(() => () => {
    if (savedFlashTimeoutRef.current) clearTimeout(savedFlashTimeoutRef.current);
  }, []);

  const pricingError = savePricing.error?.message || resetPricing.error?.message || null;

  const handleSavePricing = () => {
    savePricing.mutate(
      { mode, proxies: newProxies.trim() || undefined },
      {
        onSuccess: () => {
          setNewProxies('');
          setSavedFlash(true);
          if (savedFlashTimeoutRef.current) clearTimeout(savedFlashTimeoutRef.current);
          savedFlashTimeoutRef.current = setTimeout(() => setSavedFlash(false), 2000);
          toast.success(t('toast.settingsSaved'));
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  const handleResetPricing = () => {
    resetPricing.mutate(undefined, {
      onSuccess: () => toast.success(t('toast.settingsReset')),
      onError: (err) => toast.error((err as Error).message),
    });
  };

  const handleTest = () => {
    const first = newProxies.split(/[\n,]/).map((s) => s.trim()).find(Boolean);
    if (first) {
      testProxy.mutate(first, {
        onSuccess: (result) => {
          if (result.ok) toast.success(`${t('toast.proxyOk')} (${result.ip})`);
          else toast.error(result.error || t('toast.proxyFail'));
        },
        onError: (err) => toast.error((err as Error).message || t('toast.proxyFail')),
      });
    }
  };

  const modeButton = (value: PricingMode, label: string) => (
    <PillButton active={mode === value} onClick={() => setMode(value)}>
      {label}
    </PillButton>
  );

  const groups: Array<{ id: string; labelKey: TranslationKey }> = [
    { id: 'appearance', labelKey: 'settings.sectionAppearance' },
    { id: 'pricing', labelKey: 'settings.sectionPricing' },
    { id: 'automation', labelKey: 'settings.sectionAutomation' },
    { id: 'data', labelKey: 'settings.sectionData' },
  ];

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <button
          onClick={() => (steamId ? navigate(`/profile/${steamId}`) : navigate('/'))}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('settings.back')}
        </button>

        <h1 className="font-display tracking-tight text-2xl font-bold mb-8">{t('settings.title')}</h1>

        <div className="lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-10 lg:items-start">
          {/* Anchor nav (desktop only) */}
          <nav className="hidden lg:block sticky top-12 space-y-1" aria-label={t('settings.title')}>
            {groups.map((g) => (
              <a
                key={g.id}
                href={`#${g.id}`}
                className="block px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/[0.04] transition-colors"
              >
                {t(g.labelKey)}
              </a>
            ))}
          </nav>

          <div className="space-y-10">
            {/* ── Appearance ── */}
            <div className="space-y-4">
              <span className="nav-label block" id="appearance">{t('settings.sectionAppearance')}</span>
              <SettingsSection id="language" title={t('settings.language')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                  <PillButton active={locale === 'fr'} onClick={() => setLocale('fr')}>
                    {t('settings.french')}
                  </PillButton>
                  <PillButton active={locale === 'en'} onClick={() => setLocale('en')}>
                    {t('settings.english')}
                  </PillButton>
                </div>
              </SettingsSection>

              <SettingsSection id="accent" title={t('settings.accent')}>
                <div className="flex items-center gap-3">
                  {ACCENT_COLORS.map((hex) => (
                    <button
                      key={hex}
                      onClick={() => applyAccent(hex)}
                      aria-label={`${t('settings.accent')} ${hex}`}
                      aria-pressed={accent === hex}
                      className={`w-9 h-9 rounded-full border-2 transition-all ${
                        accent === hex ? 'border-white scale-110' : 'border-white/20 hover:border-white/50'
                      }`}
                      style={{ background: hex }}
                    />
                  ))}
                </div>
              </SettingsSection>
            </div>

            {/* ── Pricing ── */}
            <div className="space-y-4">
              <span className="nav-label block" id="pricing">{t('settings.sectionPricing')}</span>
              <SettingsSection
                id="price-provider"
                title={t('settings.priceProvider')}
                description={t('settings.steamFeesDesc')}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <PillButton active={priceProvider === 'steam'} onClick={() => setPriceProvider('steam')}>{t('settings.steam')}</PillButton>
                  <PillButton active={priceProvider === 'steam_fees'} onClick={() => setPriceProvider('steam_fees')}>{t('settings.steamFees')}</PillButton>
                  <PillButton active={priceProvider === 'csfloat'} onClick={() => setPriceProvider('csfloat')}>{t('settings.csfloat')}</PillButton>
                  <PillButton active={priceProvider === 'skinport'} onClick={() => setPriceProvider('skinport')}>{t('settings.skinport')}</PillButton>
                </div>
              </SettingsSection>

              <SettingsSection
                id="tracked-sources"
                title={t('settings.trackedSources')}
                description={t('settings.trackedSourcesDesc')}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {TRACKABLE_SOURCES.map(({ id, labelKey }) => (
                    <PillButton
                      key={id}
                      active={trackedSources.includes(id)}
                      onClick={() => toggleSource(id)}
                      disabled={id === 'steam' || setTracked.isPending}
                    >
                      {trackedSources.includes(id) && <Check className="w-3.5 h-3.5" />}
                      {t(labelKey)}
                    </PillButton>
                  ))}
                </div>
              </SettingsSection>

              <SettingsSection
                id="pricing-method"
                title={t('settings.pricingMethod')}
                description={t('settings.pricingMethodDesc')}
                headerRight={pricing && (
                  <span className="text-[11px] font-mono text-gray-500">
                    {t('settings.activeMode')}: <span className="text-[color:var(--accent)]">{pricing.resolvedMode}</span>
                  </span>
                )}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
                  {modeButton('auto', t('settings.modeAuto'))}
                  {modeButton('proxy', t('settings.modeProxy'))}
                  {modeButton('direct', t('settings.modeDirect'))}
                </div>
                <p className="text-[11px] text-gray-500 mb-4">{t('settings.modeAutoHint')}</p>

                <div className="mb-3">
                  <div className="text-xs text-gray-400 mb-1">{t('settings.proxiesCurrent')}</div>
                  {pricing && pricing.proxiesMasked.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {pricing.proxiesMasked.map((p, i) => (
                        <span key={i} className="px-2 py-1 rounded-md bg-white/5 border border-white/[0.08] text-[11px] font-mono text-gray-300">{p}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-gray-600">{t('settings.proxiesNone')}</span>
                  )}
                </div>

                <label className="block text-xs font-medium text-gray-400 mb-2">{t('settings.proxiesNew')}</label>
                <textarea
                  value={newProxies}
                  onChange={(e) => setNewProxies(e.target.value)}
                  spellCheck={false}
                  rows={3}
                  placeholder="host:port:user:pass"
                  className="w-full bg-white/5 border border-white/[0.08] rounded-xl p-3 text-xs text-white font-mono resize-y focus:outline-none focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
                />
                <p className="text-[11px] text-gray-500 mt-2 mb-3">{t('settings.proxiesHint')}</p>

                {testProxy.data && (
                  <div className={`text-xs mb-3 ${testProxy.data.ok ? 'text-sf-green' : 'text-red-400'}`}>
                    {testProxy.data.ok ? `✓ IP: ${testProxy.data.ip}` : `✗ ${testProxy.data.error}`}
                  </div>
                )}
                {pricingError && <div className="text-xs text-red-400 mb-3">{pricingError}</div>}

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSavePricing}
                    disabled={savePricing.isPending}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl btn-accent font-semibold text-sm disabled:opacity-60"
                  >
                    {savePricing.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : savedFlash ? <Check className="w-4 h-4" /> : null}
                    {savedFlash ? t('settings.saved') : t('settings.save')}
                  </button>
                  <button
                    onClick={handleTest}
                    disabled={testProxy.isPending || !newProxies.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-gray-300 hover:text-white disabled:opacity-50"
                  >
                    {testProxy.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {testProxy.isPending ? t('settings.testing') : t('settings.test')}
                  </button>
                  <button
                    onClick={handleResetPricing}
                    disabled={resetPricing.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-gray-400 hover:text-white disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {t('settings.reset')}
                  </button>
                </div>
              </SettingsSection>
            </div>

            {/* ── Automation ── */}
            <div className="space-y-4">
              <span className="nav-label block" id="automation">{t('settings.sectionAutomation')}</span>
              <SettingsSection
                id="auto-prices"
                title={t('settings.autoPrices')}
                description={t('settings.autoPricesDesc')}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <PillButton active={schedEnabled} onClick={() => setSchedEnabled(!schedEnabled)}>
                    {schedEnabled ? t('settings.autoPricesOn') : t('settings.autoPricesOff')}
                  </PillButton>
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    disabled={!schedEnabled}
                    aria-label={t('settings.autoPrices')}
                    className="h-10 px-3 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white font-mono focus:outline-none focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] disabled:opacity-50 [color-scheme:dark]"
                  />
                  <button
                    onClick={handleSaveSchedule}
                    disabled={saveSchedule.isPending}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl btn-accent font-semibold text-sm disabled:opacity-60"
                  >
                    {saveSchedule.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {t('settings.save')}
                  </button>
                  <button
                    onClick={handleRunNow}
                    disabled={runNow.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-gray-300 hover:text-white disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {t('settings.runNow')}
                  </button>
                </div>
              </SettingsSection>
            </div>

            {/* ── Data ── */}
            <div className="space-y-4">
              <span className="nav-label block" id="data">{t('settings.sectionData')}</span>
              <SettingsSection
                id="backup"
                title={t('settings.backup')}
                description={t('settings.backupDesc')}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <PillButton active={backup?.enabled ?? false} onClick={handleToggleBackup} disabled={!backup || saveBackup.isPending}>
                    {backup?.enabled ? t('settings.autoPricesOn') : t('settings.autoPricesOff')}
                  </PillButton>
                  <button
                    onClick={handleRunBackup}
                    disabled={runBackup.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-gray-300 hover:text-white disabled:opacity-50"
                  >
                    {runBackup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {t('settings.backupNow')}
                  </button>
                  <a
                    href={api.settings.backupDownloadUrl()}
                    download
                    aria-disabled={!backup?.lastBackup}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-gray-300 hover:text-white ${
                      backup?.lastBackup ? '' : 'pointer-events-none opacity-50'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('settings.backupDownload')}
                  </a>
                </div>
                <p className="text-[11px] text-gray-500 mt-3">
                  {backup?.lastBackup
                    ? `${t('settings.backupLast')}: ${formatDate(backup.lastBackup.when, locale)} · ${backup.count} ${t('settings.backupCount')}`
                    : t('settings.backupNone')}
                </p>
              </SettingsSection>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
