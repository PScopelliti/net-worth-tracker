import { describe, it, expect } from 'vitest';
import { aggregateTransactions, positionToAssetFormData } from '@/lib/services/transactionAggregationService';
import { AssetTransaction } from '@/types/transactions';

describe('transactionAggregationService', () => {
  describe('aggregateTransactions', () => {
    it('should aggregate multiple buy transactions for same ticker', () => {
      const transactions: AssetTransaction[] = [
        {
          ticker: 'AAPL',
          name: 'Apple Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 0, 15), // Jan 15, 2024
          quantity: 100,
          price: 150,
          transactionType: 'buy',
          fees: 5,
        },
        {
          ticker: 'AAPL',
          name: 'Apple Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 2, 15), // Mar 15, 2024
          quantity: 50,
          price: 180,
          transactionType: 'buy',
          fees: 3,
        },
      ];

      const result = aggregateTransactions(transactions);

      expect(result.positions).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      
      const position = result.positions[0];
      expect(position.ticker).toBe('AAPL');
      expect(position.quantity).toBe(150);
      expect(position.totalFees).toBe(8);
      
      // Average cost calculation: ((100 * 150) + 5) + ((50 * 180) + 3) = 15005 + 9003 = 24008
      // Total quantity: 150
      // Average cost per share: 24008 / 150 = 160.053333...
      expect(position.averageCost).toBeCloseTo(160.053333, 5);
    });

    it('should handle sell transactions with FIFO method', () => {
      const transactions: AssetTransaction[] = [
        // First buy
        {
          ticker: 'MSFT',
          name: 'Microsoft',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 0, 15),
          quantity: 100,
          price: 300,
          transactionType: 'buy',
        },
        // Second buy
        {
          ticker: 'MSFT',
          name: 'Microsoft',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 1, 15),
          quantity: 50,
          price: 320,
          transactionType: 'buy',
        },
        // Sell from first lot (FIFO)
        {
          ticker: 'MSFT',
          name: 'Microsoft',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 3, 15),
          quantity: 60,
          price: 350,
          transactionType: 'sell',
        },
      ];

      const result = aggregateTransactions(transactions);

      expect(result.positions).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      const position = result.positions[0];
      expect(position.ticker).toBe('MSFT');
      expect(position.quantity).toBe(90); // 100 + 50 - 60 = 90

      // After selling 60 shares FIFO:
      // - Sold entire first lot (100 shares at $300) - 60 shares = 40 shares at $300 remaining
      // - Second lot remains intact: 50 shares at $320
      // Total cost basis: (40 * 300) + (50 * 320) = 12000 + 16000 = 28000
      // Average cost: 28000 / 90 = 311.111...
      expect(position.averageCost).toBeCloseTo(311.111111, 5);
    });

    it('should handle partial sell from single lot', () => {
      const transactions: AssetTransaction[] = [
        {
          ticker: 'GOOGL',
          name: 'Alphabet Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 0, 15),
          quantity: 100,
          price: 2500,
          transactionType: 'buy',
        },
        {
          ticker: 'GOOGL',
          name: 'Alphabet Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 1, 15),
          quantity: 30,
          price: 2600,
          transactionType: 'sell',
        },
      ];

      const result = aggregateTransactions(transactions);

      expect(result.positions).toHaveLength(1);
      
      const position = result.positions[0];
      expect(position.quantity).toBe(70); // 100 - 30 = 70
      expect(position.averageCost).toBe(2500); // Price unchanged for single lot
    });

    it('should return null position when all shares are sold', () => {
      const transactions: AssetTransaction[] = [
        {
          ticker: 'TSLA',
          name: 'Tesla Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 0, 15),
          quantity: 50,
          price: 800,
          transactionType: 'buy',
        },
        {
          ticker: 'TSLA',
          name: 'Tesla Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 1, 15),
          quantity: 50,
          price: 850,
          transactionType: 'sell',
        },
      ];

      const result = aggregateTransactions(transactions);

      expect(result.positions).toHaveLength(0); // Position was completely sold
      expect(result.errors).toHaveLength(0);
    });

    it('should handle multiple tickers separately', () => {
      const transactions: AssetTransaction[] = [
        {
          ticker: 'AAPL',
          name: 'Apple Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 0, 15),
          quantity: 100,
          price: 150,
          transactionType: 'buy',
        },
        {
          ticker: 'MSFT',
          name: 'Microsoft',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 0, 15),
          quantity: 50,
          price: 300,
          transactionType: 'buy',
        },
      ];

      const result = aggregateTransactions(transactions);

      expect(result.positions).toHaveLength(2);
      expect(result.summary.uniqueTickers).toBe(2);
      
      const aaplPosition = result.positions.find(p => p.ticker === 'AAPL');
      const msftPosition = result.positions.find(p => p.ticker === 'MSFT');
      
      expect(aaplPosition).toBeDefined();
      expect(aaplPosition?.quantity).toBe(100);
      expect(aaplPosition?.averageCost).toBe(150);
      
      expect(msftPosition).toBeDefined();
      expect(msftPosition?.quantity).toBe(50);
      expect(msftPosition?.averageCost).toBe(300);
    });

    it('should include fees in cost basis calculation', () => {
      const transactions: AssetTransaction[] = [
        {
          ticker: 'VWCE.DE',
          name: 'Vanguard FTSE All-World',
          type: 'etf',
          assetClass: 'equity',
          currency: 'EUR',
          date: new Date(2024, 0, 15),
          quantity: 100,
          price: 85.50,
          transactionType: 'buy',
          fees: 2.50,
        },
      ];

      const result = aggregateTransactions(transactions);

      expect(result.positions).toHaveLength(1);
      
      const position = result.positions[0];
      expect(position.quantity).toBe(100);
      expect(position.totalFees).toBe(2.50);
      
      // Average cost should include fees: (100 * 85.50 + 2.50) / 100 = 8552.50 / 100 = 85.525
      expect(position.averageCost).toBe(85.525);
    });

    it('should handle case-insensitive ticker grouping', () => {
      const transactions: AssetTransaction[] = [
        {
          ticker: 'aapl',
          name: 'Apple Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 0, 15),
          quantity: 50,
          price: 150,
          transactionType: 'buy',
        },
        {
          ticker: 'AAPL',
          name: 'Apple Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 1, 15),
          quantity: 50,
          price: 160,
          transactionType: 'buy',
        },
      ];

      const result = aggregateTransactions(transactions);

      expect(result.positions).toHaveLength(1);
      
      const position = result.positions[0];
      expect(position.quantity).toBe(100);
      expect(position.averageCost).toBe(155); // (50*150 + 50*160) / 100 = 155
    });

    it('should calculate correct summary statistics', () => {
      const transactions: AssetTransaction[] = [
        {
          ticker: 'AAPL',
          name: 'Apple Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 0, 15),
          quantity: 100,
          price: 150,
          transactionType: 'buy',
          fees: 5,
        },
        {
          ticker: 'MSFT',
          name: 'Microsoft',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: new Date(2024, 0, 15),
          quantity: 50,
          price: 300,
          transactionType: 'buy',
          fees: 3,
        },
      ];

      const result = aggregateTransactions(transactions);

      expect(result.summary.totalTransactions).toBe(2);
      expect(result.summary.validTransactions).toBe(2);
      expect(result.summary.invalidTransactions).toBe(0);
      expect(result.summary.uniqueTickers).toBe(2);
      expect(result.summary.totalFees).toBe(8);
    });

    it('should track transaction dates correctly', () => {
      const firstDate = new Date(2024, 0, 15);
      const lastDate = new Date(2024, 5, 15);
      
      const transactions: AssetTransaction[] = [
        {
          ticker: 'AAPL',
          name: 'Apple Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: firstDate,
          quantity: 100,
          price: 150,
          transactionType: 'buy',
        },
        {
          ticker: 'AAPL',
          name: 'Apple Inc',
          type: 'stock',
          assetClass: 'equity',
          currency: 'USD',
          date: lastDate,
          quantity: 50,
          price: 160,
          transactionType: 'buy',
        },
      ];

      const result = aggregateTransactions(transactions);

      const position = result.positions[0];
      expect(position.firstPurchaseDate).toEqual(firstDate);
      expect(position.lastTransactionDate).toEqual(lastDate);
      expect(position.transactionCount).toBe(2);
    });
  });

  describe('positionToAssetFormData', () => {
    it('should convert aggregated position to asset form data', () => {
      const position = {
        ticker: 'VWCE.DE',
        name: 'Vanguard FTSE All-World',
        type: 'etf' as const,
        assetClass: 'equity' as const,
        currency: 'EUR',
        quantity: 150,
        averageCost: 87.25,
        totalFees: 5.75,
        firstPurchaseDate: new Date(2024, 0, 15),
        lastTransactionDate: new Date(2024, 2, 15),
        transactionCount: 3,
        isin: 'IE00B3RBWM25',
      };

      const currentPrice = 95.50;
      const assetFormData = positionToAssetFormData(position, currentPrice);

      expect(assetFormData.ticker).toBe('VWCE.DE');
      expect(assetFormData.name).toBe('Vanguard FTSE All-World');
      expect(assetFormData.type).toBe('etf');
      expect(assetFormData.assetClass).toBe('equity');
      expect(assetFormData.currency).toBe('EUR');
      expect(assetFormData.quantity).toBe(150);
      expect(assetFormData.averageCost).toBe(87.25);
      expect(assetFormData.currentPrice).toBe(95.50);
      expect(assetFormData.isin).toBe('IE00B3RBWM25');
      expect(assetFormData.isLiquid).toBe(true); // ETF should be liquid
      expect(assetFormData.autoUpdatePrice).toBe(true); // ETF should auto-update
    });

    it('should set correct defaults for real estate assets', () => {
      const position = {
        ticker: 'PROPERTY-1',
        name: 'Investment Property',
        type: 'realestate' as const,
        assetClass: 'realestate' as const,
        currency: 'EUR',
        quantity: 1,
        averageCost: 250000,
        totalFees: 5000,
        firstPurchaseDate: new Date(2024, 0, 15),
        lastTransactionDate: new Date(2024, 0, 15),
        transactionCount: 1,
      };

      const assetFormData = positionToAssetFormData(position, 260000);

      expect(assetFormData.isLiquid).toBe(false); // Real estate is illiquid
      expect(assetFormData.autoUpdatePrice).toBe(false); // Real estate needs manual pricing
    });

    it('should use default price when currentPrice not provided', () => {
      const position = {
        ticker: 'CASH',
        name: 'Cash Account',
        type: 'cash' as const,
        assetClass: 'cash' as const,
        currency: 'EUR',
        quantity: 5000,
        averageCost: 1,
        totalFees: 0,
        firstPurchaseDate: new Date(2024, 0, 15),
        lastTransactionDate: new Date(2024, 0, 15),
        transactionCount: 1,
      };

      const assetFormData = positionToAssetFormData(position);

      expect(assetFormData.currentPrice).toBe(1); // Default price
    });
  });
});