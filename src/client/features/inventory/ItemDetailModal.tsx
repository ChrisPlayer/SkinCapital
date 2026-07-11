import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
import {
  useItemPrice,
  useSetPurchase,
  useRemovePurchase,
  useAlerts,
  useCreateAlert,
  useDeleteAlert,
} from '../../hooks/useApi.ts';
import { useI18n, applyFees, type TranslationKey } from '../../lib/i18n.tsx';
import { formatEur, formatPercent } from '../../lib/formatters.ts';
import { getDisplayItemName } from '../../lib/item-display.ts';
import { useToast } from '../../components/toast.tsx';
import { ExternalLink, X } from 'lucide-react';
import { detectPatterns, type PatternTier } from '../../../shared/lib/patterns.ts';
import type { ItemGroup } from '../../../shared/types/inventory.ts';

// Tier → badge colors (brand tokens): gold, accent-cyan, pink, subtle neutral.
const PATTERN_TIER_STYLE: Record<PatternTier, { bg: string; color: string; border: string }> = {
  gold: { bg: '#f0b90b1f', color: '#f0b90b', border: '#f0b90b40' },
  cyan: { bg: 'rgba(0,204,255,0.12)', color: 'var(--accent)', border: 'rgba(0,204,255,0.30)' },
  pink: { bg: '#ff33661f', color: '#ff3366', border: '#ff336640' },
  neutral: { bg: 'rgba(255,255,255,0.06)', color: '#d1d5db', border: 'rgba(255,255,255,0.12)' },
};

interface ItemDetailModalProps {
  item: ItemGroup | null;
  steamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parsePriceInput(raw: string): number | null {
  const value = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

const SPARK_W = 280;
const SPARK_H = 48;

// Mirrors the y-normalization of DashboardPage's chartPath (~6% vertical padding).
function sparklinePath(points: Array<{ date: string; price: number }>): { line: string; fill: string } {
  const vals = points.map((p) => p.price);
  const mn = Math.min(...vals);
  const rng = (Math.max(...vals) - mn) || 1;
  const line = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * SPARK_W;
      const y = SPARK_H - ((p.price - mn) / rng) * SPARK_H * 0.88 - SPARK_H * 0.06;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return { line, fill: `${line} L${SPARK_W},${SPARK_H} L0,${SPARK_H} Z` };
}

export function ItemDetailModal({ item, steamId, open, onOpenChange }: ItemDetailModalProps) {
  const { t, priceProvider } = useI18n();
  const toast = useToast();
  const priceSource = priceProvider === 'csfloat' ? 'csfloat' : priceProvider === 'skinport' ? 'skinport' : 'steam';
  const { data: priceData, isLoading, isError } = useItemPrice(item?.marketHashName ?? '', priceSource);
  const setPurchaseMutation = useSetPurchase();
  const removePurchaseMutation = useRemovePurchase();
  const { data: alerts } = useAlerts(steamId);
  const createAlertMutation = useCreateAlert();
  const deleteAlertMutation = useDeleteAlert();

  const [buyPriceInput, setBuyPriceInput] = useState('');
  const [alertDirection, setAlertDirection] = useState<'above' | 'below'>('below');
  const [alertThresholdInput, setAlertThresholdInput] = useState('');

  const itemName = item?.marketHashName ?? null;
  const itemBuyPrice = item?.buyPrice ?? null;
  useEffect(() => {
    setBuyPriceInput(itemBuyPrice != null ? String(itemBuyPrice) : '');
    setAlertThresholdInput('');
  }, [itemName, itemBuyPrice]);

  if (!item) return null;

  const history = priceData?.history ?? [];
  const spark = history.length >= 2 ? sparklinePath(history) : null;
  const sparkUp = history.length >= 2 && history[history.length - 1].price >= history[0].price;
  const sparkColor = sparkUp ? '#4ADE80' : '#ff3366';
  const sparkMin = spark ? Math.min(...history.map((p) => p.price)) : null;
  const sparkMax = spark ? Math.max(...history.map((p) => p.price)) : null;
  // The list and the Steam price box deduct fees in "Steam (- fees)" mode; keep min/max consistent.
  const sparkFeeProvider = priceSource === 'steam' ? priceProvider : undefined;

  // Shared P&L basis: net-of-fees in steam_fees mode, stickers included
  // (item.total already carries stickerValue; applyFees is a no-op otherwise).
  const marketValue = applyFees(item.total, priceProvider);
  const invested = item.buyPrice != null ? item.buyPrice * item.quantity : null;
  const pnl = invested !== null && marketValue !== null ? marketValue - invested : null;
  const pnlPercent = pnl !== null && invested ? (pnl / invested) * 100 : null;

  const itemAlerts = (alerts ?? []).filter((a) => a.marketHashName === item.marketHashName);

  const handleSaveBuyPrice = () => {
    const value = parsePriceInput(buyPriceInput);
    if (value === null) return;
    setPurchaseMutation.mutate(
      { steamId, marketHashName: item.marketHashName, buyPriceEur: value },
      {
        onSuccess: () => toast.success(t('toast.buyPriceSaved')),
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  const handleClearBuyPrice = () => {
    setBuyPriceInput('');
    removePurchaseMutation.mutate(
      { steamId, marketHashName: item.marketHashName },
      {
        onSuccess: () => toast.success(t('toast.buyPriceCleared')),
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  const handleCreateAlert = () => {
    const threshold = parsePriceInput(alertThresholdInput);
    if (threshold === null) return;
    createAlertMutation.mutate(
      { steamId, marketHashName: item.marketHashName, direction: alertDirection, thresholdEur: threshold },
      {
        onSuccess: () => {
          setAlertThresholdInput('');
          toast.success(t('toast.alertCreated'));
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  const handleDeleteAlert = (id: number) => {
    deleteAlertMutation.mutate(
      { id, steamId },
      {
        onSuccess: () => toast.success(t('toast.alertDeleted')),
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  const safeName = encodeURIComponent(item.marketHashName);
  const displayName = getDisplayItemName(item.marketHashName, item.wear?.name);
  const patternTags = detectPatterns({
    marketHashName: item.marketHashName,
    floatValue: item.floatValue,
    paintSeed: item.paintSeed,
  });
  const links = [
    {
      label: 'Steam Market',
      href: `https://steamcommunity.com/market/listings/730/${safeName}`,
      bg: 'bg-[#1b2838] hover:bg-[#2a475e]',
      icon: 'S',
    },
    {
      label: 'Skinport',
      href: `https://skinport.com/market?search=${safeName}&cat=Counter-Strike%202`,
      bg: 'bg-[#FA490A]/80 hover:bg-[#FA490A]',
      icon: 'SP',
    },
    {
      label: 'CS Float',
      href: `https://csfloat.com/search?q=${safeName}`,
      bg: 'bg-[#4A69FF]/80 hover:bg-[#4A69FF]',
      icon: 'F',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-sf-card border-white/[0.08]">
        <div className="text-center relative">
          {/* Glow tinted with the item's rarity color */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full blur-[60px] pointer-events-none"
            style={{ backgroundColor: `${item.rarity.color}33` }}
          />

          {/* Image */}
          <div className="w-40 h-32 mx-auto mb-4 flex items-center justify-center relative z-10">
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt=""
                className="max-w-full max-h-full object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.6)]"
              />
            )}
          </div>

          <DialogTitle className="text-lg font-bold text-white mb-1 leading-tight">
            {displayName}
          </DialogTitle>
          <div className="flex items-center justify-center gap-1.5 flex-wrap mb-6">
            {item.wear && (
              <span
                className="inline-block text-[10px] font-semibold px-2.5 py-1 rounded-md"
                style={{ background: `${item.wear.color}20`, color: item.wear.color, border: `1px solid ${item.wear.color}33` }}
              >
                {item.wear.name}
              </span>
            )}
            <span
              className="inline-block text-[10px] font-semibold px-2.5 py-1 rounded-md"
              style={{ background: item.rarity.bg, color: item.rarity.color, border: `1px solid ${item.rarity.color}33` }}
            >
              {item.rarity.name}
            </span>
          </div>

          {/* Notable rare-pattern / finish badges (only when reliably detected) */}
          {patternTags.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 flex-wrap -mt-3 mb-6">
              {patternTags.map((tag, i) => {
                const style = PATTERN_TIER_STYLE[tag.tier ?? 'neutral'];
                return (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-md"
                    style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
                  >
                    {(tag.tier === 'gold' || tag.tier === 'cyan') && <span aria-hidden="true">{'♦'}</span>}
                    {t(tag.key as TranslationKey)}
                    {tag.rank && <span className="opacity-60 font-mono">{tag.rank}</span>}
                  </span>
                );
              })}
            </div>
          )}

          {/* Prices by source (the 3 prices live here, not on the main view) */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {([['steam', 'Steam'], ['csfloat', 'CSFloat'], ['skinport', 'Skinport']] as const).map(([key, label]) => {
              const val = priceData?.rawPrice ? priceData.rawPrice[key] : null;
              const active = priceSource === key;
              return (
                <div key={key} className={`p-2.5 rounded-xl border ${active ? 'border-sf-cyan/40 bg-sf-cyan/10' : 'border-white/[0.06] bg-sf-body'}`}>
                  <div className="nav-label mb-1">{label}</div>
                  {isLoading ? (
                    <div className="h-5 w-14 mx-auto animate-pulse rounded-lg bg-white/5" />
                  ) : (
                    <p className="font-mono text-sm font-bold text-white">
                      {/* In "Steam (- fees)" display mode the list shows the net Steam price,
                          so the Steam box here must apply the same fee deduction. */}
                      {val != null ? formatEur(val, key === 'steam' ? priceProvider : undefined) : '—'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {item.quantity > 1 && (
            <p className="font-mono text-xs text-gray-400 mb-3">
              x{item.quantity} {'·'} {formatEur(item.total, priceProvider)}
            </p>
          )}
          {isError && (
            <p className="text-[11px] text-gray-500 mb-3">{t('item.priceError')}</p>
          )}

          {/* 24h change + float + sticker value */}
          <div className="flex items-center justify-center gap-4 text-xs mb-4 flex-wrap">
            {priceData?.change?.hasData && (
              <span className={`font-mono ${priceData.change.percentage >= 0 ? 'text-sf-green' : 'text-sf-pink'}`}>
                24h {formatPercent(priceData.change.percentage)}
              </span>
            )}
            {item.floatValue != null && (
              <span className="font-mono text-gray-400">{t('item.float')} {item.floatValue.toFixed(4)}</span>
            )}
            {item.stickerValue > 0 && (
              <span className="text-gray-400">{t('item.stickers')} {formatEur(item.stickerValue, priceProvider)}</span>
            )}
          </div>
          {item.stickers && item.stickers.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-5">
              {item.stickers.map((s, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-gray-300">
                  {s.name}
                </span>
              ))}
            </div>
          )}

          {/* 30-day price sparkline for the selected source */}
          {spark && (
            <div className="mb-5 text-left">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] text-sf-dim">{t('item.priceHistory')}</span>
                <span className="font-mono text-[10px] text-sf-dim">
                  {formatEur(sparkMin, sparkFeeProvider)} {'–'} {formatEur(sparkMax, sparkFeeProvider)}
                </span>
              </div>
              <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" className="w-full h-12" aria-hidden="true">
                <path d={spark.fill} fill={sparkColor} opacity={0.08} />
                <path d={spark.line} fill="none" stroke={sparkColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          )}

          {/* Buy price / P&L */}
          <div className="mb-3 p-3 rounded-xl bg-sf-body border border-white/[0.06] text-left">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-gray-400 whitespace-nowrap">{t('item.buyPrice')}</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={buyPriceInput}
                  onChange={(e) => setBuyPriceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !setPurchaseMutation.isPending && parsePriceInput(buyPriceInput) !== null) {
                      handleSaveBuyPrice();
                    }
                  }}
                  placeholder="0.00"
                  aria-label={t('item.buyPrice')}
                  className="w-24 h-8 px-2 rounded-lg bg-white/5 border border-white/[0.08] text-xs text-white font-mono text-right focus:outline-none focus:border-sf-cyan/40"
                />
                <button
                  onClick={handleSaveBuyPrice}
                  disabled={setPurchaseMutation.isPending || parsePriceInput(buyPriceInput) === null}
                  className="h-8 px-3 rounded-lg bg-sf-cyan/15 border border-sf-cyan/30 text-xs text-sf-cyan hover:bg-sf-cyan/25 transition-colors disabled:opacity-50"
                >
                  {t('item.save')}
                </button>
                {item.buyPrice != null && (
                  <button
                    onClick={handleClearBuyPrice}
                    disabled={removePurchaseMutation.isPending}
                    className="h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {t('item.clear')}
                  </button>
                )}
              </div>
            </div>
            {pnl !== null && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.05]">
                <span className="text-xs text-gray-400">{t('item.pnl')}</span>
                <span className={`font-mono text-xs font-bold ${pnl >= 0 ? 'text-sf-green' : 'text-sf-pink'}`}>
                  {pnl >= 0 ? '+' : ''}{formatEur(pnl)}
                  {pnlPercent !== null ? ` (${formatPercent(pnlPercent)})` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Custom price alert — server-side trigger checks run on fresh STEAM
              prices only, so say so even when the modal displays another source. */}
          <div className="mb-5 p-3 rounded-xl bg-sf-body border border-white/[0.06] text-left">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-gray-400 whitespace-nowrap" title={t('alerts.steamBasis')}>
                {t('alerts.priceAlert')}
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  value={alertDirection}
                  onChange={(e) => setAlertDirection(e.target.value as 'above' | 'below')}
                  aria-label={t('alerts.priceAlert')}
                  className="h-8 px-1.5 rounded-lg bg-white/5 border border-white/[0.08] text-xs text-white focus:outline-none focus:border-sf-cyan/40"
                >
                  <option value="below">{'≤'}</option>
                  <option value="above">{'≥'}</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={alertThresholdInput}
                  onChange={(e) => setAlertThresholdInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !createAlertMutation.isPending && parsePriceInput(alertThresholdInput) !== null) {
                      handleCreateAlert();
                    }
                  }}
                  placeholder="0.00"
                  aria-label={t('alerts.priceAlert')}
                  className="w-24 h-8 px-2 rounded-lg bg-white/5 border border-white/[0.08] text-xs text-white font-mono text-right focus:outline-none focus:border-sf-cyan/40"
                />
                <button
                  onClick={handleCreateAlert}
                  disabled={createAlertMutation.isPending || parsePriceInput(alertThresholdInput) === null}
                  className="h-8 px-3 rounded-lg bg-sf-cyan/15 border border-sf-cyan/30 text-xs text-sf-cyan hover:bg-sf-cyan/25 transition-colors disabled:opacity-50"
                >
                  {t('alerts.create')}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 mt-1.5">{t('alerts.steamBasis')}</p>
            {itemAlerts.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/[0.05] space-y-1.5">
                {itemAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-300">
                      {alert.direction === 'below' ? '≤' : '≥'} {formatEur(alert.thresholdEur)}
                    </span>
                    {alert.triggeredAt && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sf-cyan">
                        <span className="w-1.5 h-1.5 rounded-full bg-sf-cyan" />
                        {t('alerts.triggered')}
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteAlert(alert.id)}
                      disabled={deleteAlertMutation.isPending}
                      aria-label={t('item.clear')}
                      className="ml-auto w-8 h-8 p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      <X className="w-3 h-3 text-gray-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Market links */}
          <div className="space-y-2">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-between w-full py-3 px-4 rounded-xl ${link.bg} text-white font-medium transition-all group border border-white/[0.06] hover:border-white/20`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-black text-lg font-mono">{link.icon}</span>
                  {link.label}
                </span>
                <ExternalLink className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
