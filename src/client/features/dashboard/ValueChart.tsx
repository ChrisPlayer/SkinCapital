import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { useI18n } from '../../lib/i18n.tsx';
import { formatDateShort } from '../../lib/formatters.ts';
import type { HistoryPoint } from '../../../shared/types/api.ts';

interface ValueChartProps {
  data: HistoryPoint[];
  days: number;
  onDaysChange: (days: number) => void;
}

export function ValueChart({ data, days, onDaysChange }: ValueChartProps) {
  const { t } = useI18n();
  const chartData = data.map((d) => ({
    date: formatDateShort(d.date),
    value: d.value,
  }));

  return (
    <Card className="glass-card mb-6">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            {t('chart.valueHistory')}
          </h2>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => onDaysChange(d)}
                className={`px-3 py-1 text-xs rounded-lg transition-all ${
                  days === d
                    ? 'bg-cs-orange/20 text-cs-orange'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {d}J
              </button>
            ))}
          </div>
        </div>

        <div className="h-52">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DE9B35" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#DE9B35" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#374151', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: '#374151', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `\u20ac${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(10,14,20,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#DE9B35',
                  }}
                  formatter={(value: number) => [`\u20ac${value.toFixed(2)}`, t('chart.value')]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#DE9B35"
                  strokeWidth={2}
                  fill="url(#valueGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              {t('chart.noData')}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
