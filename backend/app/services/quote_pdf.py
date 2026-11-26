# app/services/quote_pdf.py
"""
The customer-facing quotation PDF, attached to approved quotes sent by email and
WhatsApp. Shows only what the customer may see: items, selling prices, totals,
validity and terms. Never internal costs, review notes or categories.
"""
import os
from datetime import date

from fpdf import FPDF

FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "fonts")
BRAND = (37, 99, 235)
MUTED = (100, 116, 139)
DARK = (15, 23, 42)


def _money(value, currency: str) -> str:
    return f"{currency} {float(value or 0):,.2f}"


class _QuotePDF(FPDF):
    def __init__(self, company: str):
        super().__init__(format="A4")
        self.company = company
        self.add_font("DejaVu", "", os.path.join(FONT_DIR, "DejaVuSans.ttf"))
        self.add_font("DejaVu", "B", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf"))
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(16, 16, 16)

    def footer(self):
        self.set_y(-12)
        self.set_font("DejaVu", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(0, 5, f"{self.company} · Page {self.page_no()}/{{nb}}", align="C")


def build_quote_pdf(quote: dict, company: str, seller: dict | None = None, link: str | None = None,
                    payment_terms: str = "") -> bytes:
    seller = seller or {}
    currency = (quote.get("currency") or "USD").upper()
    items = quote.get("itemized_breakdown") or []
    pdf = _QuotePDF(company or "Quotation")
    pdf.alias_nb_pages()
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin

    # Header
    pdf.set_font("DejaVu", "B", 18)
    pdf.set_text_color(*DARK)
    pdf.cell(width * 0.6, 9, company or "", new_x="RIGHT", new_y="TOP")
    pdf.set_font("DejaVu", "B", 18)
    pdf.set_text_color(*BRAND)
    pdf.cell(width * 0.4, 9, "QUOTATION", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(*MUTED)
    contact = " · ".join(x for x in (seller.get("name"), seller.get("phone_number"), seller.get("email")) if x)
    pdf.cell(width * 0.6, 5, contact, new_x="RIGHT", new_y="TOP")
    pdf.cell(width * 0.4, 5, f"No. {quote.get('quote_number') or '-'}", align="R", new_x="LMARGIN", new_y="NEXT")
    issued = str(quote.get("sent_at") or quote.get("created_at") or date.today().isoformat())[:10]
    pdf.cell(width * 0.6, 5, "", new_x="RIGHT", new_y="TOP")
    pdf.cell(width * 0.4, 5, f"Date: {issued}", align="R", new_x="LMARGIN", new_y="NEXT")
    if quote.get("valid_until"):
        pdf.cell(width * 0.6, 5, "", new_x="RIGHT", new_y="TOP")
        pdf.cell(width * 0.4, 5, f"Valid until: {str(quote['valid_until'])[:10]}", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_draw_color(226, 232, 240)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)

    # Customer
    pdf.set_font("DejaVu", "B", 9)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 5, "PREPARED FOR", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 10)
    pdf.set_text_color(*DARK)
    for line in (quote.get("customer_name"), quote.get("customer_company"), quote.get("customer_phone"), quote.get("customer_email")):
        if line and str(line) not in ("Customer", "WhatsApp Lead"):
            pdf.cell(0, 5, str(line), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    # Items table
    cols = [width * 0.08, width * 0.46, width * 0.1, width * 0.18, width * 0.18]
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("DejaVu", "B", 9)
    pdf.set_text_color(*DARK)
    for w, title, align in zip(cols, ("#", "Description", "Qty", "Unit price", "Amount"), ("L", "L", "R", "R", "R")):
        pdf.cell(w, 8, title, align=align, fill=True)
    pdf.ln(8)
    pdf.set_font("DejaVu", "", 9)
    unconfirmed = False
    for n, item in enumerate(items, 1):
        unit = float(item.get("unit_price") or 0)
        if not unit:
            unconfirmed = True
        description = str(item.get("description") or "")
        lines = pdf.multi_cell(cols[1], 6, description, dry_run=True, output="LINES")
        row_h = max(6, 6 * len(lines))
        if pdf.get_y() + row_h > pdf.page_break_trigger:
            pdf.add_page()
        y0 = pdf.get_y()
        pdf.set_xy(pdf.l_margin + cols[0], y0)
        pdf.multi_cell(cols[1], 6, description, align="L", new_x="RIGHT", new_y="TOP")
        pdf.set_xy(pdf.l_margin, y0)
        pdf.cell(cols[0], row_h, str(n))
        pdf.set_xy(pdf.l_margin + cols[0] + cols[1], y0)
        pdf.cell(cols[2], row_h, f"{float(item.get('quantity') or 0):g}", align="R")
        pdf.cell(cols[3], row_h, _money(unit, currency) if unit else "To be confirmed", align="R")
        pdf.cell(cols[4], row_h, _money(item.get("total_price"), currency) if unit else "-", align="R")
        pdf.set_xy(pdf.l_margin, y0 + row_h)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())

    # Totals
    pdf.ln(3)
    subtotal = float(quote.get("subtotal") or quote.get("total_cost") or 0)
    discount = float(quote.get("discount_percent") or 0)
    tax = float(quote.get("tax_percent") or 0)
    total = float(quote.get("total_cost") or 0)
    rows = []
    if discount or tax:
        rows.append(("Subtotal", _money(subtotal, currency)))
    if discount:
        rows.append((f"Discount ({discount:g}%)", "-" + _money(subtotal * discount / 100, currency)))
    if tax:
        rows.append((f"Tax ({tax:g}%)", _money(total - subtotal * (1 - discount / 100), currency)))
    for label, value in rows:
        pdf.set_x(pdf.l_margin + width * 0.5)
        pdf.cell(width * 0.3, 6, label, align="R")
        pdf.cell(width * 0.2, 6, value, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "B", 11)
    pdf.set_x(pdf.l_margin + width * 0.5)
    pdf.cell(width * 0.3, 8, "Total", align="R")
    pdf.set_text_color(*BRAND)
    pdf.cell(width * 0.2, 8, _money(total, currency), align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*DARK)
    pdf.set_font("DejaVu", "", 8.5)
    if unconfirmed:
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 5, 'Items marked "To be confirmed" are not included in the total.', new_x="LMARGIN", new_y="NEXT")

    # Terms and link
    pdf.ln(6)
    pdf.set_text_color(*DARK)
    if payment_terms:
        pdf.set_font("DejaVu", "B", 9)
        pdf.cell(0, 5, "Terms", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("DejaVu", "", 9)
        pdf.multi_cell(0, 5, payment_terms, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)
    if link:
        pdf.set_font("DejaVu", "", 9)
        pdf.set_text_color(*BRAND)
        pdf.multi_cell(0, 5, f"View or accept this quotation online: {link}", link=link, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def pdf_filename(quote: dict) -> str:
    number = "".join(ch for ch in str(quote.get("quote_number") or "quotation") if ch.isalnum() or ch in "-_")
    return f"Quotation-{number}.pdf"
