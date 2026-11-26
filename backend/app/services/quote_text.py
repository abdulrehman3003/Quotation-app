# app/services/quote_text.py
"""
The priced part of a reply email is generated from the quote's line items, never
written by the AI. The AI places PRICING_PLACEHOLDER where the table belongs; the
server renders the table between two marker lines, and re-renders it every time
the line items, discount or tax change, so the reply always matches the quote.
"""
import re
from decimal import Decimal

from app.services.pricing import compute_totals, money

PRICING_PLACEHOLDER = "{{PRICING_TABLE}}"
BLOCK_START = "=== Quotation"
BLOCK_END = "=== End of quotation ==="
_BLOCK_RE = re.compile(r"^=== Quotation[^\n]*===\n.*?^=== End of quotation ===[ \t]*$", re.MULTILINE | re.DOTALL)
_PLACEHOLDER_RE = re.compile(r"\{\{\s*PRICING[_ ]TABLE\s*\}\}", re.IGNORECASE)
_SIGN_OFF_RE = re.compile(r"^\s*(best regards|kind regards|warm regards|regards|sincerely|yours sincerely|thanks and regards|many thanks)\b",
                          re.IGNORECASE | re.MULTILINE)


def _amount(value, currency: str) -> str:
    return f"{currency} {money(value):,.2f}"


def render_pricing_block(items: list[dict], currency: str = "USD", discount_percent=0, tax_percent=0,
                         quote_number: str | None = None, valid_until: str | None = None) -> str:
    currency = (currency or "USD").upper()
    totals = compute_totals(items, discount_percent, tax_percent)
    title = f"{BLOCK_START} {quote_number} ===" if quote_number else f"{BLOCK_START} ==="
    lines = [title]
    unconfirmed = False
    for n, item in enumerate(items, 1):
        lines.append(f"{n}. {item['description']}")
        qty = Decimal(str(item.get("quantity") or 0))
        if money(item.get("unit_price") or 0) == 0:
            unconfirmed = True
            lines.append(f"   Qty {qty.normalize():f}: price to be confirmed")
        else:
            lines.append(f"   {qty.normalize():f} x {_amount(item['unit_price'], currency)} = {_amount(item['total_price'], currency)}")
    if not items:
        lines.append("Pricing to be confirmed.")
    else:
        lines.append("")
        has_adjustments = totals["discount_amount"] or totals["tax_amount"]
        if has_adjustments:
            lines.append(f"Subtotal: {_amount(totals['subtotal'], currency)}")
        if totals["discount_amount"]:
            lines.append(f"Discount ({totals['discount_percent']:g}%): -{_amount(totals['discount_amount'], currency)}")
        if totals["tax_amount"]:
            lines.append(f"Tax ({totals['tax_percent']:g}%): {_amount(totals['tax_amount'], currency)}")
        lines.append(f"Total: {_amount(totals['total_cost'], currency)}")
        if unconfirmed:
            lines.append("Items marked \"price to be confirmed\" are not included in the total.")
    if valid_until:
        lines.append(f"Valid until {str(valid_until)[:10]}.")
    lines.append(BLOCK_END)
    return "\n".join(lines)


def has_pricing_block(text: str | None) -> bool:
    return bool(text) and bool(_BLOCK_RE.search(text))


def apply_pricing_block(text: str | None, block: str) -> str:
    """
    Puts the table into the reply: replaces an existing table, else the AI's
    placeholder, else inserts it before the sign-off (or at the end).
    """
    text = text or ""
    if _BLOCK_RE.search(text):
        return _BLOCK_RE.sub(lambda _m: block, text, count=1)
    if _PLACEHOLDER_RE.search(text):
        return _PLACEHOLDER_RE.sub(lambda _m: block, text, count=1)
    sign_off = _SIGN_OFF_RE.search(text)
    if sign_off:
        return text[:sign_off.start()].rstrip() + "\n\n" + block + "\n\n" + text[sign_off.start():].lstrip()
    return (text.rstrip() + "\n\n" + block).lstrip()


def refresh_reply(text: str | None, items: list[dict], currency: str, discount_percent, tax_percent,
                  quote_number: str | None, valid_until: str | None) -> str | None:
    """Re-renders the table in an existing reply; replies without one are left alone."""
    if not has_pricing_block(text) and not (text and _PLACEHOLDER_RE.search(text)):
        return text
    block = render_pricing_block(items, currency, discount_percent, tax_percent, quote_number, valid_until)
    return apply_pricing_block(text, block)


_INTERNAL_WORDS = re.compile(r"\b(mark-?up|overheads?|profit|margin|cost price|manufacturing cost|internal cost)\b", re.IGNORECASE)
_MONEY_RE = re.compile(r"(\b[A-Z]{3}\s?\d[\d,]*(\.\d+)?\b|[$€£]\s?\d|\b\d{1,3}(,\d{3})+(\.\d+)?\b)")


def reply_warnings(text: str | None, items: list[dict]) -> list[str]:
    """Things a person should check before sending, in a reply the AI drafted."""
    notes = []
    prose = _BLOCK_RE.sub("", text or "")
    if _MONEY_RE.search(prose):
        notes.append("The reply text mentions prices outside the quotation table. Those figures don't update when you edit "
                     "the line items, so check or remove them before sending.")
    internal = [i["description"] for i in items if _INTERNAL_WORDS.search(i.get("description") or "")]
    if internal:
        notes.append("These lines look like internal costs (markup, overheads, profit) rather than prices for the customer: "
                     + "; ".join(internal[:3]) + ".")
    return notes
