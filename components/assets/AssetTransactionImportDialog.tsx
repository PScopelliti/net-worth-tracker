/**
 * Asset Transaction Import Dialog
 * 
 * Multi-step dialog for importing asset transactions from CSV files.
 * Follows the established pattern from other dialogs in the app.
 * 
 * Steps:
 * 1. Upload - File selection with drag & drop support
 * 2. Preview - Show parsed transactions with validation errors
 * 3. Processing - Aggregate transactions and fetch prices
 * 4. Results - Display import summary and created assets
 * 
 * Features:
 * - CSV validation with detailed error messages
 * - FIFO aggregation with average cost calculation
 * - Automatic price fetching from Yahoo Finance
 * - Preview of final positions before import
 * - Comprehensive error handling and user feedback
 */
'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  AssetTransaction,
  AggregatedPosition,
  TransactionProcessingResult,
  TransactionImportState
} from '@/types/transactions';
import { validateTransactionsFromCSV, validateAssetTypeClassCompatibility, generateCSVTemplate } from '@/lib/services/transactionValidationService';
import { aggregateTransactions, positionToAssetFormData } from '@/lib/services/transactionAggregationService';
import { createAsset } from '@/lib/services/assetService';
import { getUserAccounts, createAccount } from '@/lib/services/accountService';
import { AccountFormData } from '@/types/accounts';
import { formatCurrency, formatNumber } from '@/lib/services/chartService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Download, 
  ArrowLeft, 
  ArrowRight,
  Loader2
} from 'lucide-react';

interface AssetTransactionImportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AssetTransactionImportDialog({ open, onClose }: AssetTransactionImportDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importState, setImportState] = useState<TransactionImportState>({
    step: 'upload',
    file: null,
    transactions: [],
    processingResult: null,
    isProcessing: false,
    error: null,
  });

  // Reset state when dialog closes
  const handleClose = () => {
    setImportState({
      step: 'upload',
      file: null,
      transactions: [],
      processingResult: null,
      isProcessing: false,
      error: null,
    });
    onClose();
  };

  // Handle file selection
  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Per favore seleziona un file CSV');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast.error('Il file è troppo grande. Limite massimo: 5MB');
      return;
    }

    setImportState(prev => ({
      ...prev,
      file,
      error: null,
    }));
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Parse CSV and validate transactions
  const handleParseCSV = async () => {
    if (!importState.file) return;

    try {
      setImportState(prev => ({ ...prev, isProcessing: true, error: null }));

      const csvContent = await importState.file.text();
      const { transactions, errors } = validateTransactionsFromCSV(csvContent);

      // Check asset type/class compatibility
      const compatibilityErrors = validateAssetTypeClassCompatibility(transactions);
      const allErrors = [...errors, ...compatibilityErrors];

      if (allErrors.length > 0 && transactions.length === 0) {
        setImportState(prev => ({
          ...prev,
          isProcessing: false,
          error: 'Nessuna transazione valida trovata nel CSV',
        }));
        return;
      }

      setImportState(prev => ({
        ...prev,
        transactions,
        processingResult: null,
        step: 'preview',
        isProcessing: false,
      }));

      if (allErrors.length > 0) {
        toast.warning(`${allErrors.length} righe con errori saranno saltate`);
      }

      toast.success(`${transactions.length} transazioni parsed successfully`);
    } catch (error: any) {
      console.error('Error parsing CSV:', error);
      setImportState(prev => ({
        ...prev,
        isProcessing: false,
        error: error.message || 'Errore nel parsing del CSV',
      }));
    }
  };

  // Aggregate transactions and preview positions
  const handleAggregateTransactions = () => {
    try {
      setImportState(prev => ({ ...prev, isProcessing: true }));

      const result = aggregateTransactions(importState.transactions);

      setImportState(prev => ({
        ...prev,
        processingResult: result,
        step: 'processing',
        isProcessing: false,
      }));

      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} errori nell'aggregazione`);
      }
    } catch (error: any) {
      console.error('Error aggregating transactions:', error);
      setImportState(prev => ({
        ...prev,
        isProcessing: false,
        error: error.message || "Errore nell'aggregazione delle transazioni",
      }));
    }
  };

  // Auto-create accounts that don't exist yet and return mapping
  const ensureAccountsExistWithMapping = async (userId: string, positions: AggregatedPosition[]): Promise<{ [csvAccountId: string]: string }> => {
    try {
      // Get existing accounts
      const existingAccounts = await getUserAccounts(userId);
      const existingAccountsByName = new Map(existingAccounts.map(acc => [acc.name.toLowerCase(), acc.id]));
      
      // Find unique account IDs from positions
      const requiredAccountIds = [
        ...new Set(
          positions
            .map(pos => pos.accountId)
            .filter(id => id && id !== 'default')
        )
      ];

      const accountMapping: { [csvAccountId: string]: string } = {};
      let createdCount = 0;

      // Process each account ID
      for (const csvAccountId of requiredAccountIds) {
        try {
          // Extract account name from CSV ID
          const accountName = extractAccountNameFromId(csvAccountId as string);
          const normalizedName = accountName.toLowerCase();
          
          // Check if account with this name already exists
          if (existingAccountsByName.has(normalizedName)) {
            // Map CSV ID to existing account ID
            accountMapping[csvAccountId as string] = existingAccountsByName.get(normalizedName)!;
            console.log(`Mapped ${csvAccountId} to existing account: ${accountName}`);
          } else {
            // Create new account
            const accountData: AccountFormData = {
              name: accountName,
              type: 'broker', // Default type for auto-created accounts
              status: 'active',
              description: `Account creato automaticamente dall'import CSV (ID originale: ${csvAccountId})`,
              currency: 'EUR',
              isDefault: false,
              sortOrder: existingAccounts.length + createdCount,
            };

            const newAccountId = await createAccount(userId, accountData);
            accountMapping[csvAccountId as string] = newAccountId;
            createdCount++;
            
            console.log(`Auto-created account: ${accountName} (${newAccountId})`);
          }
        } catch (error: any) {
          console.warn(`Failed to process account ${csvAccountId}:`, error.message);
          // If creation fails, keep CSV ID as-is (fallback)
          accountMapping[csvAccountId as string] = csvAccountId as string;
        }
      }

      if (createdCount > 0) {
        toast.success(`${createdCount} nuovi account creati automaticamente`);
      }
      
      return accountMapping;
    } catch (error: any) {
      console.error('Error ensuring accounts exist:', error);
      toast.warning('Alcuni account potrebbero non essere stati creati automaticamente');
      return {};
    }
  };

  // Extract user-friendly account name from CSV account ID
  const extractAccountNameFromId = (accountId: string): string => {
    // Handle common patterns in account IDs
    const patterns: Record<string, string> = {
      'directa': 'Directa Trading',
      'fineco': 'Fineco Bank',
      'degiro': 'Degiro',
      'ing': 'ING Direct',
      'intesa': 'Intesa Sanpaolo',
      'unicredit': 'UniCredit',
      'bnl': 'BNL',
      'mediolanum': 'Banca Mediolanum',
      'widiba': 'Widiba',
      'webank': 'WeBank',
      'pensione': 'Fondo Pensione',
      'tfr': 'TFR',
    };

    const lowerAccountId = accountId.toLowerCase();
    
    // Try to match known patterns
    for (const [pattern, name] of Object.entries(patterns)) {
      if (lowerAccountId.includes(pattern)) {
        return name;
      }
    }
    
    // Fallback: capitalize and clean up the ID
    return accountId
      .replace(/account[-_]/gi, '')  // Remove "account-" prefix
      .replace(/[-_]/g, ' ')         // Replace dashes/underscores with spaces
      .replace(/\b\w/g, l => l.toUpperCase())  // Capitalize each word
      .slice(0, 50);  // Limit length
  };

  // Import final positions as assets
  const handleImportAssets = async () => {
    if (!user || !importState.processingResult) return;

    try {
      setImportState(prev => ({ ...prev, isProcessing: true }));

      // Step 1: Auto-create missing accounts and get account mapping
      const accountMapping = await ensureAccountsExistWithMapping(user.uid, importState.processingResult.positions);

      const createdAssets = [];
      const errors = [];

      for (const position of importState.processingResult.positions) {
        try {
          // Fetch current price for the asset
          let currentPrice = 1; // Default price

          try {
            if (position.type !== 'cash' && position.type !== 'realestate') {
              const priceResponse = await fetch(
                `/api/prices/quote?ticker=${encodeURIComponent(position.ticker)}`
              );
              
              if (priceResponse.ok) {
                const priceData = await priceResponse.json();
                if (priceData.price && priceData.price > 0) {
                  currentPrice = priceData.price;
                }
              }
            }
          } catch (priceError) {
            console.warn(`Failed to fetch price for ${position.ticker}:`, priceError);
            // Continue with default price
          }

          // Map CSV accountId to real Firestore account ID
          const realAccountId = position.accountId && accountMapping[position.accountId]
            ? accountMapping[position.accountId]
            : position.accountId;

          // Convert position to asset form data with real account ID
          const assetFormData = positionToAssetFormData({ ...position, accountId: realAccountId }, currentPrice);
          
          // Create asset
          const assetId = await createAsset(user.uid, assetFormData);
          createdAssets.push({ ...position, assetId, currentPrice, realAccountId });

        } catch (error: any) {
          errors.push({
            ticker: position.ticker,
            error: error.message || 'Errore nella creazione dell\'asset'
          });
        }
      }

      setImportState(prev => ({
        ...prev,
        step: 'results',
        isProcessing: false,
        processingResult: prev.processingResult ? {
          ...prev.processingResult,
          summary: {
            ...prev.processingResult.summary,
            createdAssets: createdAssets.length,
            failedAssets: errors.length,
          }
        } : null,
      }));

      // Invalidate cache to refresh asset list and accounts
      if (user?.uid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
        // Also invalidate accounts cache to show newly created accounts
        queryClient.invalidateQueries({ queryKey: ['accounts', user.uid] });
      }

      toast.success(
        `Import completato! ${createdAssets.length} asset creati${
          errors.length > 0 ? `, ${errors.length} errori` : ''
        }`
      );

    } catch (error: any) {
      console.error('Error importing assets:', error);
      setImportState(prev => ({
        ...prev,
        isProcessing: false,
        error: error.message || 'Errore durante l\'import degli asset',
      }));
    }
  };

  // Download CSV template
  const handleDownloadTemplate = () => {
    const csvContent = generateCSVTemplate();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template-transazioni-asset.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold">Import Transazioni Asset</h3>
        <p className="text-sm text-gray-600 mt-1">
          Carica un file CSV con le tue transazioni di acquisto e vendita
        </p>
      </div>

      {/* Upload Area */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <div className="mt-4">
          <p className="text-lg">
            Trascina qui il tuo file CSV o{' '}
            <span className="text-blue-600 hover:text-blue-500 font-medium">
              clicca per selezionare
            </span>
          </p>
          <p className="text-sm text-gray-500 mt-1">File CSV fino a 5MB</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              handleFileSelect(e.target.files[0]);
            }
          }}
        />
      </div>

      {importState.file && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium">{importState.file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(importState.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <Button
                onClick={handleParseCSV}
                disabled={importState.isProcessing}
                className="min-w-[100px]"
              >
                {importState.isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Elaborazione...
                  </>
                ) : (
                  'Elabora'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template Download */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-blue-900">Template CSV</h4>
              <p className="text-sm text-blue-700">
                Scarica il template con esempi per formattare correttamente il tuo CSV
              </p>
            </div>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Scarica
            </Button>
          </div>
        </CardContent>
      </Card>

      {importState.error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <XCircle className="h-5 w-5" />
          <span>{importState.error}</span>
        </div>
      )}
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Anteprima Transazioni</h3>
          <p className="text-sm text-gray-600">
            {importState.transactions.length} transazioni trovate
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setImportState(prev => ({ ...prev, step: 'upload' }))}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Indietro
          </Button>
          <Button onClick={handleAggregateTransactions}>
            Aggrega Posizioni
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Quantità</TableHead>
              <TableHead className="text-right">Prezzo</TableHead>
              <TableHead className="text-right">Totale</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {importState.transactions.map((transaction, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">
                  <div>
                    <div>{transaction.ticker}</div>
                    <div className="text-xs text-gray-500">{transaction.name}</div>
                  </div>
                </TableCell>
                <TableCell>
                  {transaction.date.toLocaleDateString('it-IT')}
                </TableCell>
                <TableCell>
                  <Badge variant={transaction.transactionType === 'buy' ? 'default' : 'destructive'}>
                    {transaction.transactionType === 'buy' ? 'Acquisto' : 'Vendita'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {formatNumber(transaction.quantity, 2)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(transaction.price, transaction.currency, 4)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(
                    transaction.quantity * transaction.price + (transaction.fees || 0),
                    transaction.currency
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const renderProcessingStep = () => {
    if (!importState.processingResult) return null;

    const { positions, summary } = importState.processingResult;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Posizioni Aggregate</h3>
            <p className="text-sm text-gray-600">
              {positions.length} posizioni finali da importare
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setImportState(prev => ({ ...prev, step: 'preview' }))}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Indietro
            </Button>
            <Button
              onClick={handleImportAssets}
              disabled={importState.isProcessing || positions.length === 0}
              className="min-w-[140px]"
            >
              {importState.isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importazione...
                </>
              ) : (
                <>
                  Importa Asset
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{summary.uniqueTickers}</div>
              <p className="text-xs text-muted-foreground">Asset Unici</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{summary.validTransactions}</div>
              <p className="text-xs text-muted-foreground">Transazioni Valide</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">
                {formatCurrency(positions.reduce((sum, pos) => sum + pos.quantity * pos.averageCost, 0))}
              </div>
              <p className="text-xs text-muted-foreground">Valore Costo</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">
                {formatCurrency(summary.totalFees)}
              </div>
              <p className="text-xs text-muted-foreground">Commissioni Totali</p>
            </CardContent>
          </Card>
        </div>

        {/* Positions Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">Quantità</TableHead>
                <TableHead className="text-right">Prezzo Medio</TableHead>
                <TableHead className="text-right">Valore</TableHead>
                <TableHead className="text-right">Transazioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((position) => (
                <TableRow key={`${position.ticker}:${position.accountId || 'default'}`}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{position.ticker}</div>
                      <div className="text-xs text-gray-500">{position.name}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(position.quantity, 2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(position.averageCost, position.currency, 4)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(position.quantity * position.averageCost, position.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    {position.transactionCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const renderResultsStep = () => {
    if (!importState.processingResult) return null;

    const { summary } = importState.processingResult;

    return (
      <div className="space-y-6">
        <div className="text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-green-600 mb-4" />
          <h3 className="text-lg font-semibold">Import Completato</h3>
          <p className="text-sm text-gray-600">
            Le tue transazioni sono state importate con successo
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">
                {(summary as any).createdAssets || 0}
              </div>
              <p className="text-xs text-muted-foreground">Asset Creati</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">
                {summary.validTransactions}
              </div>
              <p className="text-xs text-muted-foreground">Transazioni Elaborate</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center">
          <Button onClick={handleClose}>
            Chiudi
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Transazioni Asset</DialogTitle>
          <DialogDescription className="sr-only">
            Importa le tue transazioni asset da un file CSV
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {importState.step === 'upload' && renderUploadStep()}
          {importState.step === 'preview' && renderPreviewStep()}
          {importState.step === 'processing' && renderProcessingStep()}
          {importState.step === 'results' && renderResultsStep()}
        </div>
      </DialogContent>
    </Dialog>
  );
}