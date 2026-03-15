import { AssetTransaction, AggregatedPosition, TransactionProcessingResult, TransactionValidationError } from '@/types/transactions';
import { AssetFormData } from '@/types/assets';

/**
 * Transaction Aggregation Service
 * 
 * Processes asset transactions from CSV import to create aggregated positions
 * with calculated average cost basis using FIFO (First In, First Out) method.
 * 
 * Key Features:
 * - Weighted average cost calculation for multiple buy transactions
 * - FIFO sell logic to maintain accurate cost basis
 * - Fee tracking and aggregation
 * - Comprehensive error handling and validation
 * - Support for partial sells and multiple currencies per ticker
 * 
 * Algorithm:
 * 1. Group transactions by ticker
 * 2. Sort by date (oldest first for FIFO)
 * 3. Process buys: add to position, update weighted average
 * 4. Process sells: remove from oldest lots first (FIFO)
 * 5. Calculate final position and metrics
 */

interface PositionLot {
  quantity: number;
  price: number;
  date: Date;
  fees: number;
}

interface PositionState {
  ticker: string;
  name: string;
  type: AssetTransaction['type'];
  assetClass: AssetTransaction['assetClass'];
  currency: string;
  isin?: string;
  subCategory?: string;
  accountId?: string;
  lots: PositionLot[]; // FIFO queue of purchase lots
  totalQuantity: number;
  totalCostBasis: number; // Total cost including fees
  totalFees: number;
  transactions: AssetTransaction[];
}

/**
 * Aggregate asset transactions into final positions
 * 
 * @param transactions - Array of validated asset transactions
 * @returns Processing result with aggregated positions and summary
 */
export function aggregateTransactions(transactions: AssetTransaction[]): TransactionProcessingResult {
  const errors: TransactionValidationError[] = [];
  const positionMap = new Map<string, PositionState>();

  // Group transactions by ticker and accountId (if provided)
  transactions.forEach((transaction, index) => {
    const key = `${transaction.ticker.toUpperCase()}:${transaction.accountId || 'default'}`;
    
    if (!positionMap.has(key)) {
      positionMap.set(key, {
        ticker: transaction.ticker,
        name: transaction.name,
        type: transaction.type,
        assetClass: transaction.assetClass,
        currency: transaction.currency,
        isin: transaction.isin,
        subCategory: transaction.subCategory,
        accountId: transaction.accountId,
        lots: [],
        totalQuantity: 0,
        totalCostBasis: 0,
        totalFees: 0,
        transactions: [],
      });
    }

    const position = positionMap.get(key)!;
    position.transactions.push(transaction);
  });

  // Process each position
  const finalPositions: AggregatedPosition[] = [];

  for (const [ticker, position] of positionMap) {
    try {
      const aggregated = processPositionTransactions(position);
      if (aggregated) {
        finalPositions.push(aggregated);
      }
    } catch (error: any) {
      errors.push({
        row: 0, // Position-level error
        message: `Errore nell'elaborazione di ${ticker}: ${error.message}`,
        rawData: { ticker }
      });
    }
  }

  // Calculate summary
  const totalTransactions = transactions.length;
  const validTransactions = totalTransactions - errors.length;
  const totalFees = finalPositions.reduce((sum, pos) => sum + pos.totalFees, 0);

  return {
    positions: finalPositions,
    errors,
    summary: {
      totalTransactions,
      validTransactions,
      invalidTransactions: errors.length,
      uniqueTickers: finalPositions.length,
      totalFees,
    },
  };
}

/**
 * Process all transactions for a single ticker using FIFO method
 * 
 * @param position - Position state with all transactions for this ticker
 * @returns Aggregated position or null if no net position remains
 */
function processPositionTransactions(position: PositionState): AggregatedPosition | null {
  // Sort transactions by date (FIFO - oldest first)
  const sortedTransactions = [...position.transactions].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Reset position state
  position.lots = [];
  position.totalQuantity = 0;
  position.totalCostBasis = 0;
  position.totalFees = 0;

  // Process each transaction
  for (const transaction of sortedTransactions) {
    if (transaction.transactionType === 'buy') {
      processBuyTransaction(position, transaction);
    } else if (transaction.transactionType === 'sell') {
      processSellTransaction(position, transaction);
    }
  }

  // Return null if no position remains (sold everything)
  if (position.totalQuantity <= 0) {
    return null;
  }

  // Calculate weighted average cost
  const averageCost = position.totalCostBasis / position.totalQuantity;

  // Find date range
  const dates = sortedTransactions.map(t => t.date);
  const firstPurchaseDate = dates[0];
  const lastTransactionDate = dates[dates.length - 1];

  return {
    ticker: position.ticker,
    name: position.name,
    type: position.type,
    assetClass: position.assetClass,
    currency: position.currency,
    quantity: position.totalQuantity,
    averageCost,
    totalFees: position.totalFees,
    firstPurchaseDate,
    lastTransactionDate,
    transactionCount: sortedTransactions.length,
    isin: position.isin,
    subCategory: position.subCategory,
    accountId: position.accountId,
  };
}

/**
 * Process a buy transaction - add new lot to position
 * 
 * @param position - Current position state
 * @param transaction - Buy transaction to process
 */
function processBuyTransaction(position: PositionState, transaction: AssetTransaction): void {
  const fees = transaction.fees || 0;
  const totalCost = transaction.quantity * transaction.price + fees;

  // Add new lot
  position.lots.push({
    quantity: transaction.quantity,
    price: transaction.price,
    date: transaction.date,
    fees,
  });

  // Update totals
  position.totalQuantity += transaction.quantity;
  position.totalCostBasis += totalCost;
  position.totalFees += fees;
}

/**
 * Process a sell transaction using FIFO method
 * 
 * @param position - Current position state
 * @param transaction - Sell transaction to process
 */
function processSellTransaction(position: PositionState, transaction: AssetTransaction): void {
  const fees = transaction.fees || 0;
  let remainingToSell = transaction.quantity;

  // Remove from lots using FIFO
  while (remainingToSell > 0 && position.lots.length > 0) {
    const lot = position.lots[0];

    if (lot.quantity <= remainingToSell) {
      // Sell entire lot
      remainingToSell -= lot.quantity;
      position.totalQuantity -= lot.quantity;
      position.totalCostBasis -= lot.quantity * lot.price + lot.fees;
      position.lots.shift(); // Remove lot from FIFO queue
    } else {
      // Partial lot sale
      const soldFromLot = remainingToSell;
      const costReduction = soldFromLot * lot.price + (lot.fees * soldFromLot / lot.quantity);
      
      // Update lot
      lot.quantity -= soldFromLot;
      lot.fees *= (lot.quantity / (lot.quantity + soldFromLot)); // Proportional fee reduction
      
      // Update totals
      position.totalQuantity -= soldFromLot;
      position.totalCostBasis -= costReduction;
      
      remainingToSell = 0;
    }
  }

  // Add sell fees to total fees (tracking cost)
  position.totalFees += fees;

  // If trying to sell more than available, it would result in negative quantity
  // This should be caught by validation before reaching here, but we handle it gracefully
  if (remainingToSell > 0) {
    throw new Error(
      `Tentativo di vendere ${transaction.quantity} azioni di ${position.ticker} ` +
      `ma sono disponibili solo ${position.totalQuantity + transaction.quantity - remainingToSell} azioni alla data ${transaction.date.toISOString().split('T')[0]}`
    );
  }
}

/**
 * Convert aggregated position to AssetFormData for createAsset()
 * 
 * @param position - Aggregated position
 * @param currentPrice - Current market price (optional)
 * @returns AssetFormData ready for asset creation
 */
export function positionToAssetFormData(
  position: AggregatedPosition,
  currentPrice?: number
): AssetFormData {
  return {
    ticker: position.ticker,
    name: position.name,
    type: position.type,
    assetClass: position.assetClass,
    currency: position.currency,
    quantity: position.quantity,
    averageCost: position.averageCost,
    currentPrice: currentPrice || 1, // Will be updated by price fetching
    isin: position.isin,
    subCategory: position.subCategory,
    accountId: position.accountId,
    // Default values - user can modify these later
    isLiquid: position.type !== 'realestate', // Real estate is typically illiquid
    autoUpdatePrice: position.type !== 'realestate' && position.type !== 'cash',
    stampDutyExempt: false,
  };
}

/**
 * Generate example CSV content for user reference
 * 
 * @returns Example CSV string with sample transactions
 */
export function getExampleCSVContent(): string {
  const headers = [
    'ticker',
    'name', 
    'type',
    'assetClass',
    'currency',
    'date',
    'quantity',
    'price',
    'transactionType',
    'fees',
    'isin',
    'notes'
  ].join(',');

  const examples = [
    'VWCE.DE,Vanguard FTSE All-World,etf,equity,EUR,2024-01-15,100,85.50,buy,2.50,IE00B3RBWM25,Primo acquisto',
    'VWCE.DE,Vanguard FTSE All-World,etf,equity,EUR,2024-03-15,50,92.75,buy,1.25,IE00B3RBWM25,Secondo acquisto',
    'AAPL,Apple Inc,stock,equity,USD,2024-02-01,25,180.25,buy,5.00,US0378331005,Acquisto Apple',
    'AAPL,Apple Inc,stock,equity,USD,2024-06-01,10,220.50,sell,5.00,US0378331005,Vendita parziale',
    'BTP-2025,BTP 2.45% Scadenza 2025,bond,bonds,EUR,2024-01-30,10,1020.50,buy,10.00,IT0005083057,Obbligazione italiana'
  ];

  return headers + '\n' + examples.join('\n');
}