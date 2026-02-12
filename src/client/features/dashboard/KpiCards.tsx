import { Card, CardContent } from '../../components/ui/card.tsx';
import { formatEur, formatPercent } from '../../lib/formatters.ts';
import type { DashboardData } from '../../../shared/types/api.ts';

interface KpiCardsProps {
  data: DashboardData;
}

export function KpiCards({ data }: KpiCardsProps) {
  const { totalItems, uniqueItems, storageUnits, totalValue, change24h, mainInventory } = data;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card className="glass-card">
        <CardContent className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Items Total</p>
          <p className="text-3xl font-extrabold text-white">{totalItems}</p>
          <p className="text-xs text-gray-500 mt-1">{uniqueItems} uniques</p>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Storage Units</p>
          <p className="text-3xl font-extrabold text-cs-purple">{storageUnits.length}</p>
          <p className="text-xs text-gray-500 mt-1">
            {totalItems - mainInventory.count} items stockes
          </p>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Valeur Totale</p>
          <p className="text-3xl font-extrabold text-cs-orange">{formatEur(totalValue)}</p>
          <p className="text-xs text-gray-500 mt-1">Steam Market</p>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Evolution 24h</p>
          {change24h.hasData ? (
            <>
              <p className={`text-3xl font-extrabold ${change24h.percentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatPercent(change24h.percentage)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {change24h.change >= 0 ? '+' : ''}{formatEur(change24h.change)}
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-extrabold text-gray-600">&mdash;</p>
              <p className="text-xs text-gray-600 mt-1">Pas de donnees</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
