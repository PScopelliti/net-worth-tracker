import { Timestamp } from 'firebase/firestore';

/**
 * Account Types for Asset Management
 * 
 * Represents different investment accounts (brokers, banks, pension funds)
 * that hold assets. Allows users to organize and track assets separately
 * by account while maintaining aggregated portfolio view.
 * 
 * Use cases:
 * - Multiple brokers (Directa, Fineco, Degiro)
 * - Different account types (Trading, ISA, Pension)
 * - Tax optimization across accounts
 * - Performance tracking per provider
 */

/**
 * Type of investment account
 */
export type AccountType = 
  | 'broker'        // Trading broker (Directa, Fineco, etc.)
  | 'bank'          // Bank investment account
  | 'pension'       // Pension fund account
  | 'insurance'     // Insurance-based investment
  | 'crypto'        // Cryptocurrency exchange
  | 'other';        // Custom account type

/**
 * Account status for soft delete and active management
 */
export type AccountStatus = 'active' | 'inactive' | 'closed';

/**
 * Core account entity
 */
export interface Account {
  id: string;
  userId: string;
  name: string;                    // Display name (e.g., "Directa Trading", "Fineco ISA")
  type: AccountType;
  status: AccountStatus;
  description?: string;            // Optional description or notes
  provider?: string;               // Provider name (e.g., "Directa", "Fineco")
  accountNumber?: string;          // Masked account number for reference
  currency: string;                // Primary currency (EUR, USD, etc.)
  isDefault: boolean;              // Default account for new assets
  sortOrder: number;               // Display order in UI (lower = higher priority)
  
  // Account-specific configuration
  taxOptimized?: boolean;          // If this account has tax benefits (ISA, etc.)
  allowsMargin?: boolean;          // If margin trading is enabled
  allowsOptions?: boolean;         // If options trading is enabled
  allowsCrypto?: boolean;          // If crypto trading is enabled
  
  // Metadata
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

/**
 * Form data for account creation/editing
 */
export interface AccountFormData {
  name: string;
  type: AccountType;
  status: AccountStatus;
  description?: string;
  provider?: string;
  accountNumber?: string;
  currency: string;
  isDefault: boolean;
  sortOrder: number;
  taxOptimized?: boolean;
  allowsMargin?: boolean;
  allowsOptions?: boolean;
  allowsCrypto?: boolean;
}

/**
 * Account summary with aggregated metrics
 */
export interface AccountSummary {
  account: Account;
  assetCount: number;              // Number of assets in this account
  totalValue: number;              // Total portfolio value in account currency
  liquidValue: number;             // Liquid assets value
  illiquidValue: number;           // Illiquid assets value
  totalGainLoss: number;           // Unrealized gains/losses
  totalGainLossPercent: number;    // Unrealized gains/losses percentage
  assetAllocation: {               // Asset class breakdown
    [assetClass: string]: {
      value: number;
      percentage: number;
    };
  };
  topAssets: {                     // Top 5 assets by value
    ticker: string;
    name: string;
    value: number;
    percentage: number;
  }[];
  lastUpdated: Date;               // When metrics were last calculated
}

/**
 * Account selector option for UI components
 */
export interface AccountOption {
  value: string;                   // Account ID or special value like '__all__'
  label: string;                   // Display name
  isDefault?: boolean;             // If this is the default account
  isSpecial?: boolean;             // For special options like "All Accounts"
}

/**
 * Account filter state for UI components
 */
export interface AccountFilter {
  selectedAccountId: string | null; // null = all accounts
  accountOptions: AccountOption[];
  defaultAccountId: string | null;
}

/**
 * Account migration data for existing assets
 */
export interface AccountMigrationData {
  defaultAccountId: string;
  migratedAssetCount: number;
  skippedAssetCount: number;
  errors: string[];
}

/**
 * Account-based asset metrics for dashboard
 */
export interface AccountMetrics {
  byAccount: {
    [accountId: string]: AccountSummary;
  };
  aggregated: {
    totalAccounts: number;
    totalValue: number;
    totalAssets: number;
    defaultAccountId: string | null;
  };
}

/**
 * Account validation errors
 */
export interface AccountValidationError {
  field: string;
  message: string;
}

/**
 * Constants for account management
 */
export const ACCOUNT_CONSTANTS = {
  DEFAULT_ACCOUNT_NAME: 'Account Principale',
  DEFAULT_CURRENCY: 'EUR',
  MAX_ACCOUNT_NAME_LENGTH: 50,
  MAX_DESCRIPTION_LENGTH: 200,
  MAX_ACCOUNTS_PER_USER: 20,
  
  // Special account IDs for filtering
  ALL_ACCOUNTS_ID: '__all_accounts__',
  NO_ACCOUNT_ID: '__no_account__',
} as const;

/**
 * Account type display labels (Italian)
 */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  broker: 'Broker',
  bank: 'Banca',
  pension: 'Fondo Pensione',
  insurance: 'Assicurazione',
  crypto: 'Exchange Crypto',
  other: 'Altro',
};

/**
 * Account status display labels (Italian)
 */
export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Attivo',
  inactive: 'Inattivo',
  closed: 'Chiuso',
};

/**
 * Common provider suggestions for quick selection
 */
export const COMMON_PROVIDERS = [
  'Directa',
  'Fineco',
  'Degiro',
  'Interactive Brokers',
  'Banca Intesa',
  'UniCredit',
  'Binance',
  'Coinbase',
  'eToro',
  'Trading212',
] as const;