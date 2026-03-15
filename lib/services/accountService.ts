import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { 
  Account, 
  AccountFormData, 
  AccountSummary,
  AccountMetrics,
  AccountMigrationData,
  ACCOUNT_CONSTANTS 
} from '@/types/accounts';
import { Asset } from '@/types/assets';
import { calculateAssetValue, calculateUnrealizedGains } from './assetService';

const ACCOUNTS_COLLECTION = 'accounts';
const ASSETS_COLLECTION = 'assets';

/**
 * Account Service
 * 
 * Manages investment accounts for organizing assets by broker, bank, or other providers.
 * Supports CRUD operations, default account management, and aggregated metrics.
 * 
 * Features:
 * - Multi-account portfolio organization
 * - Default account management
 * - Account-level metrics and summaries
 * - Migration support for existing assets
 * - Soft delete with status management
 */

/**
 * Create a new account
 * 
 * @param userId - User ID
 * @param accountData - Account form data
 * @returns Promise<string> - Created account ID
 */
export async function createAccount(
  userId: string,
  accountData: AccountFormData
): Promise<string> {
  try {
    const now = Timestamp.now();
    const accountsRef = collection(db, ACCOUNTS_COLLECTION);

    // Validate account limit
    const existingAccounts = await getUserAccounts(userId);
    if (existingAccounts.length >= ACCOUNT_CONSTANTS.MAX_ACCOUNTS_PER_USER) {
      throw new Error(`Limite massimo di ${ACCOUNT_CONSTANTS.MAX_ACCOUNTS_PER_USER} account raggiunto`);
    }

    // If this is set as default, unset current default
    if (accountData.isDefault) {
      await unsetCurrentDefault(userId);
    }

    // If no accounts exist, make this the default regardless of user input
    const shouldBeDefault = existingAccounts.length === 0 || accountData.isDefault;

    // Build account object manually to avoid undefined values in Firestore
    const newAccount: any = {
      userId,
      name: accountData.name.trim(),
      type: accountData.type,
      status: accountData.status,
      currency: accountData.currency,
      isDefault: shouldBeDefault,
      sortOrder: accountData.sortOrder,
      taxOptimized: accountData.taxOptimized || false,
      allowsMargin: accountData.allowsMargin || false,
      allowsOptions: accountData.allowsOptions || false,
      allowsCrypto: accountData.allowsCrypto || false,
      createdAt: now,
      updatedAt: now,
    };

    // Only add optional fields if they have values
    if (accountData.description?.trim()) {
      newAccount.description = accountData.description.trim();
    }
    if (accountData.provider?.trim()) {
      newAccount.provider = accountData.provider.trim();
    }
    if (accountData.accountNumber?.trim()) {
      newAccount.accountNumber = accountData.accountNumber.trim();
    }

    const docRef = await addDoc(accountsRef, newAccount);
    console.log(`Account created: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('Error creating account:', error);
    throw new Error('Errore nella creazione dell\'account');
  }
}

/**
 * Get all accounts for a user, sorted by sortOrder and name
 * 
 * @param userId - User ID
 * @param includeInactive - Include inactive/closed accounts
 * @returns Promise<Account[]>
 */
export async function getUserAccounts(
  userId: string,
  includeInactive: boolean = false
): Promise<Account[]> {
  try {
    const accountsRef = collection(db, ACCOUNTS_COLLECTION);
    let q = query(
      accountsRef,
      where('userId', '==', userId),
      orderBy('sortOrder', 'asc'),
      orderBy('name', 'asc')
    );

    const querySnapshot = await getDocs(q);
    
    const accounts = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Account[];

    // Filter by status if needed
    if (!includeInactive) {
      return accounts.filter(account => account.status === 'active');
    }

    return accounts;
  } catch (error) {
    console.error('Error getting user accounts:', error);
    throw new Error('Errore nel recupero degli account');
  }
}

/**
 * Get account by ID
 * 
 * @param accountId - Account ID
 * @returns Promise<Account | null>
 */
export async function getAccountById(accountId: string): Promise<Account | null> {
  try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    const accountDoc = await getDoc(accountRef);

    if (!accountDoc.exists()) {
      return null;
    }

    return {
      id: accountDoc.id,
      ...accountDoc.data(),
      createdAt: accountDoc.data().createdAt?.toDate() || new Date(),
      updatedAt: accountDoc.data().updatedAt?.toDate() || new Date(),
    } as Account;
  } catch (error) {
    console.error('Error getting account:', error);
    throw new Error('Errore nel recupero dell\'account');
  }
}

/**
 * Update an existing account
 * 
 * @param accountId - Account ID
 * @param updates - Partial account data to update
 * @param userId - User ID for validation
 * @returns Promise<void>
 */
export async function updateAccount(
  accountId: string,
  updates: Partial<AccountFormData>,
  userId: string
): Promise<void> {
  try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    
    // Verify account exists and belongs to user
    const existingAccount = await getAccountById(accountId);
    if (!existingAccount || existingAccount.userId !== userId) {
      throw new Error('Account non trovato o non autorizzato');
    }

    // If setting as default, unset current default
    if (updates.isDefault) {
      await unsetCurrentDefault(userId);
    }

    // Prepare update data
    const updateData: any = {
      ...updates,
      updatedAt: Timestamp.now(),
    };

    // Trim string fields
    if (updates.name) updateData.name = updates.name.trim();
    if (updates.description) updateData.description = updates.description.trim();
    if (updates.provider) updateData.provider = updates.provider.trim();
    if (updates.accountNumber) updateData.accountNumber = updates.accountNumber.trim();

    // Remove undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    await updateDoc(accountRef, updateData);
    console.log(`Account updated: ${accountId}`);
  } catch (error) {
    console.error('Error updating account:', error);
    throw new Error('Errore nell\'aggiornamento dell\'account');
  }
}

/**
 * Delete an account (soft delete by setting status to 'closed')
 * Only allows deletion if no assets are assigned to the account
 * 
 * @param accountId - Account ID
 * @param userId - User ID for validation
 * @returns Promise<void>
 */
export async function deleteAccount(accountId: string, userId: string): Promise<void> {
  try {
    // Verify account exists and belongs to user
    const existingAccount = await getAccountById(accountId);
    if (!existingAccount || existingAccount.userId !== userId) {
      throw new Error('Account non trovato o non autorizzato');
    }

    // Check if account has assets
    const assetsRef = collection(db, ASSETS_COLLECTION);
    const assetsQuery = query(
      assetsRef,
      where('userId', '==', userId),
      where('accountId', '==', accountId),
      limit(1)
    );
    const assetsSnapshot = await getDocs(assetsQuery);

    if (!assetsSnapshot.empty) {
      throw new Error('Impossibile eliminare account con asset associati. Sposta prima gli asset su un altro account.');
    }

    // Prevent deletion of default account if it's the only account
    if (existingAccount.isDefault) {
      const allAccounts = await getUserAccounts(userId, true);
      const activeAccounts = allAccounts.filter(a => a.status === 'active' && a.id !== accountId);
      
      if (activeAccounts.length === 0) {
        throw new Error('Impossibile eliminare l\'ultimo account attivo.');
      }

      // Set another account as default
      const newDefaultAccount = activeAccounts[0];
      await updateAccount(newDefaultAccount.id, { isDefault: true }, userId);
    }

    // Soft delete by setting status to closed
    await updateAccount(accountId, { status: 'closed' }, userId);
    console.log(`Account deleted (soft): ${accountId}`);
  } catch (error) {
    console.error('Error deleting account:', error);
    throw error; // Re-throw to preserve specific error messages
  }
}

/**
 * Get default account for a user
 * 
 * @param userId - User ID
 * @returns Promise<Account | null>
 */
export async function getDefaultAccount(userId: string): Promise<Account | null> {
  try {
    const accounts = await getUserAccounts(userId);
    return accounts.find(account => account.isDefault) || null;
  } catch (error) {
    console.error('Error getting default account:', error);
    throw new Error('Errore nel recupero dell\'account predefinito');
  }
}

/**
 * Create default account for user migration
 * Used when adding account support to existing users
 * 
 * @param userId - User ID
 * @returns Promise<string> - Created default account ID
 */
export async function createDefaultAccount(userId: string): Promise<string> {
  try {
    const defaultAccountData: AccountFormData = {
      name: ACCOUNT_CONSTANTS.DEFAULT_ACCOUNT_NAME,
      type: 'other',
      status: 'active',
      description: 'Account predefinito creato automaticamente',
      currency: ACCOUNT_CONSTANTS.DEFAULT_CURRENCY,
      isDefault: true,
      sortOrder: 0,
    };

    return await createAccount(userId, defaultAccountData);
  } catch (error) {
    console.error('Error creating default account:', error);
    throw new Error('Errore nella creazione dell\'account predefinito');
  }
}

/**
 * Migrate existing assets to default account
 * Used when adding account support to existing users
 * 
 * @param userId - User ID
 * @param defaultAccountId - Default account ID
 * @returns Promise<AccountMigrationData>
 */
export async function migrateAssetsToAccount(
  userId: string,
  defaultAccountId: string
): Promise<AccountMigrationData> {
  try {
    const assetsRef = collection(db, ASSETS_COLLECTION);
    const assetsQuery = query(
      assetsRef,
      where('userId', '==', userId),
      where('accountId', '==', undefined) // Assets without accountId
    );
    
    const assetsSnapshot = await getDocs(assetsQuery);
    
    let migratedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Batch update assets
    for (const assetDoc of assetsSnapshot.docs) {
      try {
        const assetRef = doc(db, ASSETS_COLLECTION, assetDoc.id);
        await updateDoc(assetRef, {
          accountId: defaultAccountId,
          updatedAt: Timestamp.now(),
        });
        migratedCount++;
      } catch (error: any) {
        skippedCount++;
        errors.push(`Asset ${assetDoc.id}: ${error.message}`);
      }
    }

    console.log(`Migration completed: ${migratedCount} migrated, ${skippedCount} skipped`);

    return {
      defaultAccountId,
      migratedAssetCount: migratedCount,
      skippedAssetCount: skippedCount,
      errors,
    };
  } catch (error) {
    console.error('Error migrating assets:', error);
    throw new Error('Errore nella migrazione degli asset');
  }
}

/**
 * Get account summary with aggregated metrics
 * 
 * @param accountId - Account ID
 * @param assets - Array of assets for the account
 * @returns AccountSummary
 */
export function calculateAccountSummary(
  account: Account,
  assets: Asset[]
): AccountSummary {
  const accountAssets = assets.filter(asset => asset.accountId === account.id);
  
  const totalValue = accountAssets.reduce((sum, asset) => sum + calculateAssetValue(asset), 0);
  const liquidValue = accountAssets
    .filter(asset => asset.isLiquid !== false)
    .reduce((sum, asset) => sum + calculateAssetValue(asset), 0);
  const illiquidValue = totalValue - liquidValue;

  // Calculate gains/losses
  const assetsWithCostBasis = accountAssets.filter(asset => asset.averageCost);
  const totalGainLoss = assetsWithCostBasis.reduce((sum, asset) => sum + calculateUnrealizedGains(asset), 0);
  const totalCostBasis = assetsWithCostBasis.reduce((sum, asset) => sum + (asset.quantity * asset.averageCost!), 0);
  const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

  // Asset class allocation
  const assetAllocation: { [key: string]: { value: number; percentage: number } } = {};
  accountAssets.forEach(asset => {
    const value = calculateAssetValue(asset);
    if (!assetAllocation[asset.assetClass]) {
      assetAllocation[asset.assetClass] = { value: 0, percentage: 0 };
    }
    assetAllocation[asset.assetClass].value += value;
  });

  // Calculate percentages
  Object.keys(assetAllocation).forEach(assetClass => {
    assetAllocation[assetClass].percentage = totalValue > 0 
      ? (assetAllocation[assetClass].value / totalValue) * 100 
      : 0;
  });

  // Top 5 assets by value
  const topAssets = accountAssets
    .map(asset => ({
      ticker: asset.ticker,
      name: asset.name,
      value: calculateAssetValue(asset),
      percentage: totalValue > 0 ? (calculateAssetValue(asset) / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    account,
    assetCount: accountAssets.length,
    totalValue,
    liquidValue,
    illiquidValue,
    totalGainLoss,
    totalGainLossPercent,
    assetAllocation,
    topAssets,
    lastUpdated: new Date(),
  };
}

/**
 * Get comprehensive account metrics for dashboard
 * 
 * @param userId - User ID
 * @param assets - All user assets
 * @returns Promise<AccountMetrics>
 */
export async function getAccountMetrics(userId: string, assets: Asset[]): Promise<AccountMetrics> {
  try {
    const accounts = await getUserAccounts(userId);
    const defaultAccount = await getDefaultAccount(userId);

    const byAccount: { [accountId: string]: AccountSummary } = {};
    
    // Calculate metrics for each account
    for (const account of accounts) {
      byAccount[account.id] = calculateAccountSummary(account, assets);
    }

    const totalValue = Object.values(byAccount).reduce((sum, summary) => sum + summary.totalValue, 0);
    const totalAssets = Object.values(byAccount).reduce((sum, summary) => sum + summary.assetCount, 0);

    return {
      byAccount,
      aggregated: {
        totalAccounts: accounts.length,
        totalValue,
        totalAssets,
        defaultAccountId: defaultAccount?.id || null,
      },
    };
  } catch (error) {
    console.error('Error getting account metrics:', error);
    throw new Error('Errore nel calcolo delle metriche degli account');
  }
}

/**
 * Unset current default account for a user
 * Internal helper function
 */
async function unsetCurrentDefault(userId: string): Promise<void> {
  const currentDefault = await getDefaultAccount(userId);
  if (currentDefault) {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, currentDefault.id);
    await updateDoc(accountRef, {
      isDefault: false,
      updatedAt: Timestamp.now(),
    });
  }
}

/**
 * Validate account form data
 * 
 * @param formData - Account form data
 * @returns Array of validation errors
 */
export function validateAccountFormData(formData: AccountFormData): string[] {
  const errors: string[] = [];

  if (!formData.name || formData.name.trim().length === 0) {
    errors.push('Il nome dell\'account è obbligatorio');
  }

  if (formData.name && formData.name.length > ACCOUNT_CONSTANTS.MAX_ACCOUNT_NAME_LENGTH) {
    errors.push(`Il nome dell\'account non può superare ${ACCOUNT_CONSTANTS.MAX_ACCOUNT_NAME_LENGTH} caratteri`);
  }

  if (formData.description && formData.description.length > ACCOUNT_CONSTANTS.MAX_DESCRIPTION_LENGTH) {
    errors.push(`La descrizione non può superare ${ACCOUNT_CONSTANTS.MAX_DESCRIPTION_LENGTH} caratteri`);
  }

  if (!formData.currency || formData.currency.length !== 3) {
    errors.push('La valuta deve essere un codice di 3 caratteri (es. EUR, USD)');
  }

  if (formData.sortOrder < 0) {
    errors.push('L\'ordine di visualizzazione deve essere un numero positivo');
  }

  return errors;
}