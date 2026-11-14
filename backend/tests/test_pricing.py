from app.services.pricing import normalize_items, compute_totals, items_needing_review, infer_category


def test_line_total_is_recomputed_not_trusted():
    items = normalize_items([{"description": "Steel plate", "quantity": 3, "unit_price": 19.99, "total_price": 9999}])
    assert items[0]["total_price"] == 59.97


def test_lump_sum_line_derives_unit_price():
    items = normalize_items([{"description": "Setup fee", "quantity": 1, "unit_price": 0, "total_price": 150}])
    assert items[0]["unit_price"] == 150
    assert items[0]["total_price"] == 150
    assert items[0]["needs_review"] is False


def test_zero_priced_line_is_flagged():
    items = normalize_items([{"description": "Titanium rod", "quantity": 4, "unit_price": 0, "total_price": 0}])
    assert items_needing_review(items) == items


def test_no_float_drift():
    items = normalize_items([{"description": "Bolt", "quantity": 3, "unit_price": 0.1, "category": "material"}])
    assert items[0]["total_price"] == 0.3
    assert compute_totals(items)["total_cost"] == 0.3


def test_garbage_and_negative_inputs_are_safe():
    items = normalize_items([
        {"description": "A", "quantity": "abc", "unit_price": "$1,200.50"},
        {"description": "B", "quantity": -5, "unit_price": 10},
        {"description": "C", "quantity": float("nan"), "unit_price": float("inf")},
        "not a dict",
        {"description": "", "quantity": 0, "unit_price": 0},
    ])
    assert [i["description"] for i in items] == ["A", "B", "C"]
    assert items[0]["total_price"] == 1200.50  # unparseable quantity falls back to 1
    assert items[1]["total_price"] == 0 and items[1]["needs_review"]
    assert items[2]["total_price"] == 0


def test_totals_split_discount_then_tax():
    items = normalize_items([
        {"description": "Plate", "quantity": 10, "unit_price": 20, "category": "material"},
        {"description": "Welding", "quantity": 2, "unit_price": 50, "category": "labor"},
        {"description": "Freight", "quantity": 1, "unit_price": 30, "category": "other"},
    ])
    totals = compute_totals(items, discount_percent=10, tax_percent=5)
    assert totals["material_cost"] == 200
    assert totals["labor_cost"] == 100
    assert totals["subtotal"] == 330
    assert totals["discount_amount"] == 33
    assert totals["tax_amount"] == 14.85
    assert totals["total_cost"] == 311.85


def test_percentages_are_clamped():
    items = normalize_items([{"description": "Plate", "quantity": 1, "unit_price": 100}])
    assert compute_totals(items, discount_percent=250)["total_cost"] == 0
    assert compute_totals(items, discount_percent=-5, tax_percent=-5)["total_cost"] == 100


def test_category_inference_for_legacy_items():
    assert infer_category("3 hours welding") == "labor"
    assert infer_category("Labour - assembly") == "labor"
    assert infer_category("5x aluminium sheets") == "material"
    assert infer_category("Shipping to Lahore") == "other"
    assert normalize_items([{"description": "x", "quantity": 1, "unit_price": 1, "category": "Labour"}])[0]["category"] == "labor"
