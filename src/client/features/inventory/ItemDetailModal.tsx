import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { useItemPrice } from '../../hooks/useApi.ts';
import { formatEur, formatPercent } from '../../lib/formatters.ts';
import { ExternalLink } from 'lucide-react';
import type { ItemGroup } from '../../../shared/types/inventory.ts';

interface ItemDetailModalProps {
  item: ItemGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ItemDetailModal({ item, open, onOpenChange }: ItemDetailModalProps) {
  const { data: priceData, isLoading } = useItemPrice(item?.marketHashName ?? '');

  if (!item) return null;

  const safeName = encodeURIComponent(item.marketHashName);
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
      <DialogContent className="max-w-sm bg-sf-card border-white/[0.08]">
        <div className="text-center relative">
          {/* Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-sf-cyan/20 rounded-full blur-[60px] pointer-events-none" />

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
            {item.marketHashName}
          </DialogTitle>
          <span
            className="inline-block text-[10px] font-mono px-2.5 py-1 rounded-md mb-6"
            style={{ background: item.rarity.bg, color: item.rarity.color, border: `1px solid ${item.rarity.color}33` }}
          >
            {item.rarity.name}
          </span>

          {/* Price grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-sf-body p-3 rounded-xl border border-white/[0.06]">
              <div className="nav-label mb-1.5">Prix Steam</div>
              {isLoading ? (
                <Skeleton className="h-6 w-20 mx-auto" />
              ) : (
                <p className="font-mono text-lg font-bold text-white">{formatEur(priceData?.price)}</p>
              )}
            </div>
            <div className="bg-sf-body p-3 rounded-xl border border-white/[0.06]">
              <div className="nav-label mb-1.5">Var. 24h</div>
              {isLoading ? (
                <Skeleton className="h-6 w-20 mx-auto" />
              ) : priceData?.change?.hasData ? (
                <p className={`font-mono text-lg font-bold ${priceData.change.percentage >= 0 ? 'text-sf-green' : 'text-sf-pink'}`}>
                  {formatPercent(priceData.change.percentage)}
                </p>
              ) : (
                <p className="font-mono text-lg font-bold text-sf-dim">&mdash;</p>
              )}
            </div>
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
