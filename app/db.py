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

            CREATE TABLE IF NOT EXISTS variants (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
                name      TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0
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
                sort_order     INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS timing_guides (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                content    TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0
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
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO recipes
              (name, description, base_flour_g, default_pieces, default_ball_g,
               hydration_pct, salt_pct, yeast_pct, biga_pct, poolish_pct, autolisi_pct,
               biga_hydration_pct, biga_yeast_pct, poolish_yeast_pct,
               autolisi_water_pct, malto_pct, carbone_pct, olio_pct,
               extra_ingredients, notes, sort_order)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            data["name"], data.get("description"), data["base_flour_g"],
            data["default_pieces"], data["default_ball_g"],
            data["hydration_pct"], data["salt_pct"], data.get("yeast_pct", 0),
            data.get("biga_pct", 0), data.get("poolish_pct", 0), data.get("autolisi_pct", 0),
            data.get("biga_hydration_pct", 44.0), data.get("biga_yeast_pct", 0.5),
            data.get("poolish_yeast_pct", 0.1),
            data.get("autolisi_water_pct", 0.0), data.get("malto_pct", 0.0),
            data.get("carbone_pct", 0.0), data.get("olio_pct", 0.0),
            extras, data.get("notes"), data.get("sort_order", 0)
        ))
        return cur.lastrowid


def update_recipe(recipe_id: int, data: dict):
    extras = data.get("extra_ingredients", [])
    if isinstance(extras, list):
        extras = json.dumps(extras)
    with get_conn() as conn:
        conn.execute("""
            UPDATE recipes SET
              name=?, description=?, base_flour_g=?, default_pieces=?, default_ball_g=?,
              hydration_pct=?, salt_pct=?, yeast_pct=?, biga_pct=?, poolish_pct=?, autolisi_pct=?,
              biga_hydration_pct=?, biga_yeast_pct=?, poolish_yeast_pct=?,
              autolisi_water_pct=?, malto_pct=?, carbone_pct=?, olio_pct=?,
              extra_ingredients=?, notes=?, sort_order=?
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
            recipe_id
        ))


def delete_recipe(recipe_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))


def update_recipe_sort(recipe_id: int, sort_order: int):
    with get_conn() as conn:
        conn.execute("UPDATE recipes SET sort_order=? WHERE id=?", (sort_order, recipe_id))


# ── Variants ─────────────────────────────────────────────────────────────────

def create_variant(recipe_id: int, name: str, sort_order: int = 0) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO variants (recipe_id, name, sort_order) VALUES (?,?,?)",
            (recipe_id, name, sort_order)
        )
        return cur.lastrowid


def update_variant(variant_id: int, name: str):
    with get_conn() as conn:
        conn.execute("UPDATE variants SET name=? WHERE id=?", (name, variant_id))


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
              (variant_id, name, quantity_g, kcal_per100, protein_per100, carbs_per100, fat_per100, sort_order)
            VALUES (?,?,?,?,?,?,?,?)
        """, (
            variant_id, data["name"], data.get("quantity_g", 0),
            data.get("kcal_per100"), data.get("protein_per100"),
            data.get("carbs_per100"), data.get("fat_per100"),
            data.get("sort_order", 0)
        ))
        return cur.lastrowid


def update_topping(topping_id: int, data: dict):
    with get_conn() as conn:
        conn.execute("""
            UPDATE toppings SET
              name=?, quantity_g=?, kcal_per100=?, protein_per100=?, carbs_per100=?, fat_per100=?
            WHERE id=?
        """, (
            data["name"], data.get("quantity_g", 0),
            data.get("kcal_per100"), data.get("protein_per100"),
            data.get("carbs_per100"), data.get("fat_per100"),
            topping_id
        ))


def delete_topping(topping_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM toppings WHERE id = ?", (topping_id,))


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
