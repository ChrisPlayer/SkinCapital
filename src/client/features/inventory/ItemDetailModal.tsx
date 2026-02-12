import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
import { Badge } from '../../components/ui/badge.tsx';
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
      color: 'bg-[#1b2838] hover:bg-[#2a475e]',
      icon: 'S',
    },
    {
      label: 'Skinport',
      href: `https://skinport.com/market?search=${safeName}&cat=Counter-Strike%202`,
      color: 'bg-[#FA490A]/90 hover:bg-[#ff571a]',
      icon: 'SP',
    },
    {
      label: 'CS Float',
      href: `https://csfloat.com/search?q=${safeName}`,
      color: 'bg-[#4A69FF]/90 hover:bg-[#5e7aff]',
      icon: 'F',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <div className="text-center relative">
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-32 bg-cs-purple/30 rounded-full blur-[50px] pointer-events-none" />

          <div className="w-40 h-32 mx-auto mb-4 flex items-center justify-center relative z-10">
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt=""
                className="max-w-full max-h-full object-contain filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
              />
            )}
          </div>

          <DialogTitle className="text-lg font-bold text-white mb-1 leading-tight">
            {item.marketHashName}
          </DialogTitle>
          <Badge
            className="mb-6 inline-block"
            style={{ background: item.rarity.bg, color: item.rarity.color, border: `1px solid ${item.rarity.color}33` }}
          >
            {item.rarity.name}
          </Badge>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-black/40 p-3 rounded-xl border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Prix Steam</p>
              {isLoading ? (
                <Skeleton className="h-6 w-20 mx-auto" />
              ) : (
                <p className="text-lg font-bold text-white">
                  {formatEur(priceData?.price)}
                </p>
              )}
            </div>
            <div className="bg-black/40 p-3 rounded-xl border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Var. 24h</p>
              {isLoading ? (
                <Skeleton className="h-6 w-20 mx-auto" />
              ) : priceData?.change?.hasData ? (
                <p className={`text-lg font-bold ${priceData.change.percentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatPercent(priceData.change.percentage)}
                </p>
              ) : (
                <p className="text-lg font-bold text-gray-600">&mdash;</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-between w-full py-3 px-4 rounded-xl ${link.color} text-white font-medium transition-all group border border-white/5 hover:border-white/20`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-black text-lg">{link.icon}</span>
                  {link.label}
                </span>
                <ExternalLink className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
