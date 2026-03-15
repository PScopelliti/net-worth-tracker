import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getUserAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  createDefaultAccount,
  migrateAssetsToAccount,
} from '@/lib/services/accountService';
import {
  Account,
  AccountFormData,
  AccountType,
  ACCOUNT_CONSTANTS,
} from '@/types/accounts';

// Mock Firebase
const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
const mockAddDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockTimestamp = {
  now: vi.fn(() => ({ toDate: () => new Date('2024-01-15T10:00:00Z') })),
  fromDate: vi.fn((date) => ({ toDate: () => date })),
};

vi.mock('@/lib/firebase/config', () => ({
  db: 'mockDb',
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  getDocs: mockGetDocs,
  getDoc: mockGetDoc,
  addDoc: mockAddDoc,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  query: mockQuery,
  where: mockWhere,
  orderBy: mockOrderBy,
  Timestamp: mockTimestamp,
}));

describe('Account Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockCollection.mockReturnValue('mockCollection');
    mockDoc.mockReturnValue({ id: 'mockDocId' });
    mockQuery.mockReturnValue('mockQuery');
    mockWhere.mockReturnValue('mockWhere');
    mockOrderBy.mockReturnValue('mockOrderBy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUserAccounts', () => {
    it('should return all active accounts by default', async () => {
      const mockAccounts = [
        {
          id: 'account1',
          name: 'Directa',
          type: 'broker' as AccountType,
          userId: 'user1',
          isDefault: true,
          status: 'active',
          currency: 'EUR',
          sortOrder: 1,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        {
          id: 'account2',
          name: 'Fineco',
          type: 'broker' as AccountType,
          userId: 'user1',
          isDefault: false,
          status: 'inactive', // This should be filtered out
          currency: 'EUR',
          sortOrder: 2,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        },
      ];

      const mockSnapshot = {
        docs: mockAccounts.map((account) => ({
          id: account.id,
          data: () => ({
            ...account,
            createdAt: { toDate: () => account.createdAt },
            updatedAt: { toDate: () => account.updatedAt },
          }),
        })),
      };

      mockGetDocs.mockResolvedValue(mockSnapshot);

      const result = await getUserAccounts('user1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Directa');
      expect(result[0].status).toBe('active');
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should return all accounts when includeInactive is true', async () => {
      const mockSnapshot = {
        docs: [
          {
            id: 'account1',
            data: () => ({
              name: 'Active Account',
              status: 'active',
              currency: 'EUR',
              sortOrder: 1,
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() },
            }),
          },
          {
            id: 'account2',
            data: () => ({
              name: 'Inactive Account',
              status: 'inactive',
              currency: 'EUR',
              sortOrder: 2,
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() },
            }),
          },
        ],
      };

      mockGetDocs.mockResolvedValue(mockSnapshot);

      const result = await getUserAccounts('user1', true);

      expect(result).toHaveLength(2);
    });

    it('should handle empty results', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });

      const result = await getUserAccounts('user1');

      expect(result).toHaveLength(0);
    });

    it('should handle errors gracefully', async () => {
      mockGetDocs.mockRejectedValue(new Error('Firestore error'));

      await expect(getUserAccounts('user1')).rejects.toThrow('Failed to fetch accounts');
    });
  });

  describe('getAccountById', () => {
    it('should return account when found', async () => {
      const mockAccount = {
        name: 'Test Account',
        type: 'broker' as AccountType,
        status: 'active',
        currency: 'EUR',
        sortOrder: 1,
        createdAt: { toDate: () => new Date('2024-01-01') },
        updatedAt: { toDate: () => new Date('2024-01-01') },
      };

      const mockDocSnapshot = {
        exists: () => true,
        id: 'account1',
        data: () => mockAccount,
      };

      mockGetDoc.mockResolvedValue(mockDocSnapshot);

      const result = await getAccountById('account1');

      expect(result).toBeTruthy();
      expect(result?.name).toBe('Test Account');
      expect(result?.id).toBe('account1');
    });

    it('should return null when account not found', async () => {
      const mockDocSnapshot = {
        exists: () => false,
      };

      mockGetDoc.mockResolvedValue(mockDocSnapshot);

      const result = await getAccountById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('createAccount', () => {
    it('should create account successfully', async () => {
      const accountData: AccountFormData = {
        name: 'New Account',
        type: 'broker',
        provider: 'Directa',
        description: 'Test description',
        status: 'active',
        currency: 'EUR',
        isDefault: false,
        sortOrder: 1,
      };

      const mockDocRef = { id: 'newAccountId' };
      mockAddDoc.mockResolvedValue(mockDocRef);

      const result = await createAccount('user1', accountData);

      expect(result).toBe('newAccountId');
      expect(mockAddDoc).toHaveBeenCalledWith('mockCollection', expect.objectContaining({
        name: 'New Account',
        type: 'broker',
        userId: 'user1',
        status: 'active',
        isDefault: false,
      }));
    });

    it('should handle default account creation correctly', async () => {
      const accountData: AccountFormData = {
        name: 'Default Account',
        type: 'broker',
        status: 'active',
        currency: 'EUR',
        isDefault: true,
        sortOrder: 1,
      };

      // Mock existing accounts query
      mockGetDocs.mockResolvedValue({ docs: [] });
      mockAddDoc.mockResolvedValue({ id: 'defaultAccountId' });

      const result = await createAccount('user1', accountData);

      expect(result).toBe('defaultAccountId');
    });

    it('should prevent multiple default accounts', async () => {
      const accountData: AccountFormData = {
        name: 'Second Default',
        type: 'broker',
        status: 'active',
        currency: 'EUR',
        isDefault: true,
        sortOrder: 1,
      };

      // Mock existing default account
      const existingDefault = {
        docs: [{
          id: 'existing',
          data: () => ({ isDefault: true, status: 'active' }),
        }],
      };
      mockGetDocs.mockResolvedValue(existingDefault);

      await expect(createAccount('user1', accountData)).rejects.toThrow(
        'Esiste già un account predefinito'
      );
    });
  });

  describe('updateAccount', () => {
    it('should update account successfully', async () => {
      const updates = {
        name: 'Updated Name',
        description: 'Updated description',
      };

      await updateAccount('account1', updates, 'user1');

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { id: 'mockDocId' },
        expect.objectContaining({
          ...updates,
          updatedAt: expect.any(Object),
        })
      );
    });

    it('should handle making account default', async () => {
      // Mock no existing default
      mockGetDocs.mockResolvedValue({ docs: [] });

      const updates = { isDefault: true };

      await updateAccount('account1', updates, 'user1');

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { id: 'mockDocId' },
        expect.objectContaining({ isDefault: true })
      );
    });

    it('should prevent multiple default accounts on update', async () => {
      // Mock existing default account
      const existingDefault = {
        docs: [{
          id: 'other-account',
          data: () => ({ isDefault: true }),
        }],
      };
      mockGetDocs.mockResolvedValue(existingDefault);

      const updates = { isDefault: true };

      await expect(updateAccount('account1', updates, 'user1')).rejects.toThrow(
        'Esiste già un account predefinito'
      );
    });
  });

  describe('deleteAccount', () => {
    it('should soft delete account when it has assets', async () => {
      // Mock account with assets
      const mockAssetsSnapshot = {
        size: 2, // Has assets
      };
      mockGetDocs.mockResolvedValue(mockAssetsSnapshot);

      await deleteAccount('account1', 'user1');

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { id: 'mockDocId' },
        expect.objectContaining({
          status: 'deleted',
          deletedAt: expect.any(Object),
        })
      );
    });

    it('should prevent deleting default account', async () => {
      // Mock default account
      const mockAccountSnapshot = {
        exists: () => true,
        data: () => ({ isDefault: true }),
      };
      mockGetDoc.mockResolvedValue(mockAccountSnapshot);

      await expect(deleteAccount('account1', 'user1')).rejects.toThrow(
        'Non è possibile eliminare l\'account predefinito'
      );
    });
  });

  describe('createDefaultAccount', () => {
    it('should create default account with correct properties', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] }); // No existing accounts
      mockAddDoc.mockResolvedValue({ id: 'defaultId' });

      const result = await createDefaultAccount('user1');

      expect(result).toBe('defaultId');
      expect(mockAddDoc).toHaveBeenCalledWith('mockCollection', expect.objectContaining({
        name: ACCOUNT_CONSTANTS.DEFAULT_ACCOUNT_NAME,
        type: 'other',
        isDefault: true,
        status: 'active',
        userId: 'user1',
      }));
    });

    it('should not create default if one already exists', async () => {
      // Mock existing default
      const existingDefault = {
        docs: [{ id: 'existing-default' }],
      };
      mockGetDocs.mockResolvedValue(existingDefault);

      await expect(createDefaultAccount('user1')).rejects.toThrow(
        'Un account predefinito esiste già'
      );
    });
  });

  describe('migrateAssetsToAccount', () => {
    it('should migrate assets without accountId to specified account', async () => {
      // Mock assets without accountId
      const assetsToMigrate = [
        { id: 'asset1' },
        { id: 'asset2' },
      ];
      mockGetDocs.mockResolvedValue({ docs: assetsToMigrate });

      const result = await migrateAssetsToAccount('user1', 'targetAccount');

      expect(result.migratedAssetCount).toBe(2);
      expect(result.skippedAssetCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    });

    it('should handle migration errors gracefully', async () => {
      const assetsToMigrate = [{ id: 'asset1' }];
      mockGetDocs.mockResolvedValue({ docs: assetsToMigrate });
      
      // Mock update failure
      mockUpdateDoc.mockRejectedValueOnce(new Error('Update failed'));

      const result = await migrateAssetsToAccount('user1', 'targetAccount');

      expect(result.migratedAssetCount).toBe(0);
      expect(result.skippedAssetCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Update failed');
    });
  });

  describe('Input Validation', () => {
    it('should validate account name length', async () => {
      const accountData: AccountFormData = {
        name: '', // Empty name
        type: 'broker',
        status: 'active',
        currency: 'EUR',
        isDefault: false,
        sortOrder: 1,
      };

      await expect(createAccount('user1', accountData)).rejects.toThrow();
    });

    it('should validate account type', async () => {
      const accountData = {
        name: 'Valid Name',
        type: 'invalid-type' as AccountType,
        status: 'active' as const,
        currency: 'EUR',
        isDefault: false,
        sortOrder: 1,
      };

      await expect(createAccount('user1', accountData)).rejects.toThrow();
    });
  });

  describe('ACCOUNT_CONSTANTS', () => {
    it('should have correct default values', () => {
      expect(ACCOUNT_CONSTANTS.DEFAULT_ACCOUNT_NAME).toBe('Account Principale');
      expect(ACCOUNT_CONSTANTS.MAX_ACCOUNTS_PER_USER).toBe(20);
      expect(ACCOUNT_CONSTANTS.DEFAULT_CURRENCY).toBe('EUR');
      expect(ACCOUNT_CONSTANTS.ALL_ACCOUNTS_ID).toBe('__all_accounts__');
      expect(ACCOUNT_CONSTANTS.NO_ACCOUNT_ID).toBe('__no_account__');
    });
  });
});