# Sospeso / Da risolvere

Decisioni aperte, bug noti, e cose da completare.

---

## Bug / Inconsistenze

- **`olio_pct` non entra nel calcolo impasto** — Il campo è salvato nel DB e mostrato in UI, ma `scale_dough` non lo include nella somma delle percentuali. Decidere: va aggiunto al peso impasto come gli altri ingredienti extra, o rimane solo display?

- **`carbone_pct` fisso a 7g/kg** — Nel template di import è documentato come fisso (7g/kg farina), ma in DB è una percentuale libera. Allineare la logica o rimuovere il campo.

## Miglioramenti tecnici

- **Nessun test automatico** — Tutta la logica di `calculator.py` è pura e facilmente testabile con pytest. Valutare l'aggiunta di test almeno per `scale_dough` e `calc_party`.

- **Migrazioni DB inline** — Le colonne nuove vengono aggiunte con try/catch ALTER TABLE in `init_db()`. Funziona ma diventa fragile con molte migrazioni. Valutare uno schema versioning minimo se il DB cresce.

## Da decidere

- **`sort_order` su toppings** — Esiste nel DB e c'è un endpoint PATCH per aggiornarlo, ma non è chiaro se l'UI lo usa per il drag-and-drop o se questa feature è ancora da implementare.

- **Google Calendar client_id** — Il pianificatore richiede un `GOOGLE_CLIENT_ID` da Google Cloud Console (Calendar API abilitata, JavaScript Origins configurati con `http://localhost:8001` e URL Heroku). Da configurare in `app/static/app.js` riga 1 del blocco Pianificatore. Finché non è configurato, il pulsante "Connetti Google Calendar" mostra un messaggio esplicativo ma la timeline funziona lo stesso.

- **Pianificatore: caso "prefermenti già fatti"** — Attualmente il pianificatore calcola sempre dal punto zero. Il caso "ho già messo i prefermenti in frigo" (ricalcolo degli step rimanenti) non è ancora implementato.
