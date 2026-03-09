# SESSION NOTES — 2026-03-09

## Obiettivo
Aggiunta di due nuovi tab "Asset Class" (anno corrente e storico) nella pagina Assets,
con riorganizzazione da 5 tab piatti a 3 macro-tab (Gestione / Anno Corrente / Storico),
ciascuno con sub-tab interni dove applicabile.

## Struttura Tab Finale
```
[Gestione Asset] [Anno Corrente] [Storico]

Anno Corrente → sub-tab: [Prezzi] [Valori] [Asset Class]
Storico       → sub-tab: [Prezzi] [Valori] [Asset Class]
```

## File Creati
- `lib/utils/assetClassHistoryUtils.ts` — trasformazione dati snapshot → righe per asset class
- `components/assets/AssetClassHistoryTable.tsx` — tabella UI asset class history

## File Modificati
- `app/dashboard/assets/page.tsx` — riorganizzazione da 5 tab piatti a 3 macro-tab + sub-tab

## Decisioni di Design
- Lazy loading: solo sui 2 macro-tab ('anno-corrente', 'storico')
- Sub-tab interni montati tutti insieme al primo click del macro-tab
- `transformAssetClassHistoryData` riusa `ASSET_CLASS_ORDER` per ordinamento e `ASSET_CLASS_COLORS` per colori
- Label italiani asset class: equity→Azioni, bonds→Obbligazioni, crypto→Crypto, realestate→Immobili, cash→Liquidità, commodity→Materie Prime
- Riga totale sempre presente nella tabella Asset Class (come in Valori)

## Status
- [x] SESSION_NOTES.md creato
- [x] assetClassHistoryUtils.ts creato
- [x] AssetClassHistoryTable.tsx creato
- [x] assets/page.tsx refactored
- [ ] Test eseguiti
