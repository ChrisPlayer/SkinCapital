import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { KpiCards } from './KpiCards.tsx';
import { ValueChart } from './ValueChart.tsx';
import { DailyHistoryTable } from './DailyHistoryTable.tsx';
import { InventoryTab } from '../inventory/InventoryTab.tsx';
import { StorageUnitsTab } from '../storage-units/StorageUnitsTab.tsx';
import { ExportButton } from '../export/ExportButton.tsx';
import { useAuth } from '../auth/useAuth.ts';
import { useDashboardData, useRefreshInventory } from '../../hooks/useApi.ts';
import { useRefreshPolling } from '../../hooks/usePolling.ts';
import { formatEur } from '../../lib/formatters.ts';
import { RefreshCw, LogOut, Loader2 } from 'lucide-react';

export function DashboardPage() {
  const navigate = useNavigate();
  const { logout, status } = useAuth();
  const [days, setDays] = useState(30);
  const { data, isLoading } = useDashboardData(days);
  const refreshMutation = useRefreshInventory();
  const { isRefreshing } = useRefreshPolling();

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate('/');
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-cs-dark">
        <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-100" style={{
      background: '#0f1218',
      backgroundImage: 'radial-gradient(at 0% 0%, rgba(136, 71, 255, 0.15) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(222, 155, 53, 0.1) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(211, 44, 230, 0.1) 0px, transparent 50%)',
      backgroundAttachment: 'fixed',
    }}>
      {/* Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-white/5 shadow-2xl">
        <div className="max-w-[1600px] mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-cs-orange to-cs-purple rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-2xl cursor-default">&#128049;</span>
              </div>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-cs-orange to-cs-pink bg-clip-text text-transparent tracking-tight">
                  CS2 Inventory Tracker
                </h1>
                <p className="text-[11px] text-gray-500 flex items-center gap-2">
                  {status?.isConnectedToGC ? (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      GC Online
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-400">
                      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                      GC Offline
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
                  Valeur Totale
                </p>
                <p className="text-xl font-black text-white tracking-tight">
                  {formatEur(data.totalValue)}
                </p>
              </div>

              <ExportButton />

              {isRefreshing ? (
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-cs-orange animate-spin" />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => refreshMutation.mutate()}
                  className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10"
                  title="Rafraichir"
                >
                  <RefreshCw className="w-5 h-5 text-gray-400" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="w-10 h-10 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500"
                title="Deconnexion"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        <KpiCards data={data} />
        <ValueChart data={data.historyData} days={days} onDaysChange={setDays} />
        <DailyHistoryTable data={data.dailyHistory} />

        <Tabs defaultValue="main">
          <TabsList>
            <TabsTrigger value="main">Inventaire ({data.mainInventory.count})</TabsTrigger>
            <TabsTrigger value="caskets">Storage Units ({data.storageUnits.length})</TabsTrigger>
            <TabsTrigger value="overview">Vue globale ({data.uniqueItems})</TabsTrigger>
          </TabsList>

          <TabsContent value="main">
            <InventoryTab items={data.mainInventory.items} total={data.mainInventory.total} count={data.mainInventory.count} label="Inventaire Principal" />
          </TabsContent>

          <TabsContent value="caskets">
            <StorageUnitsTab storageUnits={data.storageUnits} />
          </TabsContent>

          <TabsContent value="overview">
            <InventoryTab items={data.items} total={data.totalValue} count={data.totalItems} label="Tous les items" showCasketBadge />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
