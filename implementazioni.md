# Implementazioni

Cronologia delle funzionalità aggiunte al progetto.

---

## 2026-05-16 (v7.3 — Liquid Glass Redesign + Fix lista spesa + Fix Tempistiche)

### Redesign interfaccia: Apple Liquid Glass
Intera UI ridisegnata in stile "cool glass" neutro ispirato ad Apple. Palette calda marrone/arancio sostituita con toni blu/grigio su sfondo gradiente. `backdrop-filter: blur()` su tutte le superfici card, pannelli risultati, modal e header. Nuovi token CSS in `:root`: `--bg-gradient`, `--bg-card` (rgba), `--bg-header` (scuro traslucido), `--blur` / `--blur-sm` / `--blur-lg`, `--radius-xl`. Accent color: `#0077CC` (Apple blue). Biga/Poolish/Autolisi ora hanno colori distinti (viola, teal, verde).

### Fix: modal "Aggiungi Template Pianificatore"
Il div interno del modal `modal-new-timing` usava `class="modal-card"` (classe inesistente in CSS), rendendo il modal trasparente. Corretto in `class="modal" style="max-width:480px"`.

### Fix: lista spesa Pizza Party in colonne separate
La lista spesa condimenti ora è una tabella HTML (`<table class="shopping-table">`) con colonne **Ingrediente / Grammi / Costo** separate e una riga **Totale** in fondo. La colonna Costo appare solo se almeno un ingrediente ha costo impostato. Aggiornato anche `formatSharedText()` per usare la stessa struttura dati `{g, cost}`.

### Fix: Tempistiche non caricate in Impostazioni
`TIMING_DATA` era caricato solo in `initPlanner()`. Se l'utente non visitava la tab Pianificatore, Impostazioni > Tempistiche mostrava un editor vuoto. Ora `loadTimingTemplates()` viene chiamato sia in `renderImpostazioniTab()` (quando la view attiva è "tempistiche") sia in `switchSettingsView()` quando si seleziona la tab Tempistiche.

---

## 2026-05-16 (v7.1 — Template Pane nel Pianificatore + Lock modale)

### Template Pane nel Pianificatore
Il Pianificatore ora include una card "🍞 Pane" con la relativa timeline. Il template viene aggiunto automaticamente al DB tramite `backfill_timing_templates()` in `db.py`, che esegue all'avvio e inserisce solo le chiavi mancanti (senza toccare quelle esistenti). Gli step di default del Pane sono: Rinfresco LM, Autolisi, Impasto, Puntata, Formatura, Apretto (frigo), Pre-riscaldo forno, Cottura.

### Aggiungi Template (Impostazioni > Tempistiche)
Nuovo pulsante "+ Aggiungi Template" nella schermata Impostazioni > Tempistiche. Apre un modal in cui si inseriscono chiave univoca, etichetta e colore Google Calendar. Gli step di partenza vengono clonati dal template Pane e sono modificabili subito dopo la creazione. Endpoint: `POST /api/timing-templates`.

### Lock modale (no chiusura on click-outside)
Premendo fuori dall'area di un modal (sull'overlay) il modal non si chiude più. Per chiudere un modal è necessario premere esplicitamente il pulsante ✕. Questo vale per tutti i modal dell'app (nuova ricetta, modifica ricetta, ingrediente, esporta, importa, ecc.).

---

## 2026-05-16 (v7 — Tipo Pane + Lievito Madre)

### Tipo ricetta Pane
Il selettore "Tipo ricetta" nel form ora ha tre opzioni: 🍕 Pizza / Focaccia, 🍞 Pane, 🥐 Brioche / Dolci. Il tipo "Pane" mostra tutte le sezioni (BIGA, Poolish/Yudane, AUTOLISI) e in aggiunta la sezione Lievito Madre. Il tipo "Brioche / Dolci" sostituisce il precedente "Altro" conservando lo stesso comportamento (BIGA e AUTOLISI nascoste). Le ricette esistenti con `recipe_type = 'other'` continuano a funzionare.

### Lievito Madre
Per le ricette di tipo Pane, è possibile specificare:
- **Lievito Madre (% su farina tot.)** — il peso totale del starter come percentuale della farina totale. Es. 20% = 200 g di starter per 1 kg di farina.
- **% Farina nel starter** — la percentuale del peso del starter che è farina (default 60%). Il resto è acqua. Es. su 200g starter: farina = 120g, acqua = 80g.

La sezione Lievito Madre nel dettaglio ricetta mostra: peso totale starter, farina nel starter, acqua nel starter. La farina e l'acqua del lievito madre vengono **sottratte dal bilancio della Chiusura**, esattamente come avviene per BIGA e Poolish.

Formula: `lm_starter = lm_pct% × farina_totale`, `lm_farina = lm_starter × (% farina/100)`, `lm_acqua = lm_starter − lm_farina`.

### Nuovi campi DB
Aggiunte colonne `lm_pct REAL DEFAULT 0` e `lm_hydration_pct REAL DEFAULT 60` alla tabella `recipes` via migration inline.

---

## 2026-05-14 (v6 — Impostazioni, tempistiche editabili, tipi farina, tipi ricetta, nota)

### Tag release
Versione corrente salvata come tag git `BreakingBreadPizzaTool_R01` prima di questa sessione.

### Tab "⚙️ Impostazioni"
Nuovo tab nella navigazione principale. Contiene:
- **Libreria Ingredienti** (spostata dal tab Menù Pizze, che ora si chiama Menù Prodotti)
- **Tempistiche Pianificatore** editabili (vedi sotto)

### Rinomina "Menù Pizze" → "Menù Prodotti"
Il tab e il titolo della sezione sono stati aggiornati. La subnav Pizze/Ingredienti è stata rimossa — gli ingredienti sono ora in Impostazioni.

### Tempistiche Pianificatore editabili
Le tempistiche (`TIMING_DATA`) non sono più costanti JS hardcodate ma vengono salvate nel DB nella nuova tabella `timing_templates` (seeding automatico al primo avvio). Le tempistiche sono ora editabili dalla UI (tab Impostazioni → Tempistiche Pianificatore): si modifica il tempo di ogni step per Inverno/Estate e si salva con `PUT /api/timing-templates/{key}`. I valori aggiornati vengono usati subito dal Pianificatore.

### Rinomina "POOLISH" → "Poolish/Yudane"
Tutte le label display (dettaglio ricetta, form, pizza party, party results) mostrano ora "Poolish/Yudane". I nomi dei campi DB (`poolish_pct`, `poolish_yeast_pct`) rimangono invariati.

### Tipo ricetta (🍕 Pizza / 🍞 Altro)
Il form ricetta ha ora un selettore "Tipo ricetta". Quando si sceglie "Altro (Brioche, Pane…)":
- Il form nasconde le sezioni BIGA e AUTOLISI
- Il dettaglio ricetta (expand) nasconde le sezioni BIGA e AUTOLISI
- Rimangono visibili: Poolish/Yudane, Chiusura Impasto, extra ingredienti (in % sulla farina, es. uova, burro, yogurt)
- Il campo `recipe_type TEXT DEFAULT 'pizza'` è stato aggiunto alla tabella `recipes` via migration inline

### Mix farine per sezione (🌾)
Il form ricetta include una sezione opzionale collassabile "🌾 Mix Farine per Sezione". Per ciascuna delle 4 fasi (BIGA, Poolish/Yudane, Autolisi, Chiusura) si possono specificare le percentuali di:
- Grano tenero %
- Integrale %
- Speciale %
Con validazione visiva se la somma ≠ 100%. Nel dettaglio ricetta espanso, ogni sezione mostra un badge con il mix impostato (se non tutto grano tenero). Il campo `flour_mix TEXT` è stato aggiunto alla tabella `recipes` via migration inline, salvato come JSON.

### Nota ricetta (📋)
Nuovo pulsante `📋` nell'header di ogni recipe card. Apre una modale con i quantitativi calcolati dell'impasto suddivisi per fase, basati sui parametri della ricetta al numero di panetti di default:
- BIGA: farina, acqua, lievito (con dettaglio flour_mix se presente)
- Poolish/Yudane: farina, acqua, lievito
- Autolisi: farina, acqua
- Chiusura: farina rimanente, acqua, sale, lievito, olio, extra ingredienti
- Totale impasto
Pulsante "Condividi 📤": usa `navigator.share` su iOS, clipboard su desktop.

---

## 2026-05-11 (v5 — bug fix + varianti export/import + planner multi-ricetta)

### Fix lookup 🔍 OpenFoodFacts
Il pulsante 🔍 per ingrediente ora include un header `User-Agent` nella richiesta HTTP. OpenFoodFacts richiedeva questo header (senza, restituisce risultati vuoti). Nessuna modifica al contratto API.

### Fix scroll Safari dopo salvataggio condimento/variante
Dopo `renderVariantsForRecipe()` e `saveIngredient()`, la posizione di scroll viene salvata prima del render e ripristinata con `requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollY)))` — il doppio rAF è necessario per Safari che ritarda il layout.

### Pizza Party: parametri ricetta non editabili
In Pizza Party step 2, i campi Idratazione, Sale, Lievito, BIGA, POOLISH, AUTOLISI vengono mostrati come `<span class="param-readonly-val">` (non modificabili) — i valori provengono dalla ricetta selezionata. Solo N. Palline e Peso rimangono input editabili. BIGA, POOLISH, AUTOLISI sono ora sulla stessa riga.

### Schermata Ricette: parametri read-only con edit inline
Espandendo una ricetta, i parametri (idratazione, sale, lievito, BIGA, POOLISH, ecc.) sono in sola lettura per default. Click su "✏️ Modifica parametri" → campo diventano input editabili con live-calc. "Salva parametri" → `PUT /api/recipes/:id` → torna a view mode con valori aggiornati. "Annulla" → torna a view mode senza salvare.

### Export varianti pizza (nuovo tipo)
La modale Esporta include ora il tab "🍕 Varianti Pizza". Mostra le varianti raggruppate per ricetta con checkbox per singola variante. Il file esportato (`varianti_export.xlsx`) contiene solo il foglio Varianti (senza Ricette), reimportabile separatamente. Endpoint: `GET /api/export-excel?type=variants&variant_ids=1,2,3`.

### Import varianti pizza da file varianti-only
Il flusso di import riconosce i file con solo foglio Varianti (senza Ricette). L'anteprima mostra la sezione "Varianti pizza (N)" con checkbox e badge "già presente". Il backend crea le varianti + toppings sulle ricette esistenti nel DB (match per nome ricetta). Endpoint: `POST /api/import-excel?only_variants=Ricetta1::Var1,Ricetta1::Var2`.

### Pianificatore multi-impasto
Il Pianificatore supporta ora la selezione multipla di ricette (le card sono multi-select con toggle). Per ogni ricetta selezionata viene calcolata e mostrata una timeline separata (tabelle stacked, header colorato per ricetta). "Condividi riepilogo" genera un testo con tutte le ricette. "Crea eventi su Calendar" crea gli eventi per tutte le timeline contemporaneamente, con il colore specifico di ciascuna ricetta. "Salva e pianifica" dal Pizza Party pre-seleziona tutte le ricette attive nel party.

---

## 2026-05-10 (v4 — sync ingredienti, export/import redesign, planner share, UX)

### Sync automatico ingredienti → pizze
Modificando un ingrediente in libreria (nome, kcal, macros), i valori vengono propagati automaticamente a tutti i condimenti pizza collegati via `ingredient_id`. La `quantity_g` non viene toccata.

### Aggiornamento da web con disambiguazione
Il pulsante 🔍 per ingrediente ora chiama `/api/lookup-nutrition?limit=5`. Se trovato un solo risultato, apre direttamente la modale di modifica pre-compilata. Se trovati più risultati, mostra una modale di scelta con nome prodotto e macros per selezionare quello corretto.

### Export / Import / Template unificati
Il pulsante "Esporta Ricette" diventa **"Esporta"** con modale a tre opzioni: Ricette (selezione checkbox), Libreria Ingredienti (tutta), Backup completo (ricette + varianti + ingredienti in un solo file reimportabile). Il flusso Import mostra separatamente le ricette e gli ingredienti trovati nel file, con checkbox indipendenti. **"Scarica Template"** apre una modale con due template: Ricette e Libreria Ingredienti. Tutti i template/export/import sono compatibili tra loro.

### Varianti pizza ordinate alfabeticamente
Le varianti nel tab Menù Pizze sono sempre mostrate in ordine alfabetico (sort client-side al momento del render, senza modificare il DB).

### No scroll al salvataggio / copia pizza
`saveCopyVariant()` non chiama più `loadRecipes()` (che scrollava in cima), ma aggiorna solo `allVariants` e fa re-render della sezione corrente.

### Pulsante "Condividi riepilogo" nel Pianificatore
Nuova azione "📤 Condividi riepilogo" nel pannello risultati del Pianificatore. Genera un testo con la timeline step per step. Su iOS usa la share sheet nativa; su desktop copia negli appunti.

---

## 2026-05-10 (v3 — ordine ingredienti canonico + export/import selettivo)

### Ordine canonico degli ingredienti nelle pizze
Le varianti pizza mostrano sempre gli ingredienti in ordine fisso: Farina → Pomodoro → Mozzarella → altri ingredienti → Parmigiano/Grana → Olio. L'ordinamento viene applicato lato JS al momento del render (senza modificare il DB), così funziona su tutti i dati esistenti e su quelli nuovi. Gli ingredienti mancanti vengono semplicemente saltati; il riordine manuale (↑ ↓) continua a funzionare all'interno della stessa categoria.

### Export ricette selettive
Il pulsante "Esporta Ricette" apre ora una modale con le ricette selezionabili tramite checkbox (tutte pre-selezionate). Con "Seleziona tutto" / "Deseleziona tutto" si gestisce velocemente la selezione. Il backend accetta il parametro `?ids=1,2,3` per filtrare il file `.xlsx` esportato. L'endpoint `/api/export-excel` rimane compatibile senza parametri (esporta tutto).

### Import ricette selettivo (2 step)
Il flusso di importazione è ora a due passi: (1) il file viene analizzato via `/api/preview-import` che restituisce la lista delle ricette trovate con badge "già presente"; (2) l'utente sceglie quali importare con checkbox e opzionalmente spunta "Sovrascrivi ricette già presenti" (reset selettivo, elimina solo le ricette selezionate prima di reimportarle). Il backend accetta `?only=Nome1,Nome2` per importare un sottoinsieme.

## 2026-05-10 (v2 — bugfix e miglioramenti planner)

### Fix onclick/module scope — tutti i bottoni ora funzionano
`app.js` è caricato come `type="module"`, quindi le funzioni non erano nello scope globale e tutti i handler `onclick="..."` inline (Condividi, Pianificatore) erano silenziosi. Convertito tutto a `addEventListener` aggiunto dopo il render dinamico. Include: bottone Condividi, bottone Salva, recipe card, day pills, time pills, season toggle, bottoni Google Calendar.

### Bottone "Salva e pianifica" nel Pizza Party
Dopo aver configurato un Pizza Party, il pulsante "💾 Salva e pianifica" (ora primario) porta direttamente al tab Pianifica con la ricetta pre-selezionata e il numero di pizze già mostrato nel descrittore della card. La mappatura nome→chiave avviene tramite keyword match (napoletana, focaccia/teglia, brioche).

## 2026-05-10 (v1)

### UI ottimizzata per iPhone / mobile
Riscrittura completa delle media query. Modifiche principali: header a 2 righe su schermi <580px con tab scorrevoli orizzontalmente; pulsanti secondari (Esporta, Template) nascosti su mobile; `font-size: 16px` su tutti gli input (previene zoom automatico di iOS); touch target ≥ 44px; tabelle con `overflow-x: auto`; `results-panel` del Pizza Party non più sticky su mobile con auto-scroll verso i risultati dopo il calcolo.

### Export / condivisione riepilogo Pizza Party
Pulsante "Condividi 📤" in fondo al pannello risultati del Pizza Party. Genera un testo formattato con: impasto (farina, acqua, sale, lievito, prefermenti), per ciascuna variante l'elenco ingredienti con g/pizza e le sole kcal per pizza intera e per fetta (senza macronutrienti dettagliati), infine la lista della spesa. Su iOS usa la share sheet nativa (`navigator.share`) → funziona con Mail, Note, WhatsApp, ecc. Su desktop copia negli appunti con toast di conferma.

### Pianificatore impasti su Google Calendar
Nuovo tab "📅 Pianifica" con calcolo a ritroso degli step di preparazione a partire dall'orario di servizio. Supporta tre ricette (Focaccia Romana in Teglia, Pizza Napoletana, Pasta Brioche) con tempi differenziati estate/inverno (rilevazione automatica dal mese, toggle manuale). La stagione estate = aprile–ottobre. La timeline viene mostrata in anteprima prima della creazione degli eventi. Ogni step che attraversa la mezzanotte viene automaticamente spezzato in due eventi distinti. Integrazione Google Calendar via OAuth 2.0 (Google Identity Services, lato client): richiede `GOOGLE_CLIENT_ID` da Google Cloud Console in cima ad `app.js`. Colori eventi: verde (Focaccia), teal (Napoletana), banana (Brioche).

---

## 2026-05-08

### Export ricette in Excel
Endpoint `GET /api/export-excel` che genera un file `.xlsx` reimportabile con tre fogli: Istruzioni, Ricette, Varianti. Il formato colonne è il contratto di import — i nomi non vanno mai rinominati.

### Gestione ingredienti (libreria centralizzata)
Tabella `ingredients` con valori nutrizionali per 100g. Gli ingredienti sono riutilizzabili tra varianti (`ingredient_id` su `toppings`, ON DELETE SET NULL). Seeding automatico al primo avvio con 17 ingredienti base.

### Lookup nutrizionale via OpenFoodFacts
Endpoint `GET /api/lookup-nutrition?name=...` che interroga l'API pubblica di OpenFoodFacts e restituisce macros per 100g. Usato dall'UI per precompilare i valori nutrizionali di un nuovo ingrediente.

### Pizza Party multi-ricetta
Endpoint `POST /api/pizza-party` che calcola impasto + fabbisogno condimenti + spesa della serata per N pizze con varianti miste. Restituisce anche la lista della spesa aggregata ordinata per quantità.

### Fix malto e carbone vegetale
`malto_pct` e `carbone_pct` aggiunti come colonne sulla tabella `recipes` (con migration inline). Sono campi display/tracking: non entrano nel calcolo del peso impasto in `scale_dough`.

### Fix import Excel (file upload)
L'endpoint `/api/import-excel` accetta ora un file caricato via `UploadFile` invece di leggere un path server-side. Risolve il problema su ambienti hosted (es. Heroku) dove il file locale non è accessibile.

---

## 2026-05-03 — Commit iniziale

- Calcolatore impasto (`scale_dough`): scala per numero panetti, peso totale farina o peso panetto target
- Ricette CRUD con varianti e condimenti
- Import da `RICETTE IMPASTI.xlsx` (due formati: Napoletana/Teglia e Michele/Lioniello)
- Guide tempistiche importate dal foglio "Tempistiche"
- Calcolo temperatura acqua (`calc_water_temp`)
- Frontend SPA vanilla JS
