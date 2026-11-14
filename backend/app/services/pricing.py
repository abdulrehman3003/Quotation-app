# app/services/pricing.py
"""
Deterministic quote arithmetic.

The LLM proposes line items; it is never trusted to add them up. Every figure
that is stored or shown to a customer is recomputed here from quantity and
unit price, using Decimal so that 0.1 + 0.2 style float drift can't reach a
quote.
"""
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
import re

CENT = Decimal("0.01")
CATEGORIES = ("material", "labor", "other")

_LABOR_HINT = re.compile(
    r"\b(labou?r|hours?|hrs?|weld\w*|machin\w*|cutting|bending|setup|set-up|assembl\w*|"
    r"fabricat\w*|finishing|grinding|drilling|install\w*|programming)\b",
    re.IGNORECASE,
)
_OTHER_HINT = re.compile(r"\b(shipping|freight|delivery|packag\w*|handling|rush fee|expedite)\b", re.IGNORECASE)


def to_decimal(value, default: str = "0") -> Decimal:
    """Parses anything number-like; garbage, NaN and infinities become the default."""
    if value is None or isinstance(value, bool):
        return Decimal(default)
    try:
        if isinstance(value, str):
            value = value.replace(",", "").replace("$", "").strip()
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return Decimal(default)
    if not number.is_finite():
        return Decimal(default)
    return number


def money(value) -> Decimal:
    return to_decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def clamp_percent(value) -> Decimal:
    percent = to_decimal(value)
    if percent < 0:
        return Decimal("0")
    if percent > 100:
        return Decimal("100")
    return percent.quantize(CENT, rounding=ROUND_HALF_UP)


def infer_category(description: str) -> str:
    """Best guess for items that carry no category (quotes created before categories existed)."""
    text = description or ""
    if _OTHER_HINT.search(text):
        return "other"
    if _LABOR_HINT.search(text):
        return "labor"
    return "material"


def normalize_items(items) -> list[dict]:
    """
    Returns clean line items with total_price recomputed as quantity x unit_price.

    An item is flagged needs_review when it was flagged upstream or ends up
    priced at zero (the engine prices anything missing from the knowledge base
    at zero rather than inventing a number).
    """
    normalized = []
    for raw in items or []:
        if hasattr(raw, "model_dump"):
            raw = raw.model_dump()
        if not isinstance(raw, dict):
            continue
        description = str(raw.get("description") or "").strip()
        quantity = to_decimal(raw.get("quantity"), "1")
        unit_price = to_decimal(raw.get("unit_price"))
        stated_total = to_decimal(raw.get("total_price"))
        if quantity < 0:
            quantity = Decimal("0")
        if unit_price < 0:
            unit_price = Decimal("0")

        # A lump-sum line ("Setup fee: 150") may arrive with only a total.
        if unit_price == 0 and stated_total > 0 and quantity > 0:
            unit_price = stated_total / quantity

        total = money(quantity * unit_price)
        if not description and total == 0:
            continue

        category = str(raw.get("category") or "").strip().lower()
        if category == "labour":
            category = "labor"
        if category not in CATEGORIES:
            category = infer_category(description)

        normalized.append({
            "description": description or "Item",
            "quantity": float(quantity),
            "unit_price": float(unit_price.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)),
            "total_price": float(total),
            "category": category,
            "needs_review": bool(raw.get("needs_review")) or total == 0,
        })
    return normalized


def compute_totals(items: list[dict], discount_percent=0, tax_percent=0) -> dict:
    """
    Totals for a list of normalized items. Discount applies to the subtotal;
    tax applies to the discounted amount.
    """
    material = sum((money(i["total_price"]) for i in items if i.get("category") == "material"), Decimal("0"))
    labor = sum((money(i["total_price"]) for i in items if i.get("category") == "labor"), Decimal("0"))
    subtotal = sum((money(i["total_price"]) for i in items), Decimal("0"))

    discount_pct = clamp_percent(discount_percent)
    tax_pct = clamp_percent(tax_percent)
    discount_amount = money(subtotal * discount_pct / 100)
    taxable = subtotal - discount_amount
    tax_amount = money(taxable * tax_pct / 100)
    total = taxable + tax_amount

    return {
        "material_cost": float(material),
        "labor_cost": float(labor),
        "subtotal": float(subtotal),
        "discount_percent": float(discount_pct),
        "discount_amount": float(discount_amount),
        "tax_percent": float(tax_pct),
        "tax_amount": float(tax_amount),
        "total_cost": float(total),
    }


def items_needing_review(items: list[dict]) -> list[dict]:
    return [i for i in items if i.get("needs_review")]
