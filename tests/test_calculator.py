import pytest
from app.calculator import scale_dough, calc_party


def test_scale_dough_base_case():
    r = scale_dough(
        base_flour_g=1000,
        default_pieces=4,
        default_ball_g=250,
        hydration_pct=60.0,
        salt_pct=2.5,
        yeast_pct=1.0,
        biga_pct=0,
        poolish_pct=0,
        autolisi_pct=0,
        extra_ingredients=[]
    )
    assert r.flour_g == pytest.approx(1000.0)
    assert r.water_g == pytest.approx(1000.0 * 60.0 / 100.0)


def test_scale_dough_target_pieces_and_ball_weight():
    r = scale_dough(
        base_flour_g=1000,
        default_pieces=4,
        default_ball_g=250,
        hydration_pct=60.0,
        salt_pct=2.5,
        yeast_pct=1.0,
        biga_pct=0,
        poolish_pct=0,
        autolisi_pct=0,
        extra_ingredients=[],
        target_pieces=8,
        ball_weight_g=250
    )
    dough_per_flour = 1 + (60.0 + 2.5 + 1.0) / 100.0
    expected_flour = (8 * 250) / dough_per_flour
    assert r.flour_g == pytest.approx(round(expected_flour, 1))


def test_scale_dough_extra_ingredients_scaled():
    extras = [{"name": "sesamo", "pct": 2.0}, {"name": "olio", "pct": 1.5}]
    r = scale_dough(
        base_flour_g=500,
        default_pieces=2,
        default_ball_g=300,
        hydration_pct=60.0,
        salt_pct=2.5,
        yeast_pct=0.5,
        biga_pct=0,
        poolish_pct=0,
        autolisi_pct=0,
        extra_ingredients=extras
    )
    assert any(e["name"] == "sesamo" and e["grams"] == round(500 * 2.0 / 100, 1) for e in r.extra_ingredients)
    assert any(e["name"] == "olio" and e["grams"] == round(500 * 1.5 / 100, 1) for e in r.extra_ingredients)


def test_scale_dough_olio_pct_not_included_when_absent_in_extras():
    r = scale_dough(
        base_flour_g=400,
        default_pieces=2,
        default_ball_g=200,
        hydration_pct=60.0,
        salt_pct=2.0,
        yeast_pct=0.5,
        biga_pct=0,
        poolish_pct=0,
        autolisi_pct=0,
        extra_ingredients=[]
    )
    assert not any(e["name"] == "olio" for e in r.extra_ingredients)


def test_calc_party_shopping_list_and_macros():
    recipe = {
        "base_flour_g": 1000,
        "default_pieces": 4,
        "default_ball_g": 250,
        "extra_ingredients": []
    }
    variant_quantities = [
        {
            "variant_id": 1,
            "name": "Test",
            "count": 3,
            "toppings": [
                {"name": "Mozzarella", "quantity_g": 30, "kcal_per100": 242, "protein_per100": 17.0, "carbs_per100": 2.7, "fat_per100": 18.0}
            ]
        }
    ]
    out = calc_party(
        recipe=recipe,
        target_pieces=3,
        ball_weight_g=250,
        hydration_pct=60.0,
        salt_pct=2.5,
        yeast_pct=1.0,
        biga_pct=0,
        poolish_pct=0,
        autolisi_pct=0,
        variant_quantities=variant_quantities,
        portion_denominator=1
    )
    shopping = {item["name"]: item["total_g"] for item in out["shopping_list"]}
    assert shopping.get("Mozzarella") == pytest.approx(30 * 3, rel=1e-3)
    per_pizza_kcal = next(v for v in out["variants"] if v["variant_id"] == 1)["per_pizza_macros"]["kcal"]
    assert per_pizza_kcal == pytest.approx(round(242 * (30 / 100), 1))
