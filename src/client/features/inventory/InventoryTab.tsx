import { useState, useMemo } from 'react';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Button } from '../../components/ui/button.tsx';
import { ItemCard } from './ItemCard.tsx';
import { ItemDetailModal } from './ItemDetailModal.tsx';
import { useI18n } from '../../lib/i18n.tsx';
import { formatEur } from '../../lib/formatters.ts';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ItemGroup } from '../../../shared/types/inventory.ts';

interface InventoryTabProps {
  items: ItemGroup[];
  total: number;
  count: number;
  label: string;
  showCasketBadge?: boolean;
}

const PER_PAGE = 50;

export function InventoryTab({ items, total, count, label, showCasketBadge }: InventoryTabProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'price' | 'name' | 'float' | 'quantity'>('price');
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<ItemGroup | null>(null);
  const { t } = useI18n();

  const filtered = useMemo(() => {
    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.marketHashName.toLowerCase().includes(q));
    }
    if (sort === 'name') {
      result = [...result].sort((a, b) => a.marketHashName.localeCompare(b.marketHashName));
    } else if (sort === 'quantity') {
      result = [...result].sort((a, b) => b.quantity - a.quantity || b.total - a.total);
    } else if (sort === 'float') {
      result = [...result].sort((a, b) => (a.floatValue ?? 1) - (b.floatValue ?? 1));
    } else {
      result = [...result].sort((a, b) => b.total - a.total);
    }
    return result;
  }, [items, search, sort]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div>
      <Card className="glass-card mb-4">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-300">{label}</p>
              <p className="text-xs text-gray-500">{count} items</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder={t('search.placeholder')}
                  className="pl-10 w-56"
                />
              </div>
              <div className="h-10 min-w-[180px] rounded-lg border border-white/10 bg-black/30 px-3 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-gray-500 whitespace-nowrap">{t('sort.by')}</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  className="h-full flex-1 bg-transparent text-sm text-white focus:outline-none"
                >
                  <option value="price">{t('sort.price')}</option>
                  <option value="quantity">{t('sort.quantity')}</option>
                  <option value="name">{t('sort.name')}</option>
                  <option value="float">{t('sort.float')}</option>
                </select>
              </div>
              <p className="text-xl font-bold text-cs-orange">{formatEur(total)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {paginated.map((item) => (
          <ItemCard
            key={item.marketHashName}
            item={item}
            onClick={() => setSelectedItem(item)}
            showCasketBadge={showCasketBadge}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="glass-card rounded-2xl p-8 text-center text-gray-500 mt-4">
          {t('empty.noItems')}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="bg-white/5"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
            return p <= totalPages ? (
              <Button
                key={p}
                variant="ghost"
                size="sm"
                onClick={() => setPage(p)}
                className={p === page ? 'bg-cs-orange text-white' : 'bg-white/5'}
              >
                {p}
              </Button>
            ) : null;
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="bg-white/5"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <ItemDetailModal
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => { if (!open) setSelectedItem(null); }}
      />
    </div>
  );
}
