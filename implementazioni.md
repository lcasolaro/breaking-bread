# Implementazioni

Cronologia delle funzionalità aggiunte al progetto.

---

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
