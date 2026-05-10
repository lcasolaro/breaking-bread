from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional
import io
import os

import app.db as db
from app.calculator import scale_dough, calc_party, calc_water_temp
from app.importer import import_excel

app = FastAPI(title="Breaking Bread")
db.init_db()
db.seed_ingredients()

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def root():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# ── Recipes ──────────────────────────────────────────────────────────────────

class RecipeBody(BaseModel):
    name: str
    description: Optional[str] = None
    base_flour_g: float
    default_pieces: int
    default_ball_g: float
    hydration_pct: float
    salt_pct: float
    yeast_pct: float = 0.0
    biga_pct: float = 0.0
    poolish_pct: float = 0.0
    autolisi_pct: float = 0.0
    biga_hydration_pct: float = 44.0
    biga_yeast_pct: float = 0.5
    poolish_yeast_pct: float = 0.1
    autolisi_water_pct: float = 0.0
    malto_pct: float = 0.0
    carbone_pct: float = 0.0
    olio_pct: float = 0.0
    extra_ingredients: list = []
    notes: Optional[str] = None
    sort_order: int = 0


@app.get("/api/recipes")
def list_recipes():
    return db.get_recipes()


@app.get("/api/recipes/{recipe_id}")
def get_recipe(recipe_id: int):
    r = db.get_recipe(recipe_id)
    if not r:
        raise HTTPException(404, "Ricetta non trovata")
    return r


@app.post("/api/recipes", status_code=201)
def create_recipe(body: RecipeBody):
    rid = db.create_recipe(body.model_dump())
    return db.get_recipe(rid)


@app.put("/api/recipes/{recipe_id}")
def update_recipe(recipe_id: int, body: RecipeBody):
    if not db.get_recipe(recipe_id):
        raise HTTPException(404, "Ricetta non trovata")
    db.update_recipe(recipe_id, body.model_dump())
    return db.get_recipe(recipe_id)


@app.delete("/api/recipes/{recipe_id}")
def delete_recipe(recipe_id: int):
    db.delete_recipe(recipe_id)
    return {"ok": True}


class SortBody(BaseModel):
    sort_order: int

@app.patch("/api/recipes/{recipe_id}/sort")
def sort_recipe(recipe_id: int, body: SortBody):
    if not db.get_recipe(recipe_id):
        raise HTTPException(404, "Ricetta non trovata")
    db.update_recipe_sort(recipe_id, body.sort_order)
    return {"ok": True}


@app.get("/api/import-template")
def download_template(type: str = "recipes"):
    from app.importer import create_import_template, create_ingredients_template
    buf = io.BytesIO()
    if type == "ingredients":
        create_ingredients_template().save(buf)
        filename = "template_ingredienti.xlsx"
    else:
        create_import_template().save(buf)
        filename = "template_ricette.xlsx"
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/api/export-excel")
def export_excel(ids: str = None, type: str = "recipes"):
    from app.importer import export_to_excel
    recipe_ids = [int(x) for x in ids.split(',') if x.strip()] if ids else None
    buf = io.BytesIO()
    export_to_excel(recipe_ids=recipe_ids, export_type=type).save(buf)
    buf.seek(0)
    filenames = {"ingredients": "ingredienti.xlsx", "backup": "backup_completo.xlsx"}
    filename = filenames.get(type, "ricette_export.xlsx")
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.post("/api/preview-import")
async def preview_import_route(file: UploadFile = File(...)):
    from app.importer import preview_excel_import
    buf = io.BytesIO(await file.read())
    return preview_excel_import(buf)


# ── Variants ─────────────────────────────────────────────────────────────────

@app.get("/api/variants")
def list_all_variants():
    return db.get_all_variants()


class VariantBody(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: int = 0


@app.post("/api/recipes/{recipe_id}/variants", status_code=201)
def create_variant(recipe_id: int, body: VariantBody):
    if not db.get_recipe(recipe_id):
        raise HTTPException(404, "Ricetta non trovata")
    vid = db.create_variant(recipe_id, body.name, body.sort_order, body.description)
    return db.get_variant(vid)


@app.put("/api/variants/{variant_id}")
def update_variant(variant_id: int, body: VariantBody):
    db.update_variant(variant_id, body.name, body.description)
    return db.get_variant(variant_id)


@app.delete("/api/variants/{variant_id}")
def delete_variant(variant_id: int):
    db.delete_variant(variant_id)
    return {"ok": True}


# ── Toppings ─────────────────────────────────────────────────────────────────

class ToppingBody(BaseModel):
    name: str
    quantity_g: float = 0.0
    kcal_per100: Optional[float] = None
    protein_per100: Optional[float] = None
    carbs_per100: Optional[float] = None
    fat_per100: Optional[float] = None
    fiber_per100: Optional[float] = None
    ingredient_id: Optional[int] = None
    sort_order: int = 0


@app.post("/api/variants/{variant_id}/toppings", status_code=201)
def create_topping(variant_id: int, body: ToppingBody):
    tid = db.create_topping(variant_id, body.model_dump())
    return {"id": tid, **body.model_dump()}


@app.put("/api/toppings/{topping_id}")
def update_topping(topping_id: int, body: ToppingBody):
    db.update_topping(topping_id, body.model_dump())
    return {"ok": True}


@app.delete("/api/toppings/{topping_id}")
def delete_topping(topping_id: int):
    db.delete_topping(topping_id)
    return {"ok": True}


class ToppingSortBody(BaseModel):
    sort_order: int

@app.patch("/api/toppings/{topping_id}/sort")
def sort_topping(topping_id: int, body: ToppingSortBody):
    db.update_topping_sort(topping_id, body.sort_order)
    return {"ok": True}


class CopyVariantBody(BaseModel):
    target_recipe_id: int

@app.post("/api/variants/{variant_id}/copy", status_code=201)
def copy_variant_route(variant_id: int, body: CopyVariantBody):
    new_vid = db.copy_variant(variant_id, body.target_recipe_id)
    return db.get_variant(new_vid)


class CopyToppingsBody(BaseModel):
    target_variant_id: int

@app.post("/api/variants/{variant_id}/copy-toppings")
def copy_toppings_route(variant_id: int, body: CopyToppingsBody):
    db.copy_toppings_to_variant(variant_id, body.target_variant_id)
    return {"ok": True}


# ── Ingredients ───────────────────────────────────────────────────────────────

class IngredientBody(BaseModel):
    name: str
    kcal_per100: float = 0.0
    protein_per100: float = 0.0
    carbs_per100: float = 0.0
    fat_per100: float = 0.0
    fiber_per100: float = 0.0
    sort_order: int = 0


@app.get("/api/ingredients")
def list_ingredients():
    return db.get_ingredients()


@app.post("/api/ingredients", status_code=201)
def create_ingredient(body: IngredientBody):
    iid = db.create_ingredient(body.model_dump())
    return db.get_ingredient(iid)


@app.put("/api/ingredients/{ingredient_id}")
def update_ingredient_route(ingredient_id: int, body: IngredientBody):
    db.update_ingredient(ingredient_id, body.model_dump())
    return db.get_ingredient(ingredient_id)


@app.delete("/api/ingredients/{ingredient_id}")
def delete_ingredient_route(ingredient_id: int):
    db.delete_ingredient(ingredient_id)
    return {"ok": True}


@app.get("/api/lookup-nutrition")
def lookup_nutrition(name: str, limit: int = 1):
    import urllib.request, urllib.parse, json as _json
    url = (
        "https://world.openfoodfacts.org/cgi/search.pl?"
        + urllib.parse.urlencode({
            "search_terms": name,
            "search_simple": 1,
            "action": "process",
            "json": 1,
            "page_size": min(limit * 3, 20),
            "fields": "product_name,nutriments",
        })
    )
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            data = _json.loads(resp.read().decode())
    except Exception as e:
        raise HTTPException(502, f"OpenFoodFacts non raggiungibile: {e}")

    results = []
    for p in data.get("products", []):
        n = p.get("nutriments", {})
        kcal_field = n.get("energy-kcal_100g")
        kj_field   = n.get("energy_100g")
        if kcal_field is not None and float(kcal_field) > 0:
            kcal = round(float(kcal_field), 1)
        elif kj_field is not None and float(kj_field) > 0:
            kcal = round(float(kj_field) / 4.184, 1)
        else:
            continue
        results.append({
            "source_name":    p.get("product_name", name),
            "kcal_per100":    kcal,
            "protein_per100": round(float(n.get("proteins_100g") or 0), 1),
            "carbs_per100":   round(float(n.get("carbohydrates_100g") or 0), 1),
            "fat_per100":     round(float(n.get("fat_100g") or 0), 1),
            "fiber_per100":   round(float(n.get("fiber_100g") or 0), 1),
        })
        if len(results) >= limit:
            break

    if not results:
        raise HTTPException(404, "Nessun risultato trovato su OpenFoodFacts")
    return results if limit > 1 else results[0]


# ── Calculator ────────────────────────────────────────────────────────────────

class ScaleRequest(BaseModel):
    target_pieces: Optional[int] = None
    target_flour_g: Optional[float] = None
    ball_weight_g: Optional[float] = None
    hydration_pct: Optional[float] = None
    salt_pct: Optional[float] = None
    yeast_pct: Optional[float] = None
    biga_pct: Optional[float] = None
    poolish_pct: Optional[float] = None
    autolisi_pct: Optional[float] = None


@app.post("/api/recipes/{recipe_id}/scale")
def scale_recipe(recipe_id: int, body: ScaleRequest):
    recipe = db.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(404, "Ricetta non trovata")

    result = scale_dough(
        base_flour_g=recipe["base_flour_g"],
        default_pieces=recipe["default_pieces"],
        default_ball_g=recipe["default_ball_g"],
        hydration_pct=body.hydration_pct if body.hydration_pct is not None else recipe["hydration_pct"],
        salt_pct=body.salt_pct if body.salt_pct is not None else recipe["salt_pct"],
        yeast_pct=body.yeast_pct if body.yeast_pct is not None else recipe["yeast_pct"],
        biga_pct=body.biga_pct if body.biga_pct is not None else recipe["biga_pct"],
        poolish_pct=body.poolish_pct if body.poolish_pct is not None else recipe["poolish_pct"],
        autolisi_pct=body.autolisi_pct if body.autolisi_pct is not None else recipe["autolisi_pct"],
        extra_ingredients=recipe.get("extra_ingredients") or [],
        target_pieces=body.target_pieces,
        target_flour_g=body.target_flour_g,
        ball_weight_g=body.ball_weight_g,
    )
    return {
        "flour_g": result.flour_g,
        "water_g": result.water_g,
        "salt_g": result.salt_g,
        "yeast_g": result.yeast_g,
        "total_dough_g": result.total_dough_g,
        "actual_ball_g": result.actual_ball_g,
        "actual_pieces": result.actual_pieces,
        "biga_flour_g": result.biga_flour_g,
        "poolish_flour_g": result.poolish_flour_g,
        "autolisi_flour_g": result.autolisi_flour_g,
        "extra_ingredients": result.extra_ingredients,
    }


class PartyVariantItem(BaseModel):
    variant_id: int
    count: int


class PartyRequest(BaseModel):
    recipe_id: int
    target_pieces: int
    ball_weight_g: Optional[float] = None
    hydration_pct: Optional[float] = None
    salt_pct: Optional[float] = None
    yeast_pct: Optional[float] = None
    biga_pct: Optional[float] = None
    poolish_pct: Optional[float] = None
    autolisi_pct: Optional[float] = None
    variant_quantities: list[PartyVariantItem] = []
    portion_denominator: int = 4


@app.post("/api/pizza-party")
def pizza_party(body: PartyRequest):
    recipe = db.get_recipe(body.recipe_id)
    if not recipe:
        raise HTTPException(404, "Ricetta non trovata")

    vq_list = []
    for vq in body.variant_quantities:
        variant = db.get_variant(vq.variant_id)
        if not variant:
            continue
        vq_list.append({
            "variant_id": vq.variant_id,
            "count": vq.count,
            "name": variant["name"],
            "toppings": variant["toppings"],
        })

    result = calc_party(
        recipe=recipe,
        target_pieces=body.target_pieces,
        ball_weight_g=body.ball_weight_g or recipe["default_ball_g"],
        hydration_pct=body.hydration_pct if body.hydration_pct is not None else recipe["hydration_pct"],
        salt_pct=body.salt_pct if body.salt_pct is not None else recipe["salt_pct"],
        yeast_pct=body.yeast_pct if body.yeast_pct is not None else recipe["yeast_pct"],
        biga_pct=body.biga_pct if body.biga_pct is not None else recipe["biga_pct"],
        poolish_pct=body.poolish_pct if body.poolish_pct is not None else recipe["poolish_pct"],
        autolisi_pct=body.autolisi_pct if body.autolisi_pct is not None else recipe["autolisi_pct"],
        variant_quantities=vq_list,
        portion_denominator=body.portion_denominator,
    )
    return result


@app.get("/api/water-temp")
def water_temp(
    flour_temp: float = 20.0,
    bowl_temp: float = 20.0,
    ambient_temp: float = 20.0,
    constant: float = 55.0,
):
    temp = calc_water_temp(flour_temp, bowl_temp, ambient_temp, constant)
    warning = None
    if temp < 0:
        warning = "Temperatura negativa: usa acqua ghiacciata o riduci il costante"
    elif temp > 30:
        warning = "Temperatura alta: potrebbe accelerare troppo la lievitazione"
    return {"water_temp_c": temp, "warning": warning}


# ── Timing Guides ─────────────────────────────────────────────────────────────

class TimingBody(BaseModel):
    name: str
    content: str


@app.get("/api/timing-guides")
def list_timing_guides():
    return db.get_timing_guides()


@app.put("/api/timing-guides/{guide_id}")
def update_timing_guide(guide_id: int, body: TimingBody):
    db.update_timing_guide(guide_id, body.name, body.content)
    return {"ok": True}


# ── Import ────────────────────────────────────────────────────────────────────

@app.post("/api/import-excel")
async def do_import(file: UploadFile = File(...), reset: bool = False, only: str = None, only_ingredients: str = None):
    only_names = [x.strip() for x in only.split(',') if x.strip()] if only else None
    only_ings = [x.strip() for x in only_ingredients.split(',') if x.strip()] if only_ingredients else None
    buf = io.BytesIO(await file.read())
    result = import_excel(buf, reset=reset, only_names=only_names, only_ingredients=only_ings)
    return result
