/**
 * Account Selector - Filter Assets by Investment Account
 *
 * Dropdown selector component for filtering assets by investment account.
 * Used in AssetManagementTab and other asset-related views to organize
 * portfolio by broker, bank, or other account providers.
 *
 * Key Features:
 * - Account filtering with "All Accounts" option
 * - Visual indicators for default account
 * - Account management buttons (create/edit/delete)
 * - Loading states and error handling
 * - Responsive design for mobile/desktop
 * - Integration with AccountDialog for CRUD operations
 * - Support for account migration (when no accounts exist)
 *
 * Follows established patterns:
 * - Radix UI Select for styled dropdown
 * - Consistent with other filter components
 * - Italian localization
 * - Mobile-first responsive design
 */
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Account, 
  AccountOption,
  AccountFilter,
  ACCOUNT_CONSTANTS 
} from '@/types/accounts';
import { 
  getUserAccounts, 
  getDefaultAccount,
  createDefaultAccount,
  deleteAccount 
} from '@/lib/services/accountService';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AccountDialog } from '@/components/accounts/AccountDialog';
import { Plus, Settings, Trash2, Edit, ChevronDown, Building } from 'lucide-react';
import { toast } from 'sonner';

interface AccountSelectorProps {
  selectedAccountId?: string | null; // null = all accounts
  onAccountChange: (accountId: string | null) => void;
  onAccountsUpdated?: () => void; // Callback when accounts are created/updated/deleted
  className?: string;
  showManagement?: boolean; // Show account management buttons (default: true)
}

export function AccountSelector({
  selectedAccountId,
  onAccountChange,
  onAccountsUpdated,
  className = '',
  showManagement = true,
}: AccountSelectorProps) {
  const { user } = useAuth();
  
  // State management
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [migrationInProgress, setMigrationInProgress] = useState(false);

  // Load accounts on mount and user change
  useEffect(() => {
    if (user) {
      loadAccounts();
    }
  }, [user]);

  const loadAccounts = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const userAccounts = await getUserAccounts(user.uid);
      setAccounts(userAccounts);

      // If no accounts exist, offer to create default account
      if (userAccounts.length === 0) {
        await handleCreateDefaultAccount();
      } else if (!selectedAccountId && userAccounts.length > 0) {
        // Auto-select default account if none selected
        const defaultAccount = userAccounts.find(acc => acc.isDefault);
        if (defaultAccount) {
          onAccountChange(defaultAccount.id);
        }
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      toast.error('Errore nel caricamento degli account');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDefaultAccount = async () => {
    if (!user || migrationInProgress) return;

    try {
      setMigrationInProgress(true);
      const defaultAccountId = await createDefaultAccount(user.uid);
      await loadAccounts();
      onAccountChange(defaultAccountId);
      onAccountsUpdated?.();
      toast.success('Account predefinito creato automaticamente');
    } catch (error) {
      console.error('Error creating default account:', error);
      toast.error('Errore nella creazione dell\'account predefinito');
    } finally {
      setMigrationInProgress(false);
    }
  };

  const handleAccountDialogSuccess = async () => {
    await loadAccounts();
    onAccountsUpdated?.();
  };

  const handleEditAccount = (account: Account) => {
    setEditingAccount(account);
    setAccountDialogOpen(true);
  };

  const handleDeleteAccount = async (account: Account) => {
    if (!user) return;

    const confirmMessage = `Sei sicuro di voler eliminare l'account "${account.name}"?${
      account.isDefault ? '\n\nAttenzione: Questo è l\'account predefinito. Un altro account verrà automaticamente impostato come predefinito.' : ''
    }`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await deleteAccount(account.id, user.uid);
      
      // If deleted account was selected, switch to "All Accounts"
      if (selectedAccountId === account.id) {
        onAccountChange(null);
      }
      
      await loadAccounts();
      onAccountsUpdated?.();
      toast.success('Account eliminato con successo');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error(error.message || 'Errore nell\'eliminazione dell\'account');
    }
  };

  const handleCreateAccount = () => {
    setEditingAccount(null);
    setAccountDialogOpen(true);
  };

  const handleAccountDialogClose = () => {
    setAccountDialogOpen(false);
    setEditingAccount(null);
  };

  // Build account options for dropdown
  const accountOptions: AccountOption[] = [
    {
      value: ACCOUNT_CONSTANTS.ALL_ACCOUNTS_ID,
      label: 'Tutti gli Account',
      isSpecial: true,
    },
    ...accounts.map(account => ({
      value: account.id,
      label: account.name,
      isDefault: account.isDefault,
    })),
  ];

  // Get currently selected option for display
  const selectedOption = accountOptions.find(
    option => option.value === (selectedAccountId || ACCOUNT_CONSTANTS.ALL_ACCOUNTS_ID)
  );

  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="h-9 w-48 bg-gray-200 animate-pulse rounded-md" />
        {showManagement && (
          <div className="h-9 w-9 bg-gray-200 animate-pulse rounded-md" />
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Account Selector */}
      <div className="relative min-w-[200px] max-w-[300px]">
        <Select
          value={selectedAccountId || ACCOUNT_CONSTANTS.ALL_ACCOUNTS_ID}
          onValueChange={(value) => {
            const accountId = value === ACCOUNT_CONSTANTS.ALL_ACCOUNTS_ID ? null : value;
            onAccountChange(accountId);
          }}
          disabled={migrationInProgress}
        >
          <SelectTrigger className="w-full">
            <div className="flex items-center gap-2 min-w-0">
              <Building className="h-4 w-4 text-gray-500 shrink-0" />
              <div className="flex items-center gap-2 min-w-0">
                <SelectValue className="truncate">
                  {selectedOption?.label || 'Seleziona account'}
                </SelectValue>
                {selectedAccount?.isDefault && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    Default
                  </Badge>
                )}
              </div>
            </div>
          </SelectTrigger>
          <SelectContent>
            {accountOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center justify-between w-full">
                  <span className={option.isSpecial ? 'font-medium' : ''}>
                    {option.label}
                  </span>
                  {option.isDefault && (
                    <Badge variant="secondary" className="text-xs ml-2">
                      Default
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Account Management */}
      {showManagement && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 w-9 p-0"
              disabled={migrationInProgress}
            >
              <Settings className="h-4 w-4" />
              <span className="sr-only">Gestisci account</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={handleCreateAccount}>
              <Plus className="mr-2 h-4 w-4" />
              Nuovo Account
            </DropdownMenuItem>
            
            {selectedAccount && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleEditAccount(selectedAccount)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Modifica "{selectedAccount.name}"
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDeleteAccount(selectedAccount)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Elimina "{selectedAccount.name}"
                </DropdownMenuItem>
              </>
            )}
            
            {accounts.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs text-gray-500">
                  {accounts.length} account{accounts.length !== 1 ? 's' : ''} totali
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Account Dialog */}
      <AccountDialog
        open={accountDialogOpen}
        onClose={handleAccountDialogClose}
        account={editingAccount}
        onSuccess={handleAccountDialogSuccess}
      />


      {/* Migration Loading State */}
      {migrationInProgress && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-md">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600" />
            Creazione account...
          </div>
        </div>
      )}
    </div>
  );
}