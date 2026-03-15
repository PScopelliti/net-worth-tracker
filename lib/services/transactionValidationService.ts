import { z } from 'zod';
import { AssetTransaction, AssetTransactionRaw, TransactionValidationError } from '@/types/transactions';
import { AssetType, AssetClass } from '@/types/assets';

/**
 * Transaction Validation Service
 * 
 * Provides Zod schema validation for CSV transaction import with Italian error messages.
 * Handles data type conversions (string dates -> Date objects) and comprehensive validation.
 * 
 * Features:
 * - Type-safe validation with detailed error messages in Italian
 * - Date parsing and validation
 * - ISIN format validation (optional)
 * - Asset type/class validation
 * - CSV parsing and row-level error tracking
 */

// Zod schema for transaction validation
const transactionSchema = z.object({
  ticker: z
    .string()
    .min(1, 'Il ticker è obbligatorio')
    .max(20, 'Il ticker non può superare 20 caratteri')
    .regex(/^[A-Za-z0-9.-]+$/, 'Il ticker può contenere solo lettere, numeri, punti e trattini'),
  
  name: z
    .string()
    .min(1, 'Il nome è obbligatorio')
    .max(100, 'Il nome non può superare 100 caratteri'),
  
  type: z
    .enum(['stock', 'etf', 'bond', 'crypto', 'commodity', 'cash', 'realestate'])
    .refine((val) => ['stock', 'etf', 'bond', 'crypto', 'commodity', 'cash', 'realestate'].includes(val), {
      message: 'Tipo asset non valido. Valori ammessi: stock, etf, bond, crypto, commodity, cash, realestate'
    }),
  
  assetClass: z
    .enum(['equity', 'bonds', 'crypto', 'realestate', 'cash', 'commodity'])
    .refine((val) => ['equity', 'bonds', 'crypto', 'realestate', 'cash', 'commodity'].includes(val), {
      message: 'Classe asset non valida. Valori ammessi: equity, bonds, crypto, realestate, cash, commodity'
    }),
  
  currency: z
    .string()
    .min(3, 'La valuta deve essere di 3 caratteri (es. EUR, USD)')
    .max(3, 'La valuta deve essere di 3 caratteri (es. EUR, USD)')
    .regex(/^[A-Z]{3}$/, 'La valuta deve essere in formato ISO (es. EUR, USD)'),
  
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La data deve essere in formato YYYY-MM-DD (es. 2024-01-15)')
    .transform((dateStr) => {
      const date = new Date(dateStr + 'T12:00:00'); // Add time to avoid timezone issues
      if (isNaN(date.getTime())) {
        throw new Error('Data non valida');
      }
      return date;
    }),
  
  quantity: z
    .number()
    .positive('La quantità deve essere positiva')
    .max(1000000000, 'La quantità è troppo elevata'),
  
  price: z
    .number()
    .positive('Il prezzo deve essere positivo')
    .max(1000000, 'Il prezzo è troppo elevato'),
  
  transactionType: z
    .enum(['buy', 'sell'])
    .refine((val) => ['buy', 'sell'].includes(val), {
      message: 'Tipo transazione non valido. Valori ammessi: buy, sell'
    }),
  
  fees: z
    .number()
    .min(0, 'Le commissioni non possono essere negative')
    .max(100000, 'Le commissioni sono troppo elevate')
    .optional(),
  
  notes: z
    .string()
    .max(500, 'Le note non possono superare 500 caratteri')
    .optional(),
  
  isin: z
    .string()
    .regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/, 'ISIN non valido. Formato corretto: XX000000000C (es. IT0003128367)')
    .optional()
    .or(z.literal('')), // Allow empty string
  
  subCategory: z
    .string()
    .max(50, 'La sottocategoria non può superare 50 caratteri')
    .optional(),
  
  accountId: z
    .string()
    .min(1, 'L\'ID account non può essere vuoto se specificato')
    .max(50, 'L\'ID account non può superare 50 caratteri')
    .optional()
    .or(z.literal('')), // Allow empty string
});

/**
 * Parse and validate CSV content to transactions
 * 
 * @param csvContent - Raw CSV file content as string
 * @returns Object with valid transactions and validation errors
 */
export function validateTransactionsFromCSV(csvContent: string): {
  transactions: AssetTransaction[];
  errors: TransactionValidationError[];
} {
  const transactions: AssetTransaction[] = [];
  const errors: TransactionValidationError[] = [];

  // Parse CSV
  const lines = csvContent.trim().split('\n');
  
  if (lines.length < 2) {
    errors.push({
      row: 1,
      message: 'Il file CSV deve contenere almeno una riga di intestazioni e una riga di dati',
      rawData: csvContent
    });
    return { transactions, errors };
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  // Validate required headers
  const requiredHeaders = ['ticker', 'name', 'type', 'assetclass', 'currency', 'date', 'quantity', 'price', 'transactiontype'];
  const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
  
  if (missingHeaders.length > 0) {
    errors.push({
      row: 1,
      message: `Intestazioni mancanti nel CSV: ${missingHeaders.join(', ')}`,
      rawData: headers
    });
    return { transactions, errors };
  }

  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const line = lines[i].trim();
    
    if (!line) continue; // Skip empty lines
    
    try {
      const values = parseCSVRow(line);
      const rawTransaction = mapCSVToRawTransaction(headers, values);
      const validatedTransaction = validateSingleTransaction(rawTransaction);
      transactions.push(validatedTransaction);
    } catch (error: any) {
      errors.push({
        row: rowNumber,
        message: error.message || 'Errore sconosciuto nella validazione',
        rawData: line
      });
    }
  }

  return { transactions, errors };
}

/**
 * Parse a single CSV row handling quoted values and commas
 * 
 * @param row - CSV row string
 * @returns Array of column values
 */
function parseCSVRow(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim()); // Add the last value
  return values;
}

/**
 * Map CSV values to raw transaction object
 * 
 * @param headers - CSV headers array
 * @param values - CSV values array
 * @returns Raw transaction object
 */
function mapCSVToRawTransaction(headers: string[], values: string[]): AssetTransactionRaw {
  const transaction: any = {};
  
  headers.forEach((header, index) => {
    const value = values[index]?.trim() || '';
    
    switch (header) {
      case 'ticker':
        transaction.ticker = value;
        break;
      case 'name':
        transaction.name = value;
        break;
      case 'type':
        transaction.type = value as AssetType;
        break;
      case 'assetclass':
        transaction.assetClass = value as AssetClass;
        break;
      case 'currency':
        transaction.currency = value.toUpperCase();
        break;
      case 'date':
        transaction.date = value;
        break;
      case 'quantity':
        transaction.quantity = parseFloat(value);
        break;
      case 'price':
        transaction.price = parseFloat(value);
        break;
      case 'transactiontype':
        transaction.transactionType = value;
        break;
      case 'fees':
        transaction.fees = value ? parseFloat(value) : undefined;
        break;
      case 'notes':
        transaction.notes = value || undefined;
        break;
      case 'isin':
        transaction.isin = value || undefined;
        break;
      case 'subcategory':
        transaction.subCategory = value || undefined;
        break;
      case 'accountid':
        transaction.accountId = value || undefined;
        break;
    }
  });

  return transaction as AssetTransactionRaw;
}

/**
 * Validate a single transaction using Zod schema
 * 
 * @param rawTransaction - Raw transaction data from CSV
 * @returns Validated transaction object
 */
function validateSingleTransaction(rawTransaction: AssetTransactionRaw): AssetTransaction {
  const result = transactionSchema.safeParse(rawTransaction);
  
  if (!result.success) {
    const firstError = result.error.issues[0];
    const field = firstError.path.join('.');
    throw new Error(`Campo "${field}": ${firstError.message}`);
  }
  
  return result.data;
}

/**
 * Validate asset type/class compatibility
 * 
 * @param transactions - Array of transactions to validate
 * @returns Array of compatibility errors
 */
export function validateAssetTypeClassCompatibility(transactions: AssetTransaction[]): TransactionValidationError[] {
  const errors: TransactionValidationError[] = [];
  const compatibilityMap: Record<AssetType, AssetClass[]> = {
    stock: ['equity'],
    etf: ['equity', 'bonds'], // ETFs can be equity or bond ETFs
    bond: ['bonds'],
    crypto: ['crypto'],
    commodity: ['commodity'],
    cash: ['cash'],
    realestate: ['realestate'],
  };

  transactions.forEach((transaction, index) => {
    const validClasses = compatibilityMap[transaction.type];
    if (!validClasses.includes(transaction.assetClass)) {
      errors.push({
        row: index + 2, // +2 because index is 0-based and we skip header row
        field: 'assetClass',
        message: `Tipo asset "${transaction.type}" non è compatibile con classe "${transaction.assetClass}". Classi valide: ${validClasses.join(', ')}`,
        rawData: transaction
      });
    }
  });

  return errors;
}

/**
 * Generate CSV template with headers and example data
 * 
 * @returns CSV template string
 */
export function generateCSVTemplate(): string {
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
    'subCategory',
    'accountId',
    'notes'
  ].join(',');

  const examples = [
    'VWCE.DE,"Vanguard FTSE All-World",etf,equity,EUR,2024-01-15,100,85.50,buy,2.50,IE00B3RBWM25,,account-123,"Primo acquisto ETF mondo"',
    'AAPL,"Apple Inc",stock,equity,USD,2024-02-01,25,180.25,buy,5.00,US0378331005,US Stocks,account-456,"Acquisto tech stock"',
    'BTP-2025,"BTP 2.45% Scadenza 2025",bond,bonds,EUR,2024-01-30,10,1020.50,buy,10.00,IT0005083057,,account-123,"Obbligazione statale italiana"',
    'AAPL,"Apple Inc",stock,equity,USD,2024-06-01,10,220.50,sell,5.00,US0378331005,US Stocks,account-456,"Vendita parziale per profit taking"'
  ];

  return headers + '\n' + examples.join('\n');
}