/**
 * ASSETS PAGE
 *
 * Tab management page for assets with lazy loading and manual data refresh.
 *
 * LAZY LOADING PATTERN:
 * Same strategy as cashflow page:
 * - Macro-tabs ('anno-corrente', 'storico') mounted only when first activated
 * - Once mounted, stay mounted (no re-mounting on switch)
 * - Sub-tabs inside each macro-tab mount all at once (data is already in memory)
 * - Improves initial load performance
 *
 * TAB STRUCTURE:
 * - Gestione Asset: asset table with CRUD operations
 * - Anno Corrente: Prezzi / Valori / Asset Class for the current calendar year
 * - Storico: Prezzi / Valori / Asset Class for all history (from Nov 2025)
 *
 * REFRESH FUNCTIONALITY:
 * Manual refresh button invalidates React Query cache and refetches all data.
 * Useful after external price updates or when data seems stale.
 */

'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet, CalendarClock, History } from 'lucide-react';
import { AssetManagementTab } from '@/components/assets/AssetManagementTab';
import { AssetPriceHistoryTable } from '@/components/assets/AssetPriceHistoryTable';
import { AssetClassHistoryTable } from '@/components/assets/AssetClassHistoryTable';
import { getCurrentYear } from '@/lib/utils/assetPriceHistoryUtils';

export default function AssetsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // React Query hooks - automatic caching and invalidation
  const { data: assets = [], isLoading: loading, refetch } = useAssets(user?.uid);
  const { data: snapshots = [], isLoading: snapshotsLoading } = useSnapshots(user?.uid);

  // Macro-tab state — lazy loading applied only to 'anno-corrente' and 'storico'
  type MacroTabId = 'management' | 'anno-corrente' | 'storico';
  const [mountedTabs, setMountedTabs] = useState<Set<MacroTabId>>(new Set(['management']));
  const [activeTab, setActiveTab] = useState<MacroTabId>('management');

  const handleTabChange = (value: string) => {
    setActiveTab(value as MacroTabId);
    setMountedTabs((prev) => new Set(prev).add(value as MacroTabId));
  };

  const handleRefresh = async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapshots.all(user?.uid || ''),
      }),
    ]);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Assets</h1>
        <p className="mt-2 text-gray-600">Gestisci e monitora i tuoi asset di investimento</p>
      </div>

      {/* Outer tabs: 3 macro-tabs */}
      <Tabs defaultValue="management" value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex min-w-full desktop:w-auto desktop:grid desktop:grid-cols-3">
            <TabsTrigger value="management" className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Gestione Asset</span>
            </TabsTrigger>
            <TabsTrigger value="anno-corrente" className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4">
              <CalendarClock className="h-4 w-4" />
              <span className="hidden sm:inline">Anno Corrente</span>
            </TabsTrigger>
            <TabsTrigger value="storico" className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Storico</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Macro-tab 1: Gestione Asset (always mounted) */}
        <TabsContent value="management" className="mt-6">
          <AssetManagementTab assets={assets} loading={loading} onRefresh={handleRefresh} />
        </TabsContent>

        {/* Macro-tab 2: Anno Corrente (lazy-loaded) — sub-tabs: Prezzi, Valori, Asset Class */}
        {mountedTabs.has('anno-corrente') && (
          <TabsContent value="anno-corrente" className="mt-6">
            <Tabs defaultValue="prezzi" className="w-full">
              <TabsList className="grid grid-cols-3 mb-4">
                <TabsTrigger value="prezzi" className="text-xs sm:text-sm">
                  Prezzi
                </TabsTrigger>
                <TabsTrigger value="valori" className="text-xs sm:text-sm">
                  Valori
                </TabsTrigger>
                <TabsTrigger value="asset-class" className="text-xs sm:text-sm">
                  Asset Class
                </TabsTrigger>
              </TabsList>

              <TabsContent value="prezzi">
                <AssetPriceHistoryTable
                  assets={assets}
                  snapshots={snapshots}
                  filterYear={getCurrentYear()}
                  displayMode="price"
                  showTotalRow={false}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>

              <TabsContent value="valori">
                <AssetPriceHistoryTable
                  assets={assets}
                  snapshots={snapshots}
                  filterYear={getCurrentYear()}
                  displayMode="totalValue"
                  showTotalRow={true}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>

              <TabsContent value="asset-class">
                <AssetClassHistoryTable
                  snapshots={snapshots}
                  filterYear={getCurrentYear()}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}

        {/* Macro-tab 3: Storico (lazy-loaded) — sub-tabs: Prezzi, Valori, Asset Class */}
        {mountedTabs.has('storico') && (
          <TabsContent value="storico" className="mt-6">
            <Tabs defaultValue="prezzi" className="w-full">
              <TabsList className="grid grid-cols-3 mb-4">
                <TabsTrigger value="prezzi" className="text-xs sm:text-sm">
                  Prezzi
                </TabsTrigger>
                <TabsTrigger value="valori" className="text-xs sm:text-sm">
                  Valori
                </TabsTrigger>
                <TabsTrigger value="asset-class" className="text-xs sm:text-sm">
                  Asset Class
                </TabsTrigger>
              </TabsList>

              <TabsContent value="prezzi">
                <AssetPriceHistoryTable
                  assets={assets}
                  snapshots={snapshots}
                  filterStartDate={{ year: 2025, month: 11 }}
                  displayMode="price"
                  showTotalRow={false}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>

              <TabsContent value="valori">
                <AssetPriceHistoryTable
                  assets={assets}
                  snapshots={snapshots}
                  filterStartDate={{ year: 2025, month: 11 }}
                  displayMode="totalValue"
                  showTotalRow={true}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>

              <TabsContent value="asset-class">
                <AssetClassHistoryTable
                  snapshots={snapshots}
                  filterStartDate={{ year: 2025, month: 11 }}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
