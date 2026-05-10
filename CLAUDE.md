# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
./avvia.sh
# oppure
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

The app runs at `http://localhost:8001`. `avvia.sh` kills any process already on port 8001 before starting.

There are no automated tests.

## Architecture

**Backend:** FastAPI + SQLite, no ORM.

- `app/main.py` — all API routes and Pydantic models. Serves `app/static/` as a SPA.
- `app/db.py` — raw SQLite layer. All schema creation and inline migrations live in `init_db()`, which runs at startup. No migration framework.
- `app/calculator.py` — pure functions for dough scaling (`scale_dough`), pizza party planning (`calc_party`), water temperature (`calc_water_temp`), and nutrition macros. No side effects.
- `app/importer.py` — Excel import/export. Two legacy sheet parsers (`parse_napoletana_style`, `parse_michele_style`) handle the original `RICETTE IMPASTI.xlsx`; `_import_from_template` handles the exportable template format (detected by presence of a `'Ricette'` sheet).
- `app/static/` — single-page vanilla JS frontend (no build step, no framework).

**Data model:**

```
recipes
  └── variants (cascade delete)
        └── toppings (cascade delete, ingredient_id → ingredients ON DELETE SET NULL)
ingredients   (shared library, seeded on first run if empty)
timing_guides (imported from Excel 'Tempistiche' sheet)
import_log
```

`extra_ingredients` on recipes is stored as a JSON string in SQLite.

## Key behaviours to know

- `malto_pct`, `carbone_pct`, `olio_pct` are stored on recipes and shown in the UI but are **not** factored into `scale_dough` dough-weight calculations (they are display-only percentages).
- DB schema migrations are done via try/catch `ALTER TABLE` inside `init_db()` — add new columns this way to keep backward compatibility with existing DBs.
- `DB_PATH` and `EXCEL_PATH` can be overridden via environment variables (useful for Heroku/production via `Procfile`).
- Nutrition lookup hits the OpenFoodFacts public API (`/api/lookup-nutrition?name=...`).
- The import template format (`export_to_excel` / `create_import_template`) uses column header names as the contract — column order is irrelevant, but header names must not change.

## Documentazione di progetto

| File | Contenuto |
|------|-----------|
| [implementazioni.md](implementazioni.md) | Cronologia delle funzionalità aggiunte, con data e descrizione |
| [sospeso.md](sospeso.md) | Bug noti, inconsistenze, decisioni aperte |
