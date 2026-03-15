/**
 * Account Dialog - Create and Edit Investment Accounts
 *
 * Dialog component for managing investment accounts (brokers, banks, pension funds).
 * Follows established patterns from AssetDialog with React Hook Form and Zod validation.
 *
 * Key Features:
 * - Multi-account portfolio organization
 * - Default account management (only one default at a time)
 * - Account type classification (broker, bank, pension, etc.)
 * - Provider suggestions for quick selection
 * - Soft delete with status management
 * - Comprehensive validation with Italian error messages
 * - Responsive design for mobile and desktop
 *
 * Form Validation:
 * - Required: name, type, currency
 * - Optional: description, provider, account number
 * - Name length limit: 50 characters
 * - Description limit: 200 characters
 * - Currency format: 3-letter ISO code
 */
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Account, 
  AccountFormData, 
  AccountType, 
  AccountStatus,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_STATUS_LABELS,
  COMMON_PROVIDERS,
  ACCOUNT_CONSTANTS 
} from '@/types/accounts';
import { 
  createAccount, 
  updateAccount, 
  validateAccountFormData 
} from '@/lib/services/accountService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

// Zod validation schema for account form
const accountSchema = z.object({
  name: z
    .string()
    .min(1, 'Il nome dell\'account è obbligatorio')
    .max(ACCOUNT_CONSTANTS.MAX_ACCOUNT_NAME_LENGTH, `Il nome non può superare ${ACCOUNT_CONSTANTS.MAX_ACCOUNT_NAME_LENGTH} caratteri`)
    .refine(name => name.trim().length > 0, 'Il nome non può essere vuoto'),
  
  type: z
    .enum(['broker', 'bank', 'pension', 'insurance', 'crypto', 'other'])
    .refine(val => ['broker', 'bank', 'pension', 'insurance', 'crypto', 'other'].includes(val), {
      message: 'Tipo di account non valido'
    }),
  
  status: z
    .enum(['active', 'inactive', 'closed'])
    .refine(val => ['active', 'inactive', 'closed'].includes(val), {
      message: 'Stato account non valido'
    }),
  
  description: z
    .string()
    .max(ACCOUNT_CONSTANTS.MAX_DESCRIPTION_LENGTH, `La descrizione non può superare ${ACCOUNT_CONSTANTS.MAX_DESCRIPTION_LENGTH} caratteri`)
    .optional(),
  
  provider: z
    .string()
    .max(50, 'Il nome del provider non può superare 50 caratteri')
    .optional(),
  
  accountNumber: z
    .string()
    .max(30, 'Il numero account non può superare 30 caratteri')
    .optional(),
  
  currency: z
    .string()
    .length(3, 'La valuta deve essere un codice di 3 caratteri (es. EUR, USD)')
    .regex(/^[A-Z]{3}$/, 'La valuta deve essere in formato ISO (es. EUR, USD)'),
  
  isDefault: z.boolean(),
  
  sortOrder: z
    .number()
    .min(0, 'L\'ordine deve essere un numero positivo'),
  
  taxOptimized: z.boolean().optional(),
  allowsMargin: z.boolean().optional(),
  allowsOptions: z.boolean().optional(),
  allowsCrypto: z.boolean().optional(),
});

type AccountFormValues = z.infer<typeof accountSchema>;

interface AccountDialogProps {
  open: boolean;
  onClose: () => void;
  account?: Account | null;
  onSuccess?: () => void;
}

export function AccountDialog({ open, onClose, account, onSuccess }: AccountDialogProps) {
  const { user } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      currency: ACCOUNT_CONSTANTS.DEFAULT_CURRENCY,
      status: 'active',
      isDefault: false,
      sortOrder: 0,
      taxOptimized: false,
      allowsMargin: false,
      allowsOptions: false,
      allowsCrypto: false,
    },
  });

  const selectedType = watch('type');
  const isDefaultAccount = watch('isDefault');

  // Reset form when dialog opens/closes or account changes
  useEffect(() => {
    if (open) {
      if (account) {
        // Editing existing account
        reset({
          name: account.name,
          type: account.type,
          status: account.status,
          description: account.description || '',
          provider: account.provider || '',
          accountNumber: account.accountNumber || '',
          currency: account.currency,
          isDefault: account.isDefault,
          sortOrder: account.sortOrder,
          taxOptimized: account.taxOptimized || false,
          allowsMargin: account.allowsMargin || false,
          allowsOptions: account.allowsOptions || false,
          allowsCrypto: account.allowsCrypto || false,
        });
      } else {
        // Creating new account
        reset({
          name: '',
          type: 'broker',
          status: 'active',
          description: '',
          provider: '',
          accountNumber: '',
          currency: ACCOUNT_CONSTANTS.DEFAULT_CURRENCY,
          isDefault: false,
          sortOrder: 0,
          taxOptimized: false,
          allowsMargin: false,
          allowsOptions: false,
          allowsCrypto: false,
        });
      }
    }
  }, [open, account, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (data: AccountFormValues) => {
    if (!user) return;

    try {
      // Client-side validation
      const validationErrors = validateAccountFormData(data);
      if (validationErrors.length > 0) {
        toast.error(validationErrors[0]);
        return;
      }

      const formData: AccountFormData = {
        name: data.name.trim(),
        type: data.type,
        status: data.status,
        description: data.description?.trim() || undefined,
        provider: data.provider?.trim() || undefined,
        accountNumber: data.accountNumber?.trim() || undefined,
        currency: data.currency.toUpperCase(),
        isDefault: data.isDefault,
        sortOrder: data.sortOrder,
        taxOptimized: data.taxOptimized,
        allowsMargin: data.allowsMargin,
        allowsOptions: data.allowsOptions,
        allowsCrypto: data.allowsCrypto,
      };

      if (account) {
        // Update existing account
        await updateAccount(account.id, formData, user.uid);
        toast.success('Account aggiornato con successo');
      } else {
        // Create new account
        await createAccount(user.uid, formData);
        toast.success('Account creato con successo');
      }

      onSuccess?.();
      handleClose();
    } catch (error: any) {
      console.error('Error saving account:', error);
      toast.error(error.message || 'Errore nel salvataggio dell\'account');
    }
  };

  // Auto-set account features based on type
  useEffect(() => {
    if (selectedType) {
      switch (selectedType) {
        case 'broker':
          setValue('allowsMargin', true);
          setValue('allowsOptions', true);
          setValue('allowsCrypto', false);
          break;
        case 'crypto':
          setValue('allowsCrypto', true);
          setValue('allowsMargin', false);
          setValue('allowsOptions', false);
          break;
        case 'pension':
          setValue('taxOptimized', true);
          setValue('allowsMargin', false);
          setValue('allowsOptions', false);
          setValue('allowsCrypto', false);
          break;
        default:
          // Keep current values for other types
          break;
      }
    }
  }, [selectedType, setValue]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {account ? 'Modifica Account' : 'Nuovo Account'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {account
              ? "Modifica i dettagli dell'account selezionato."
              : 'Crea un nuovo account per organizzare i tuoi asset.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Informazioni Base</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Account *</Label>
                <Input
                  id="name"
                  {...register('name')}
                  placeholder="es. Directa Trading"
                  maxLength={ACCOUNT_CONSTANTS.MAX_ACCOUNT_NAME_LENGTH}
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Tipo Account *</Label>
                <Select
                  value={selectedType}
                  onValueChange={(value) => setValue('type', value as AccountType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.type && (
                  <p className="text-sm text-red-500">{errors.type.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                {...register('description')}
                placeholder="Descrizione opzionale dell'account"
                maxLength={ACCOUNT_CONSTANTS.MAX_DESCRIPTION_LENGTH}
                rows={2}
              />
              {errors.description && (
                <p className="text-sm text-red-500">{errors.description.message}</p>
              )}
            </div>
          </div>

          {/* Provider Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Dettagli Provider</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="provider">Provider</Label>
                <Select
                  value={watch('provider') || ''}
                  onValueChange={(value) => setValue('provider', value === '__custom__' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona o inserisci provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom__">Altro (inserisci manualmente)</SelectItem>
                    {COMMON_PROVIDERS.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {watch('provider') === '' && (
                  <Input
                    {...register('provider')}
                    placeholder="Nome del provider"
                    maxLength={50}
                  />
                )}
                {errors.provider && (
                  <p className="text-sm text-red-500">{errors.provider.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountNumber">Numero Account</Label>
                <Input
                  id="accountNumber"
                  {...register('accountNumber')}
                  placeholder="es. ****1234"
                  maxLength={30}
                />
                {errors.accountNumber && (
                  <p className="text-sm text-red-500">{errors.accountNumber.message}</p>
                )}
                <p className="text-xs text-gray-500">
                  Opzionale. Usa solo le ultime cifre per sicurezza.
                </p>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Impostazioni</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currency">Valuta *</Label>
                <Select
                  value={watch('currency')}
                  onValueChange={(value) => setValue('currency', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona valuta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="USD">USD - Dollaro USA</SelectItem>
                    <SelectItem value="GBP">GBP - Sterlina</SelectItem>
                    <SelectItem value="CHF">CHF - Franco Svizzero</SelectItem>
                    <SelectItem value="JPY">JPY - Yen Giapponese</SelectItem>
                  </SelectContent>
                </Select>
                {errors.currency && (
                  <p className="text-sm text-red-500">{errors.currency.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Stato</Label>
                <Select
                  value={watch('status')}
                  onValueChange={(value) => setValue('status', value as AccountStatus)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona stato" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACCOUNT_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Account Toggles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isDefault">Account Predefinito</Label>
                    <p className="text-xs text-gray-500">
                      Utilizzato di default per nuovi asset
                    </p>
                  </div>
                  <Switch
                    id="isDefault"
                    checked={isDefaultAccount}
                    onCheckedChange={(checked) => setValue('isDefault', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="taxOptimized">Vantaggi Fiscali</Label>
                    <p className="text-xs text-gray-500">
                      Regime fiscale agevolato (es. PIR, Fondi pensione)
                    </p>
                  </div>
                  <Switch
                    id="taxOptimized"
                    checked={watch('taxOptimized')}
                    onCheckedChange={(checked) => setValue('taxOptimized', checked)}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="allowsMargin">Trading con Margine</Label>
                    <p className="text-xs text-gray-500">
                      Supporta operazioni con leva finanziaria
                    </p>
                  </div>
                  <Switch
                    id="allowsMargin"
                    checked={watch('allowsMargin')}
                    onCheckedChange={(checked) => setValue('allowsMargin', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="allowsOptions">Opzioni</Label>
                    <p className="text-xs text-gray-500">
                      Supporta trading di opzioni
                    </p>
                  </div>
                  <Switch
                    id="allowsOptions"
                    checked={watch('allowsOptions')}
                    onCheckedChange={(checked) => setValue('allowsOptions', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="allowsCrypto">Criptovalute</Label>
                    <p className="text-xs text-gray-500">
                      Supporta trading di criptovalute
                    </p>
                  </div>
                  <Switch
                    id="allowsCrypto"
                    checked={watch('allowsCrypto')}
                    onCheckedChange={(checked) => setValue('allowsCrypto', checked)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvataggio...' : account ? 'Aggiorna' : 'Crea Account'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}