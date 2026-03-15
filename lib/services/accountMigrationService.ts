/**
 * Account Migration Service
 * 
 * Handles automatic migration of existing assets to the new account system.
 * When a user first accesses the system after the account feature is introduced,
 * this service automatically creates a default account and assigns all existing
 * assets (with accountId = null/undefined) to this account.
 * 
 * Migration Strategy:
 * 1. Check if user has any accounts on login/app load
 * 2. If no accounts exist but assets exist → trigger migration
 * 3. Create default account
 * 4. Batch update all assets without accountId to use default account
 * 5. Store migration completion flag to prevent re-running
 * 
 * Features:
 * - Automatic detection of migration need
 * - Transparent migration (no user interaction required)
 * - Batch asset updates for performance
 * - Error handling and rollback capabilities
 * - Migration status tracking
 * - One-time execution per user
 */

import { 
  getUserAccounts, 
  createDefaultAccount, 
  migrateAssetsToAccount 
} from './accountService';
import { 
  AccountMigrationData,
  ACCOUNT_CONSTANTS 
} from '@/types/accounts';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

const MIGRATION_STATUS_COLLECTION = 'migrationStatus';

/**
 * Migration status for tracking per-user migration completion
 */
interface MigrationStatus {
  userId: string;
  accountMigrationCompleted: boolean;
  migrationDate: Date | Timestamp;
  migrationVersion: string;
  assetsProcessed: number;
  errors?: string[];
}

/**
 * Migration detection result
 */
interface MigrationCheckResult {
  needsMigration: boolean;
  reason: string;
  assetCount: number;
  accountCount: number;
}

/**
 * Check if user needs account migration
 * 
 * Migration is needed if:
 * 1. User has no accounts AND has assets
 * 2. Migration has not been completed before
 * 
 * @param userId - User ID to check
 * @returns Promise<MigrationCheckResult>
 */
export async function checkMigrationNeed(userId: string): Promise<MigrationCheckResult> {
  try {
    // Check if migration already completed
    const migrationStatus = await getMigrationStatus(userId);
    if (migrationStatus?.accountMigrationCompleted) {
      return {
        needsMigration: false,
        reason: 'Migration already completed',
        assetCount: 0,
        accountCount: 0,
      };
    }

    // Check existing accounts
    const accounts = await getUserAccounts(userId);
    const accountCount = accounts.length;

    // Check existing assets
    const assetsRef = collection(db, 'assets');
    const assetsQuery = query(assetsRef, where('userId', '==', userId));
    const assetsSnapshot = await getDocs(assetsQuery);
    const assetCount = assetsSnapshot.size;

    // Migration needed if no accounts but has assets
    const needsMigration = accountCount === 0 && assetCount > 0;

    return {
      needsMigration,
      reason: needsMigration 
        ? `User has ${assetCount} assets but no accounts`
        : accountCount > 0 
          ? 'User already has accounts'
          : 'User has no assets to migrate',
      assetCount,
      accountCount,
    };
  } catch (error) {
    console.error('Error checking migration need:', error);
    return {
      needsMigration: false,
      reason: 'Error checking migration status',
      assetCount: 0,
      accountCount: 0,
    };
  }
}

/**
 * Execute automatic account migration for user
 * 
 * Creates default account and migrates all assets without accountId.
 * This function is idempotent - safe to run multiple times.
 * 
 * @param userId - User ID to migrate
 * @returns Promise<AccountMigrationData>
 */
export async function executeAccountMigration(userId: string): Promise<AccountMigrationData> {
  const migrationStartTime = new Date();
  
  try {
    console.log(`Starting account migration for user: ${userId}`);

    // Double-check migration need to prevent unnecessary operations
    const migrationCheck = await checkMigrationNeed(userId);
    if (!migrationCheck.needsMigration) {
      console.log(`Migration skipped for user ${userId}: ${migrationCheck.reason}`);
      return {
        defaultAccountId: '',
        migratedAssetCount: 0,
        skippedAssetCount: 0,
        errors: [migrationCheck.reason],
      };
    }

    // Step 1: Create default account
    console.log(`Creating default account for user: ${userId}`);
    const defaultAccountId = await createDefaultAccount(userId);
    
    // Step 2: Migrate assets to default account
    console.log(`Migrating ${migrationCheck.assetCount} assets to account: ${defaultAccountId}`);
    const migrationResult = await migrateAssetsToAccount(userId, defaultAccountId);

    // Step 3: Record migration completion
    await setMigrationStatus(userId, {
      userId,
      accountMigrationCompleted: true,
      migrationDate: Timestamp.fromDate(migrationStartTime),
      migrationVersion: '1.0',
      assetsProcessed: migrationResult.migratedAssetCount,
      errors: migrationResult.errors.length > 0 ? migrationResult.errors : undefined,
    });

    console.log(`Account migration completed for user: ${userId}`, migrationResult);
    return migrationResult;

  } catch (error: any) {
    console.error(`Account migration failed for user: ${userId}`, error);
    
    // Record failed migration attempt
    try {
      await setMigrationStatus(userId, {
        userId,
        accountMigrationCompleted: false,
        migrationDate: Timestamp.fromDate(migrationStartTime),
        migrationVersion: '1.0',
        assetsProcessed: 0,
        errors: [error.message || 'Unknown migration error'],
      });
    } catch (statusError) {
      console.error('Failed to record migration failure status:', statusError);
    }

    throw new Error(`Migration failed: ${error.message}`);
  }
}

/**
 * Get migration status for user
 * 
 * @param userId - User ID
 * @returns Promise<MigrationStatus | null>
 */
async function getMigrationStatus(userId: string): Promise<MigrationStatus | null> {
  try {
    const statusRef = doc(db, MIGRATION_STATUS_COLLECTION, userId);
    const statusDoc = await getDoc(statusRef);

    if (!statusDoc.exists()) {
      return null;
    }

    const data = statusDoc.data();
    return {
      ...data,
      migrationDate: data.migrationDate?.toDate() || new Date(),
    } as MigrationStatus;
  } catch (error) {
    console.error('Error getting migration status:', error);
    return null;
  }
}

/**
 * Set migration status for user
 * 
 * @param userId - User ID
 * @param status - Migration status to save
 */
async function setMigrationStatus(userId: string, status: MigrationStatus): Promise<void> {
  try {
    const statusRef = doc(db, MIGRATION_STATUS_COLLECTION, userId);
    await setDoc(statusRef, {
      ...status,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error setting migration status:', error);
    throw error;
  }
}

/**
 * Force reset migration status (for testing/admin purposes)
 * 
 * @param userId - User ID
 */
export async function resetMigrationStatus(userId: string): Promise<void> {
  try {
    const statusRef = doc(db, MIGRATION_STATUS_COLLECTION, userId);
    await setDoc(statusRef, {
      userId,
      accountMigrationCompleted: false,
      migrationDate: Timestamp.now(),
      migrationVersion: '1.0',
      assetsProcessed: 0,
      resetAt: Timestamp.now(),
    });
    
    console.log(`Migration status reset for user: ${userId}`);
  } catch (error) {
    console.error('Error resetting migration status:', error);
    throw error;
  }
}

/**
 * Get migration summary for admin/debugging
 * 
 * @param userId - User ID
 * @returns Promise<object> Migration summary
 */
export async function getMigrationSummary(userId: string): Promise<{
  migrationStatus: MigrationStatus | null;
  migrationCheck: MigrationCheckResult;
  currentAccounts: number;
  totalAssets: number;
  assetsWithoutAccount: number;
}> {
  try {
    const [migrationStatus, migrationCheck, accounts] = await Promise.all([
      getMigrationStatus(userId),
      checkMigrationNeed(userId),
      getUserAccounts(userId, true), // Include inactive accounts
    ]);

    // Count assets without account
    const assetsRef = collection(db, 'assets');
    const assetsWithoutAccountQuery = query(
      assetsRef,
      where('userId', '==', userId),
      where('accountId', '==', null)
    );
    const assetsWithoutAccountSnapshot = await getDocs(assetsWithoutAccountQuery);

    return {
      migrationStatus,
      migrationCheck,
      currentAccounts: accounts.length,
      totalAssets: migrationCheck.assetCount,
      assetsWithoutAccount: assetsWithoutAccountSnapshot.size,
    };
  } catch (error) {
    console.error('Error getting migration summary:', error);
    throw error;
  }
}

/**
 * Migration Hook Types
 */
export interface MigrationHookResult {
  needsMigration: boolean;
  isLoading: boolean;
  isMigrating: boolean;
  migrationCompleted: boolean;
  migrationError: string | null;
  triggerMigration: () => Promise<void>;
  migrationData: AccountMigrationData | null;
}

/**
 * Auto-trigger migration based on app lifecycle
 * 
 * This function should be called early in the app lifecycle (e.g., AuthContext)
 * to automatically handle migration without user intervention.
 * 
 * @param userId - User ID
 * @returns Promise<boolean> - true if migration was needed and executed
 */
export async function autoTriggerMigrationIfNeeded(userId: string): Promise<boolean> {
  try {
    const migrationCheck = await checkMigrationNeed(userId);
    
    if (migrationCheck.needsMigration) {
      console.log(`Auto-triggering migration for user: ${userId}`);
      await executeAccountMigration(userId);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Auto-migration failed:', error);
    // Don't throw - let the app continue functioning
    return false;
  }
}