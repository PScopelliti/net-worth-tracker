# Session Notes — 2026-03-05

## Obiettivo
Aggiunta colonna "Mese Prec. %" nelle tab Prezzi Anno Corrente e Valori Anno Corrente della pagina Assets.

## Motivazione
Le tab anno corrente mostravano già la variazione MoM inline in ogni cella mensile (piccolo testo sotto il valore), ma non era possibile confrontare rapidamente la performance dell'ultimo mese tra tutti gli asset. La nuova colonna riepilogativa lo permette, analoga a YTD % e From Start %.

## Modifiche apportate

### `types/assets.ts`
- Aggiunto campo `lastMonthChange?: number` a `AssetHistoryTotalRow`

### `lib/utils/assetPriceHistoryUtils.ts`
- Aggiunto campo `lastMonthChange?: number` a `AssetPriceHistoryRow`
- Calcolo per ogni asset: `change` dell'ultimo mese non-null disponibile
- Calcolo per `totalRow`: `monthlyChanges` dell'ultimo mese disponibile

### `components/assets/AssetPriceHistoryTable.tsx`
- Nuova colonna header "Mese Prec. %" (bg-amber-50, border-amber-300)
- Cella per ogni asset row
- Cella nel total row footer
- Posizione: prima della colonna YTD %
- Visibile solo su tab con `filterYear !== undefined` (tab anno corrente)

## Branch
`claude/add-monthly-percentage-column-OjEGJ`
