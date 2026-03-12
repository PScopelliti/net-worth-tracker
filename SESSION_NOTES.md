# SESSION NOTES — 2026-03-12

## Feature: Category Deep Dive nel Budget Tab (Vista Annuale)

### Obiettivo
Aggiungere drill-down storico multi-anno al tab Budget: click su riga categoria → pannello
"Analisi Storica" con tabella Anno × Mese per tutti gli anni disponibili.

### Branch
`claude/add-annual-budget-page-FaFsJ`

### File modificati
- `components/cashflow/BudgetTab.tsx` — unico file

### Approccio
- Stato `selectedItemKey: string | null` per tracciare la riga selezionata
- `deepDiveData` useMemo che calcola anni × mesi usando `getActualForItem` / `getMonthlyActualsForItem`
- Righe tabella annuale rese clickabili (toggle, con chevron indicator)
- Componente `CategoryDeepDive` inline (no modal, pattern CurrentYearTab)
- Auto-scroll al pannello all'apertura
- Reset su edit mode

### Status
- [x] Branch setup
- [x] SESSION_NOTES.md creato
- [x] Implementazione BudgetTab.tsx
- [x] Commit + push

### Dettaglio modifiche BudgetTab.tsx
1. Import aggiunti: `getActualForItem`, `getMonthlyActualsForItem` da budgetUtils; `ChevronRight` da lucide-react
2. Stato aggiunto: `selectedItemKey: string | null` (linea ~240)
3. Reset in `handleStartEditing()` + al cambio view mode → 'monthly'
4. useEffect auto-scroll con 100ms delay (pattern CurrentYearTab)
5. `deepDiveData` useMemo: calcola righe anno×mese per item selezionato
6. Righe item `AnnualTable()`: clickabili, highlight blu se selezionate, chevron right/down indicator
7. Componente `CategoryDeepDive()`: tabella con scroll orizzontale, anni inversi, mesi futuri grigi, vs Budget colorato
8. Render: `CategoryDeepDive` sotto la Card della tabella annuale; nota in footer
