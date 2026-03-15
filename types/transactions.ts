import { AssetType, AssetClass } from './assets';

/**
 * Asset Transaction Types for CSV Import
 * 
 * Represents individual buy/sell transactions that will be aggregated
 * to create final Asset entries with calculated averageCost.
 * 
 * Example workflow:
 * CSV → Transaction[] → groupBy(ticker) → aggregate → AssetFormData → createAsset()
 */

export type TransactionType = 'buy' | 'sell';

/**
 * Single transaction entry from CSV import
 */
export interface AssetTransaction {
  ticker: string;
  name: string;
  type: AssetType;
  assetClass: AssetClass;
  currency: string;
  date: Date;
  quantity: number;
  price: number;
  transactionType: TransactionType;
  fees?: number; // Optional transaction fees (broker commission, etc.)
  notes?: string; // Optional notes for this specific transaction
  isin?: string; // Optional ISIN for dividend tracking
  subCategory?: string; // Optional subcategory
  accountId?: string; // Optional account ID for multi-account support
}

/**
 * Validation schema data for CSV parsing (before Date conversion)
 */
export interface AssetTransactionRaw {
  ticker: string;
  name: string;
  type: AssetType;
  assetClass: AssetClass;
  currency: string;
  date: string; // Will be converted to Date during validation
  quantity: number;
  price: number;
  transactionType: TransactionType;
  fees?: number;
  notes?: string;
  isin?: string;
  subCategory?: string;
  accountId?: string; // Optional account ID for multi-account support
}

/**
 * Aggregated position for a single ticker after processing all transactions
 * This becomes the final AssetFormData for createAsset()
 */
export interface AggregatedPosition {
  ticker: string;
  name: string;
  type: AssetType;
  assetClass: AssetClass;
  currency: string;
  quantity: number; // Final net quantity after all buy/sell transactions
  averageCost: number; // Weighted average cost basis
  totalFees: number; // Sum of all transaction fees
  firstPurchaseDate: Date; // Date of first purchase (for tracking)
  lastTransactionDate: Date; // Date of most recent transaction
  transactionCount: number; // Total number of transactions for this ticker
  isin?: string;
  subCategory?: string;
  accountId?: string; // Account ID for multi-account support
  // Optional fields to be filled by price fetching
  currentPrice?: number;
}

/**
 * Processing result for CSV import
 */
export interface TransactionProcessingResult {
  positions: AggregatedPosition[];
  errors: TransactionValidationError[];
  summary: {
    totalTransactions: number;
    validTransactions: number;
    invalidTransactions: number;
    uniqueTickers: number;
    totalFees: number;
  };
}

/**
 * Validation error for a specific transaction
 */
export interface TransactionValidationError {
  row: number; // CSV row number (1-based)
  field?: string; // Field that failed validation
  message: string; // Error description
  rawData: any; // Original CSV row data for debugging
}

/**
 * CSV Import dialog state
 */
export interface TransactionImportState {
  step: 'upload' | 'preview' | 'processing' | 'results';
  file: File | null;
  transactions: AssetTransaction[];
  processingResult: TransactionProcessingResult | null;
  isProcessing: boolean;
  error: string | null;
}