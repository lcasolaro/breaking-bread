import sqlite3
import json
import os

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(os.path.dirname(__file__)), "breaking_bread.db"))


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS recipes (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                name             TEXT NOT NULL,
                description      TEXT,
                base_flour_g     REAL NOT NULL,
                default_pieces   INTEGER NOT NULL,
                default_ball_g   REAL NOT NULL,
                hydration_pct    REAL NOT NULL,
                salt_pct         REAL NOT NULL,
                yeast_pct        REAL NOT NULL DEFAULT 0,
                biga_pct         REAL NOT NULL DEFAULT 0,
                poolish_pct      REAL NOT NULL DEFAULT 0,
                autolisi_pct     REAL NOT NULL DEFAULT 0,
                biga_hydration_pct  REAL NOT NULL DEFAULT 44.0,
                biga_yeast_pct      REAL NOT NULL DEFAULT 0.5,
                poolish_yeast_pct   REAL NOT NULL DEFAULT 0.1,
                autolisi_water_pct  REAL NOT NULL DEFAULT 0.0,
                malto_pct           REAL NOT NULL DEFAULT 0.0,
                carbone_pct         REAL NOT NULL DEFAULT 0.0,
                extra_ingredients TEXT,
                notes            TEXT,
                sort_order       INTEGER DEFAULT 0,
                created_at       TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS ingredients (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                name           TEXT NOT NULL,
                kcal_per100    REAL DEFAULT 0,
                protein_per100 REAL DEFAULT 0,
                carbs_per100   REAL DEFAULT 0,
                fat_per100     REAL DEFAULT 0,
                fiber_per100   REAL DEFAULT 0,
                sort_order     INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS variants (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
                name        TEXT NOT NULL,
                description TEXT,
                sort_order  INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS toppings (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                variant_id     INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
                name           TEXT NOT NULL,
                quantity_g     REAL NOT NULL DEFAULT 0,
                kcal_per100    REAL,
                protein_per100 REAL,
                carbs_per100   REAL,
                fat_per100     REAL,
                fiber_per100   REAL,
                ingredient_id  INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
                sort_order     INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS timing_guides (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                content    TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS timing_templates (
                id                     INTEGER PRIMARY KEY AUTOINCREMENT,
                key                    TEXT NOT NULL UNIQUE,
                name                   TEXT NOT NULL,
                emoji                  TEXT,
                calendar_color_id      TEXT,
                service_label          TEXT,
                service_event_name     TEXT,
                service_event_duration INTEGER DEFAULT 0,
                steps                  TEXT NOT NULL,
                sort_order             INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS import_log (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                filename         TEXT NOT NULL,
                imported_at      TEXT DEFAULT (datetime('now')),
                recipes_imported INTEGER,
                notes            TEXT
            );
        """)
        # Migrations for existing DBs
        for col, default in [
            ("biga_hydration_pct",  "44.0"),
            ("biga_yeast_pct",      "0.5"),
            ("poolish_yeast_pct",   "0.1"),
            ("autolisi_water_pct",  "0.0"),
            ("malto_pct",           "0.0"),
            ("carbone_pct",         "0.0"),
            ("olio_pct",            "0.0"),
        ]:
            try:
                conn.execute(f"ALTER TABLE recipes ADD COLUMN {col} REAL NOT NULL DEFAULT {default}")
            except Exception:
                pass

        for col, coldef in [
            ("recipe_type",          "TEXT DEFAULT 'pizza'"),
            ("flour_mix",            "TEXT"),
            ("timing_template_key",  "TEXT"),
            ("lm_pct",               "REAL DEFAULT 0"),
            ("lm_hydration_pct",     "REAL DEFAULT 60"),
        ]:
            try:
                conn.execute(f"ALTER TABLE recipes ADD COLUMN {col} {coldef}")
            except Exception:
                pass

        for col, coldef in [
            ("cost_per100", "REAL DEFAULT 0"),
        ]:
            try:
                conn.execute(f"ALTER TABLE ingredients ADD COLUMN {col} {coldef}")
            except Exception:
                pass

        for col in ["description"]:
            try:
                conn.execute(f"ALTER TABLE variants ADD COLUMN {col} TEXT")
            except Exception:
                pass

        for col, coltype in [
            ("fiber_per100",  "REAL"),
            ("ingredient_id", "INTEGER"),
        ]:
            try:
                conn.execute(f"ALTER TABLE toppings ADD COLUMN {col} {coltype}")
            except Exception:
                pass


def seed_ingredients():
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM ingredients").fetchone()[0]
        if count > 0:
            return
        items = [
            ("Farina 00",        340, 10.0, 72.0,   1.0,  2.5),
            ("Farina integrale",  335, 13.0, 62.0,   2.0, 11.0),
            ("Mozzarella",        242, 17.0,  2.7,  18.0,  0.0),
            ("Provolone",         352, 26.0,  2.2,  27.0,  0.0),
            ("Pomodori pelati",    32,  1.5,  5.0,   0.3,  1.5),
            ("Pomodorini",         18,  0.9,  3.5,   0.2,  1.2),
            ("Olio d'oliva",      884,  0.0,  0.0, 100.0,  0.0),
            ("Parmigiano",        392, 33.0,  0.0,  28.0,  0.0),
            ("Gorgonzola",        353, 19.0,  0.0,  30.0,  0.0),
            ("Noci",              654, 15.0, 14.0,  65.0,  6.7),
            ("Fichi",              74,  0.7, 19.0,   0.2,  2.9),
            ("Ricotta",           174, 11.0,  3.0,  13.0,  0.0),
            ("Salame",            425, 21.0,  1.0,  37.0,  0.0),
            ("Cicoli",            525, 40.0,  0.0,  40.0,  0.0),
            ("Stracciatella",     300, 10.0,  1.5,  28.0,  0.0),
            ("Wurstel",           290, 13.0,  1.5,  25.0,  0.0),
            ("Patatine",          536,  5.0, 53.0,  34.0,  3.5),
        ]
        for i, (name, kcal, prot, carbs, fat, fiber) in enumerate(items):
            conn.execute(
                "INSERT INTO ingredients (name, kcal_per100, protein_per100, carbs_per100, fat_per100, fiber_per100, sort_order) VALUES (?,?,?,?,?,?,?)",
                (name, kcal, prot, carbs, fat, fiber, i * 10)
            )


# ── Recipes ─────────────────────────────────────────────────────────────────

def get_recipes():
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT r.*, COUNT(v.id) as variant_count
            FROM recipes r
            LEFT JOIN variants v ON v.recipe_id = r.id
            GROUP BY r.id
            ORDER BY r.sort_order, r.id
        """).fetchall()
        return [dict(r) for r in rows]


def get_recipe(recipe_id: int):
    with get_conn() as conn:
        recipe = conn.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
        if not recipe:
            return None
        recipe = dict(recipe)
        if recipe.get("extra_ingredients"):
            try:
                recipe["extra_ingredients"] = json.loads(recipe["extra_ingredients"])
            except Exception:
                recipe["extra_ingredients"] = []
        else:
            recipe["extra_ingredients"] = []

        if recipe.get("flour_mix"):
            try:
                recipe["flour_mix"] = json.loads(recipe["flour_mix"])
            except Exception:
                recipe["flour_mix"] = None
        else:
            recipe["flour_mix"] = None

        if not recipe.get("recipe_type"):
            recipe["recipe_type"] = "pizza"

        variants = conn.execute(
            "SELECT * FROM variants WHERE recipe_id = ? ORDER BY sort_order, id",
            (recipe_id,)
        ).fetchall()

        recipe["variants"] = []
        for v in variants:
            v = dict(v)
            toppings = conn.execute(
                "SELECT * FROM toppings WHERE variant_id = ? ORDER BY sort_order, id",
                (v["id"],)
            ).fetchall()
            v["toppings"] = [dict(t) for t in toppings]
            recipe["variants"].append(v)

        return recipe


def create_recipe(data: dict) -> int:
    extras = data.get("extra_ingredients", [])
    if isinstance(extras, list):
        extras = json.dumps(extras)
    flour_mix = data.get("flour_mix")
    if isinstance(flour_mix, dict):
        flour_mix = json.dumps(flour_mix)
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO recipes
              (name, description, base_flour_g, default_pieces, default_ball_g,
               hydration_pct, salt_pct, yeast_pct, biga_pct, poolish_pct, autolisi_pct,
               biga_hydration_pct, biga_yeast_pct, poolish_yeast_pct,
               autolisi_water_pct, malto_pct, carbone_pct, olio_pct,
               extra_ingredients, notes, sort_order, recipe_type, flour_mix,
               timing_template_key, lm_pct, lm_hydration_pct)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            data["name"], data.get("description"), data["base_flour_g"],
            data["default_pieces"], data["default_ball_g"],
            data["hydration_pct"], data["salt_pct"], data.get("yeast_pct", 0),
            data.get("biga_pct", 0), data.get("poolish_pct", 0), data.get("autolisi_pct", 0),
            data.get("biga_hydration_pct", 44.0), data.get("biga_yeast_pct", 0.5),
            data.get("poolish_yeast_pct", 0.1),
            data.get("autolisi_water_pct", 0.0), data.get("malto_pct", 0.0),
            data.get("carbone_pct", 0.0), data.get("olio_pct", 0.0),
            extras, data.get("notes"), data.get("sort_order", 0),
            data.get("recipe_type", "pizza"), flour_mix,
            data.get("timing_template_key") or None,
            data.get("lm_pct", 0.0), data.get("lm_hydration_pct", 60.0)
        ))
        return cur.lastrowid


def update_recipe(recipe_id: int, data: dict):
    extras = data.get("extra_ingredients", [])
    if isinstance(extras, list):
        extras = json.dumps(extras)
    flour_mix = data.get("flour_mix")
    if isinstance(flour_mix, dict):
        flour_mix = json.dumps(flour_mix)
    with get_conn() as conn:
        conn.execute("""
            UPDATE recipes SET
              name=?, description=?, base_flour_g=?, default_pieces=?, default_ball_g=?,
              hydration_pct=?, salt_pct=?, yeast_pct=?, biga_pct=?, poolish_pct=?, autolisi_pct=?,
              biga_hydration_pct=?, biga_yeast_pct=?, poolish_yeast_pct=?,
              autolisi_water_pct=?, malto_pct=?, carbone_pct=?, olio_pct=?,
              extra_ingredients=?, notes=?, sort_order=?, recipe_type=?, flour_mix=?,
              timing_template_key=?, lm_pct=?, lm_hydration_pct=?
            WHERE id=?
        """, (
            data["name"], data.get("description"), data["base_flour_g"],
            data["default_pieces"], data["default_ball_g"],
            data["hydration_pct"], data["salt_pct"], data.get("yeast_pct", 0),
            data.get("biga_pct", 0), data.get("poolish_pct", 0), data.get("autolisi_pct", 0),
            data.get("biga_hydration_pct", 44.0), data.get("biga_yeast_pct", 0.5),
            data.get("poolish_yeast_pct", 0.1),
            data.get("autolisi_water_pct", 0.0), data.get("malto_pct", 0.0),
            data.get("carbone_pct", 0.0), data.get("olio_pct", 0.0),
            extras, data.get("notes"), data.get("sort_order", 0),
            data.get("recipe_type", "pizza"), flour_mix,
            data.get("timing_template_key") or None,
            data.get("lm_pct", 0.0), data.get("lm_hydration_pct", 60.0),
            recipe_id
        ))


def delete_recipe(recipe_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))


def update_recipe_sort(recipe_id: int, sort_order: int):
    with get_conn() as conn:
        conn.execute("UPDATE recipes SET sort_order=? WHERE id=?", (sort_order, recipe_id))


# ── Variants ─────────────────────────────────────────────────────────────────

def create_variant(recipe_id: int, name: str, sort_order: int = 0, description: str = None) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO variants (recipe_id, name, sort_order, description) VALUES (?,?,?,?)",
            (recipe_id, name, sort_order, description)
        )
        return cur.lastrowid


def update_variant(variant_id: int, name: str, description: str = None):
    with get_conn() as conn:
        conn.execute(
            "UPDATE variants SET name=?, description=? WHERE id=?",
            (name, description, variant_id)
        )


def delete_variant(variant_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM variants WHERE id = ?", (variant_id,))


def get_variant(variant_id: int):
    with get_conn() as conn:
        v = conn.execute("SELECT * FROM variants WHERE id = ?", (variant_id,)).fetchone()
        if not v:
            return None
        v = dict(v)
        toppings = conn.execute(
            "SELECT * FROM toppings WHERE variant_id = ? ORDER BY sort_order, id",
            (variant_id,)
        ).fetchall()
        v["toppings"] = [dict(t) for t in toppings]
        return v


def get_all_variants():
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT v.id, v.name, v.recipe_id, r.name as recipe_name
            FROM variants v
            JOIN recipes r ON r.id = v.recipe_id
            ORDER BY r.sort_order, r.id, v.sort_order, v.id
        """).fetchall()
        return [dict(r) for r in rows]


# ── Toppings ─────────────────────────────────────────────────────────────────

def create_topping(variant_id: int, data: dict) -> int:
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO toppings
              (variant_id, name, quantity_g, kcal_per100, protein_per100, carbs_per100,
               fat_per100, fiber_per100, ingredient_id, sort_order)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (
            variant_id, data["name"], data.get("quantity_g", 0),
            data.get("kcal_per100"), data.get("protein_per100"),
            data.get("carbs_per100"), data.get("fat_per100"),
            data.get("fiber_per100"), data.get("ingredient_id"),
            data.get("sort_order", 0)
        ))
        return cur.lastrowid


def update_topping(topping_id: int, data: dict):
    with get_conn() as conn:
        conn.execute("""
            UPDATE toppings SET
              name=?, quantity_g=?, kcal_per100=?, protein_per100=?, carbs_per100=?,
              fat_per100=?, fiber_per100=?, ingredient_id=?
            WHERE id=?
        """, (
            data["name"], data.get("quantity_g", 0),
            data.get("kcal_per100"), data.get("protein_per100"),
            data.get("carbs_per100"), data.get("fat_per100"),
            data.get("fiber_per100"), data.get("ingredient_id"),
            topping_id
        ))


def delete_topping(topping_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM toppings WHERE id = ?", (topping_id,))


def update_topping_sort(topping_id: int, sort_order: int):
    with get_conn() as conn:
        conn.execute("UPDATE toppings SET sort_order=? WHERE id=?", (sort_order, topping_id))


def copy_variant(variant_id: int, target_recipe_id: int) -> int:
    with get_conn() as conn:
        src = dict(conn.execute("SELECT * FROM variants WHERE id=?", (variant_id,)).fetchone())
        new_vid = conn.execute(
            "INSERT INTO variants (recipe_id, name, sort_order, description) VALUES (?,?,?,?)",
            (target_recipe_id, src["name"], src.get("sort_order", 0), src.get("description"))
        ).lastrowid
        toppings = conn.execute(
            "SELECT * FROM toppings WHERE variant_id=? ORDER BY sort_order, id", (variant_id,)
        ).fetchall()
        for t in toppings:
            t = dict(t)
            conn.execute("""
                INSERT INTO toppings
                  (variant_id, name, quantity_g, kcal_per100, protein_per100, carbs_per100,
                   fat_per100, fiber_per100, ingredient_id, sort_order)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (new_vid, t["name"], t["quantity_g"], t.get("kcal_per100"), t.get("protein_per100"),
                  t.get("carbs_per100"), t.get("fat_per100"), t.get("fiber_per100"),
                  t.get("ingredient_id"), t.get("sort_order", 0)))
        return new_vid


def copy_toppings_to_variant(source_variant_id: int, target_variant_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM toppings WHERE variant_id=?", (target_variant_id,))
        toppings = conn.execute(
            "SELECT * FROM toppings WHERE variant_id=? ORDER BY sort_order, id", (source_variant_id,)
        ).fetchall()
        for t in toppings:
            t = dict(t)
            conn.execute("""
                INSERT INTO toppings
                  (variant_id, name, quantity_g, kcal_per100, protein_per100, carbs_per100,
                   fat_per100, fiber_per100, ingredient_id, sort_order)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (target_variant_id, t["name"], t["quantity_g"], t.get("kcal_per100"),
                  t.get("protein_per100"), t.get("carbs_per100"), t.get("fat_per100"),
                  t.get("fiber_per100"), t.get("ingredient_id"), t.get("sort_order", 0)))


# ── Ingredients ───────────────────────────────────────────────────────────────

def get_ingredients():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM ingredients ORDER BY name COLLATE NOCASE, id"
        ).fetchall()
        return [dict(r) for r in rows]


def get_ingredient(ingredient_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM ingredients WHERE id = ?", (ingredient_id,)).fetchone()
        return dict(row) if row else None


def create_ingredient(data: dict) -> int:
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO ingredients (name, kcal_per100, protein_per100, carbs_per100, fat_per100, fiber_per100, cost_per100, sort_order)
            VALUES (?,?,?,?,?,?,?,?)
        """, (
            data["name"], data.get("kcal_per100", 0), data.get("protein_per100", 0),
            data.get("carbs_per100", 0), data.get("fat_per100", 0),
            data.get("fiber_per100", 0), data.get("cost_per100", 0), data.get("sort_order", 0)
        ))
        return cur.lastrowid


def update_ingredient(ingredient_id: int, data: dict):
    with get_conn() as conn:
        conn.execute("""
            UPDATE ingredients SET
              name=?, kcal_per100=?, protein_per100=?, carbs_per100=?, fat_per100=?, fiber_per100=?, cost_per100=?
            WHERE id=?
        """, (
            data["name"], data.get("kcal_per100", 0), data.get("protein_per100", 0),
            data.get("carbs_per100", 0), data.get("fat_per100", 0),
            data.get("fiber_per100", 0), data.get("cost_per100", 0), ingredient_id
        ))
        # Propagate name and macros to all toppings linked to this ingredient (preserve quantity_g)
        conn.execute("""
            UPDATE toppings SET
              name=?, kcal_per100=?, protein_per100=?, carbs_per100=?, fat_per100=?, fiber_per100=?
            WHERE ingredient_id=?
        """, (
            data["name"], data.get("kcal_per100") or 0, data.get("protein_per100") or 0,
            data.get("carbs_per100") or 0, data.get("fat_per100") or 0,
            data.get("fiber_per100") or 0, ingredient_id
        ))


def delete_ingredient(ingredient_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM ingredients WHERE id = ?", (ingredient_id,))


# ── Timing Guides ─────────────────────────────────────────────────────────────

def get_timing_guides():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM timing_guides ORDER BY sort_order, id"
        ).fetchall()
        return [dict(r) for r in rows]


def create_timing_guide(name: str, content: str, sort_order: int = 0) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO timing_guides (name, content, sort_order) VALUES (?,?,?)",
            (name, content, sort_order)
        )
        return cur.lastrowid


def update_timing_guide(guide_id: int, name: str, content: str):
    with get_conn() as conn:
        conn.execute(
            "UPDATE timing_guides SET name=?, content=? WHERE id=?",
            (name, content, guide_id)
        )


# ── Timing Templates ──────────────────────────────────────────────────────────

_DEFAULT_TIMING_TEMPLATES = [
    {
        "key": "focaccia",
        "name": "Focaccia Romana in Teglia",
        "emoji": "🟢",
        "calendar_color_id": "2",
        "service_label": "Orario in cui la focaccia è pronta",
        "service_event_name": "🍕 Focaccia pronta — Servizio",
        "service_event_duration": 0,
        "sort_order": 1,
        "steps": json.dumps([
            {"name": "Preparazione prefermenti (biga + poolish)", "inverno": 15, "estate": 15, "note": ""},
            {"name": "Prefermenti a temperatura ambiente", "inverno": 240, "estate": 60, "note": "Poolish dopo 1h può andare in frigo"},
            {"name": "Prefermenti in frigo", "inverno": 1440, "estate": 1440, "note": "Minimo 24h, max 48h"},
            {"name": "Chiusura impasto", "inverno": 30, "estate": 30, "note": ""},
            {"name": "Riposo impasto", "inverno": 120, "estate": 60, "note": "Guida: 1.5× volume"},
            {"name": "Staglio", "inverno": 15, "estate": 15, "note": "Base umida in alto, cospargi farina"},
            {"name": "Lievitazione panetti + stesura", "inverno": 240, "estate": 240, "note": "Guida: 2× volume. Stesura: 80% teglia, parte umida sotto, lavora ultimi 2cm"},
            {"name": "Accensione forno + preriscaldo", "inverno": 30, "estate": 30, "note": "280-290°", "parallel": True},
            {"name": "Prima cottura", "inverno": 10, "estate": 10, "note": "Fondo più che platea"},
            {"name": "Seconda cottura", "inverno": 3, "estate": 3, "note": "2-4 min, stessa T°, sciogliere ingredienti"},
        ]),
    },
    {
        "key": "napoletana",
        "name": "Pizza Napoletana",
        "emoji": "🍕",
        "calendar_color_id": "7",
        "service_label": "Orario di inizio pizzata (prima pizza)",
        "service_event_name": "🍕 Pizzata",
        "service_event_duration": 90,
        "sort_order": 2,
        "steps": json.dumps([
            {"name": "Preparazione prefermenti (biga + poolish)", "inverno": 15, "estate": 15, "note": ""},
            {"name": "Prefermenti a temperatura ambiente", "inverno": 240, "estate": 60, "note": "Poolish dopo 1h può andare in frigo"},
            {"name": "Prefermenti in frigo", "inverno": 1440, "estate": 1440, "note": "Minimo 24h, max 48h"},
            {"name": "Chiusura impasto", "inverno": 30, "estate": 30, "note": ""},
            {"name": "Riposo impasto", "inverno": 120, "estate": 60, "note": "Guida: 1.5× volume"},
            {"name": "Staglio", "inverno": 15, "estate": 15, "note": "Base umida in alto, cospargi farina"},
            {"name": "Lievitazione panetti", "inverno": 210, "estate": 120, "note": "Guida: 2× volume"},
            {"name": "Accensione forno + preriscaldo", "inverno": 25, "estate": 25, "note": "", "parallel": True},
        ]),
    },
    {
        "key": "brioche",
        "name": "Pasta Brioche",
        "emoji": "🥐",
        "calendar_color_id": "5",
        "service_label": "Orario di uscita dal forno",
        "service_event_name": "🥐 Brioche pronta — Servizio",
        "service_event_duration": 0,
        "sort_order": 3,
        "steps": json.dumps([
            {"name": "Impasto fase 1 (formazione glutine)", "inverno": 10, "estate": 10, "note": "Tutti gli ingredienti eccetto metà zucchero, sale, burro, aromi"},
            {"name": "Impasto fase 2 (struttura finale)", "inverno": 10, "estate": 60, "note": "Aggiungi zucchero + sale. Controlla T° < 26°, altrimenti frigo"},
            {"name": "Impasto fase 3 — chiusura", "inverno": 15, "estate": 15, "note": "Burro + aromi poco alla volta. T° 24-26° se frigo, 27-28° se porzioni subito"},
            {"name": "Riposo a temperatura ambiente", "inverno": 20, "estate": 20, "note": ""},
            {"name": "Lievitazione massa in frigo 4°", "inverno": 720, "estate": 480, "note": "Guida: 1.5× volume"},
            {"name": "Divisione e formatura", "inverno": 10, "estate": 10, "note": "Conviene fare preforma"},
            {"name": "Lievitazione + farcitura forme", "inverno": 240, "estate": 120, "note": "Guida: 2× volume"},
            {"name": "Cottura", "inverno": 20, "estate": 20, "note": "Preriscaldo 190°, abbassa a 170° in infornata. Bun: 15-17 min, Bauletti: 25 min"},
        ]),
    },
]


def seed_timing_templates():
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM timing_templates").fetchone()[0]
        if count > 0:
            return
        for t in _DEFAULT_TIMING_TEMPLATES:
            conn.execute("""
                INSERT INTO timing_templates
                  (key, name, emoji, calendar_color_id, service_label,
                   service_event_name, service_event_duration, steps, sort_order)
                VALUES (?,?,?,?,?,?,?,?,?)
            """, (t["key"], t["name"], t["emoji"], t["calendar_color_id"],
                  t["service_label"], t["service_event_name"],
                  t["service_event_duration"], t["steps"], t["sort_order"]))


def get_timing_templates():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM timing_templates ORDER BY sort_order, id"
        ).fetchall()
        return [dict(r) for r in rows]


def update_timing_template(key: str, steps_json: str):
    with get_conn() as conn:
        conn.execute(
            "UPDATE timing_templates SET steps=? WHERE key=?",
            (steps_json, key)
        )


def delete_timing_template(key: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM timing_templates WHERE key=?", (key,))


def create_timing_template(key: str, name: str, calendar_color_id: str, steps: list) -> dict:
    with get_conn() as conn:
        max_sort = conn.execute("SELECT COALESCE(MAX(sort_order), 0) FROM timing_templates").fetchone()[0]
        conn.execute(
            """INSERT OR REPLACE INTO timing_templates
               (key, name, emoji, calendar_color_id, service_label, service_event_name,
                service_event_duration, steps, sort_order)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (key, name, '', calendar_color_id,
             'Orario di uscita dal forno', f'{name} — Servizio',
             0, json.dumps(steps), max_sort + 10)
        )
    return {"key": key, "name": name, "calendar_color_id": calendar_color_id, "steps": steps}


def backfill_timing_templates():
    _PANE_STEPS = [
        {"name": "Rinfresco LM",      "inverno": 720, "estate": 480, "note": ""},
        {"name": "Autolisi",           "inverno": 60,  "estate": 60,  "note": ""},
        {"name": "Impasto",            "inverno": 30,  "estate": 30,  "note": ""},
        {"name": "Puntata",            "inverno": 180, "estate": 120, "note": ""},
        {"name": "Formatura",          "inverno": 20,  "estate": 20,  "note": ""},
        {"name": "Apretto (frigo)",    "inverno": 720, "estate": 720, "note": ""},
        {"name": "Pre-riscaldo forno", "inverno": 60,  "estate": 60,  "note": ""},
        {"name": "Cottura",            "inverno": 50,  "estate": 45,  "note": ""},
    ]
    _missing = [
        {
            "key": "pane",
            "name": "🍞 Pane",
            "emoji": "🍞",
            "calendar_color_id": "2",
            "service_label": "Orario di uscita dal forno",
            "service_event_name": "🍞 Pane pronto — Servizio",
            "service_event_duration": 0,
            "sort_order": 4,
            "steps": json.dumps(_PANE_STEPS),
        }
    ]
    with get_conn() as conn:
        existing = {r[0] for r in conn.execute("SELECT key FROM timing_templates").fetchall()}
        for t in _missing:
            if t["key"] not in existing:
                conn.execute(
                    """INSERT INTO timing_templates
                       (key, name, emoji, calendar_color_id, service_label,
                        service_event_name, service_event_duration, steps, sort_order)
                       VALUES (?,?,?,?,?,?,?,?,?)""",
                    (t["key"], t["name"], t["emoji"], t["calendar_color_id"],
                     t["service_label"], t["service_event_name"],
                     t["service_event_duration"], t["steps"], t["sort_order"])
                )


# ── Import Log ────────────────────────────────────────────────────────────────

def log_import(filename: str, recipes_imported: int, notes: str = ""):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO import_log (filename, recipes_imported, notes) VALUES (?,?,?)",
            (filename, recipes_imported, notes)
        )


def get_last_import():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM import_log ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None
