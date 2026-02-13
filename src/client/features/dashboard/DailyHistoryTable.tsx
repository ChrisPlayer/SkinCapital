import { Card, CardContent } from '../../components/ui/card.tsx';
import { useI18n } from '../../lib/i18n.tsx';
import { formatEur, formatDate } from '../../lib/formatters.ts';
import type { DailyHistoryEntry } from '../../../shared/types/api.ts';

interface DailyHistoryTableProps {
  data: DailyHistoryEntry[];
}

export function DailyHistoryTable({ data }: DailyHistoryTableProps) {
  const { t, priceProvider: pp } = useI18n();

  return (
    <Card className="glass-card mb-6 overflow-hidden">
      <CardContent className="p-6">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
          {t('history.title')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-white/5">
                <th className="py-3 font-medium uppercase tracking-wider">{t('table.date')}</th>
                <th className="py-3 font-medium uppercase tracking-wider text-right">{t('table.totalValue')}</th>
                <th className="py-3 font-medium uppercase tracking-wider text-right">{t('table.variation')}</th>
                <th className="py-3 font-medium uppercase tracking-wider text-right">%</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {data.length > 0 ? (
                data.map((day, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                    <td className="py-3 font-mono text-gray-300">{formatDate(day.date)}</td>
                    <td className="py-3 font-mono text-right font-bold text-gray-200">
                      {formatEur(day.value, pp)}
                    </td>
                    <td className={`py-3 font-mono text-right font-bold ${day.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {day.change >= 0 ? '+' : ''}{formatEur(day.change, pp)}
                    </td>
                    <td className={`py-3 font-mono text-right font-bold ${day.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {day.changePercent >= 0 ? '+' : ''}{day.changePercent.toFixed(2)}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-500 text-xs">
                    {t('table.noHistoryData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
