from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ScaleResult:
    flour_g: float
    water_g: float
    salt_g: float
    yeast_g: float
    total_dough_g: float
    actual_ball_g: float
    actual_pieces: int
    biga_flour_g: float
    poolish_flour_g: float
    autolisi_flour_g: float
    extra_ingredients: list = field(default_factory=list)


def scale_dough(
    base_flour_g: float,
    default_pieces: int,
    default_ball_g: float,
    hydration_pct: float,
    salt_pct: float,
    yeast_pct: float,
    biga_pct: float,
    poolish_pct: float,
    autolisi_pct: float,
    extra_ingredients: list,
    target_pieces: Optional[int] = None,
    target_flour_g: Optional[float] = None,
    ball_weight_g: Optional[float] = None,
) -> ScaleResult:
    extras = extra_ingredients or []
    extra_sum_pct = sum(e.get("pct", 0) for e in extras)
    sum_pcts = hydration_pct + salt_pct + yeast_pct + extra_sum_pct
    dough_per_flour = 1 + sum_pcts / 100

    if target_flour_g:
        flour = float(target_flour_g)
        bw = ball_weight_g or default_ball_g
        total_dough = flour * dough_per_flour
        pieces = max(1, round(total_dough / bw))
    elif target_pieces:
        bw = ball_weight_g or default_ball_g
        flour = (target_pieces * bw) / dough_per_flour
        pieces = target_pieces
        total_dough = flour * dough_per_flour
    else:
        flour = float(base_flour_g)
        pieces = default_pieces
        total_dough = flour * dough_per_flour
        bw = ball_weight_g or default_ball_g

    water = flour * hydration_pct / 100
    salt = flour * salt_pct / 100
    yeast = flour * yeast_pct / 100
    biga_flour = flour * biga_pct / 100
    poolish_flour = flour * poolish_pct / 100
    autolisi_flour = flour * autolisi_pct / 100
    actual_ball = total_dough / pieces if pieces > 0 else total_dough

    scaled_extras = [
        {"name": e["name"], "pct": e["pct"], "grams": round(flour * e["pct"] / 100, 1)}
        for e in extras
    ]

    return ScaleResult(
        flour_g=round(flour, 1),
        water_g=round(water, 1),
        salt_g=round(salt, 1),
        yeast_g=round(yeast, 1),
        total_dough_g=round(total_dough, 1),
        actual_ball_g=round(actual_ball, 1),
        actual_pieces=pieces,
        biga_flour_g=round(biga_flour, 1),
        poolish_flour_g=round(poolish_flour, 1),
        autolisi_flour_g=round(autolisi_flour, 1),
        extra_ingredients=scaled_extras,
    )


def calc_topping_nutrition(
    quantity_g: float,
    kcal_per100,
    protein_per100,
    carbs_per100,
    fat_per100,
    fiber_per100=None,
):
    factor = quantity_g / 100
    return {
        "kcal":      round((kcal_per100    or 0) * factor, 1),
        "protein_g": round((protein_per100 or 0) * factor, 1),
        "carbs_g":   round((carbs_per100   or 0) * factor, 1),
        "fat_g":     round((fat_per100     or 0) * factor, 1),
        "fiber_g":   round((fiber_per100   or 0) * factor, 1),
    }


def sum_macros(macro_list: list) -> dict:
    result = {"kcal": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "fiber_g": 0.0}
    for m in macro_list:
        for k in result:
            result[k] += m.get(k, 0)
    for k in result:
        result[k] = round(result[k], 1)
    return result


def calc_party(
    recipe: dict,
    target_pieces: int,
    ball_weight_g: float,
    hydration_pct: float,
    salt_pct: float,
    yeast_pct: float,
    biga_pct: float,
    poolish_pct: float,
    autolisi_pct: float,
    variant_quantities: list,
    portion_denominator: int = 4,
) -> dict:
    dough = scale_dough(
        base_flour_g=recipe["base_flour_g"],
        default_pieces=recipe["default_pieces"],
        default_ball_g=recipe["default_ball_g"],
        hydration_pct=hydration_pct,
        salt_pct=salt_pct,
        yeast_pct=yeast_pct,
        biga_pct=biga_pct,
        poolish_pct=poolish_pct,
        autolisi_pct=autolisi_pct,
        extra_ingredients=recipe.get("extra_ingredients") or [],
        target_pieces=target_pieces,
        ball_weight_g=ball_weight_g,
    )

    variants_out = []
    shopping_totals: dict[str, float] = {}

    for vq in variant_quantities:
        count = vq.get("count", 0)
        toppings = vq.get("toppings", [])

        topping_details = []
        for t in toppings:
            qty = t.get("quantity_g", 0) or 0
            macros = calc_topping_nutrition(
                qty,
                t.get("kcal_per100"),
                t.get("protein_per100"),
                t.get("carbs_per100"),
                t.get("fat_per100"),
                t.get("fiber_per100"),
            )
            total_g = round(qty * count, 1)
            topping_details.append({
                "name": t["name"],
                "quantity_g_per_pizza": round(qty, 1),
                "total_g": total_g,
                "kcal_per_pizza": macros["kcal"],
                "macros_per_pizza": macros,
            })
            key = t["name"]
            shopping_totals[key] = round(shopping_totals.get(key, 0) + total_g, 1)

        per_pizza = sum_macros([td["macros_per_pizza"] for td in topping_details])
        per_portion = {k: round(v / portion_denominator, 1) for k, v in per_pizza.items()}

        variants_out.append({
            "variant_id": vq["variant_id"],
            "name": vq["name"],
            "count": count,
            "toppings": topping_details,
            "per_pizza_macros": per_pizza,
            "per_portion_macros": per_portion,
        })

    shopping_list = sorted(
        [{"name": k, "total_g": v} for k, v in shopping_totals.items()],
        key=lambda x: x["total_g"],
        reverse=True,
    )

    return {
        "dough": {
            "flour_g": dough.flour_g,
            "water_g": dough.water_g,
            "salt_g": dough.salt_g,
            "yeast_g": dough.yeast_g,
            "total_dough_g": dough.total_dough_g,
            "actual_ball_g": dough.actual_ball_g,
            "actual_pieces": dough.actual_pieces,
            "biga_flour_g": dough.biga_flour_g,
            "poolish_flour_g": dough.poolish_flour_g,
            "autolisi_flour_g": dough.autolisi_flour_g,
            "extra_ingredients": dough.extra_ingredients,
        },
        "variants": variants_out,
        "shopping_list": shopping_list,
    }


def calc_water_temp(
    flour_temp: float,
    bowl_temp: float,
    ambient_temp: float,
    constant: float = 55.0,
) -> float:
    return round(constant - flour_temp - bowl_temp - ambient_temp, 1)
