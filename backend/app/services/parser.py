# app/services/parser.py
import os
import pandas as pd
from pypdf import PdfReader
import io
import logging

logger = logging.getLogger(__name__)

def sanitize_filename(filename: str) -> str:
    """
    Sanitizes filename using path.basename to prevent directory traversal.
    """
    # Enforce path & file system security
    basename = os.path.basename(filename)
    # Strip any directory traversal characters or prefixes
    clean_name = basename.replace("../", "").replace("..\\", "")
    return clean_name

def parse_file_content(file_bytes: bytes, filename: str) -> str:
    """
    Parses CSV, Excel, or PDF content and returns a normalized text representation.
    """
    clean_name = sanitize_filename(filename)
    ext = os.path.splitext(clean_name)[1].lower()
    
    if ext == '.csv':
        try:
            df = pd.read_csv(io.BytesIO(file_bytes))
            # Format DataFrame to markdown table or string
            return df.to_string(index=False)
        except Exception as e:
            logger.error(f"Error parsing CSV file {clean_name}: {str(e)}")
            raise ValueError(f"Failed to parse CSV file: {str(e)}")
            
    elif ext in ['.xlsx', '.xls']:
        try:
            # openpyxl engine is standard for reading .xlsx files
            xls = pd.ExcelFile(io.BytesIO(file_bytes), engine='openpyxl')
            sheets_text = []
            for sheet_name in xls.sheet_names:
                df = pd.read_excel(xls, sheet_name=sheet_name)
                sheets_text.append(f"--- Sheet: {sheet_name} ---\n{df.to_string(index=False)}")
            return "\n\n".join(sheets_text)
        except Exception as e:
            logger.error(f"Error parsing Excel file {clean_name}: {str(e)}")
            raise ValueError(f"Failed to parse Excel file: {str(e)}")
            
    elif ext == '.pdf':
        try:
            pdf_reader = PdfReader(io.BytesIO(file_bytes))
            pages_text = []
            for i, page in enumerate(pdf_reader.pages):
                text = page.extract_text()
                if text:
                    pages_text.append(f"--- Page {i + 1} ---\n{text}")
            if not pages_text:
                raise ValueError("no text could be read from this PDF. It looks like a scan; upload a text PDF, Excel or CSV instead")
            return normalize_extracted_text("\n\n".join(pages_text))
        except Exception as e:
            logger.error(f"Error parsing PDF file {clean_name}: {str(e)}")
            raise ValueError(f"Failed to parse PDF file: {str(e)}")
            
    else:
        raise ValueError(f"Unsupported file extension: {ext}")


READABLE_ATTACHMENT_EXTENSIONS = {'.csv', '.xlsx', '.xls', '.pdf'}
MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
MAX_ATTACHMENT_CHARS = 15000


def attachments_to_text(attachments: list[tuple[str, bytes]]) -> str:
    """
    Turns email attachments into text appended to the request, so drawings'
    title blocks, BOM spreadsheets and PDF RFQs reach the quote engine.
    Unreadable or unsupported files are named rather than silently dropped.
    """
    sections = []
    skipped = []
    read = 0
    for filename, payload in attachments or []:
        name = sanitize_filename(filename or "attachment")
        ext = os.path.splitext(name)[1].lower()
        if ext in ('.dxf', '.stl'):
            from app.services.geometry import analyze_part_file, describe_geometry
            try:
                sections.append(describe_geometry(name, analyze_part_file(name, payload or b"")))
            except Exception:
                skipped.append(f"{name} (could not be measured)")
            continue
        if ext not in READABLE_ATTACHMENT_EXTENSIONS:
            skipped.append(name)
            continue
        if read >= MAX_ATTACHMENTS or len(payload or b"") > MAX_ATTACHMENT_BYTES:
            skipped.append(f"{name} (too large or too many attachments)")
            continue
        try:
            text = parse_file_content(payload, name).strip()
        except ValueError:
            skipped.append(f"{name} (could not be read)")
            continue
        if not text:
            skipped.append(f"{name} (no readable text; it may be a scanned image)")
            continue
        read += 1
        if len(text) > MAX_ATTACHMENT_CHARS:
            text = text[:MAX_ATTACHMENT_CHARS] + "\n[attachment truncated]"
        sections.append(f"--- Attachment: {name} ---\n{text}")
    if skipped:
        sections.append("Attachments not read (open the original email to see them): " + ", ".join(skipped))
    return "\n\n".join(sections)


# ---------------------------------------------------------------- email bodies
import html as _html
import re as _re
from html.parser import HTMLParser as _HTMLParser

_HTML_HINT = _re.compile(r"<\s*(!doctype|html|body|table|div|p|br|span|td|style|head)\b", _re.IGNORECASE)
_INVISIBLE = _re.compile("[\u200b\u200c\u200d\u2060\ufeff\u00ad\u034f]")


class _TextExtractor(_HTMLParser):
    _SKIP = {"style", "script", "head", "title", "noscript", "svg", "template"}
    _BLOCK = {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "section", "article",
              "header", "footer", "blockquote", "ul", "ol", "hr", "pre"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip_depth = 0
        self._hidden_stack: list[bool] = []

    @staticmethod
    def _is_hidden(attrs) -> bool:
        style = (dict(attrs).get("style") or "").replace(" ", "").lower()
        return "display:none" in style or "max-height:0" in style or "opacity:0" in style

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP:
            self._skip_depth += 1
            return
        if tag not in ("br", "img", "hr", "meta", "link", "input"):
            self._hidden_stack.append(self._is_hidden(attrs))
        if tag == "li":
            self.parts.append("\n- ")
        elif tag == "td" or tag == "th":
            self.parts.append(" ")
        elif tag in self._BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self._SKIP:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._hidden_stack and tag not in ("br", "img", "hr", "meta", "link", "input"):
            self._hidden_stack.pop()
        if tag in self._BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._skip_depth or any(self._hidden_stack):
            return
        self.parts.append(data)


def looks_like_html(text: str) -> bool:
    return bool(text) and bool(_HTML_HINT.search(text[:5000]))


def html_to_text(markup: str) -> str:
    """
    Readable text from an HTML email: drops styles, scripts, tracking pixels and
    hidden preview text, keeps the visible wording with paragraph breaks.
    """
    if not markup:
        return ""
    markup = _re.sub(r"<!--.*?-->", "", markup, flags=_re.DOTALL)
    extractor = _TextExtractor()
    try:
        extractor.feed(markup)
        extractor.close()
        text = "".join(extractor.parts)
    except Exception:
        text = _re.sub(r"<[^>]+>", " ", markup)
    text = _INVISIBLE.sub("", _html.unescape(text)).replace("\xa0", " ")
    lines = [_re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    out: list[str] = []
    for line in lines:
        if line or (out and out[-1]):
            out.append(line)
    return "\n".join(out).strip()


# A list number or bullet alone on its line: "1.", "2)", "a.", "-", "*", "•", "o"
_LIST_MARKER_LINE = _re.compile(r"^\s*(\d{1,3}[.)]|[a-zA-Z][.)]|[-*\u2022\u00b7\u25aao])\s*$")


def join_list_markers(text: str) -> str:
    """
    Outlook and some webmail clients put a list number on one line and the item
    text on the next (often with a blank line between). Re-join them so
    "1.\n\nDesk - 2 units" reads "1. Desk - 2 units".
    """
    lines = text.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if _LIST_MARKER_LINE.match(line):
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and not _LIST_MARKER_LINE.match(lines[j]):
                out.append(f"{line.strip()} {lines[j].strip()}")
                i = j + 1
                continue
        out.append(line)
        i += 1
    return "\n".join(out)


def clean_email_body(plain: str | None, html_body: str | None = None) -> str:
    """Prefers the sender's plain-text part; falls back to converting the HTML part."""
    plain = (plain or "").strip()
    if plain and not looks_like_html(plain):
        return join_list_markers(_INVISIBLE.sub("", plain))
    return join_list_markers(html_to_text(html_body or plain))


# ---------------------------------------------------------------- PDF text repair
import unicodedata as _unicodedata

# Word and Calibri PDFs often map ligature glyphs to unrelated code points, so
# "Estimated" is extracted as "EsƟmated" and "ft" as "Ō". Left alone, product
# names no longer match what customers type.
_GLYPH_REPAIRS = {
    "\u019f": "ti",   # Ɵ
    "\u01a9": "tt",   # Ʃ
    "\u014c": "ft",   # Ō
    "\u01a1": "tf",
    "\uf0b7": "-",    # Symbol-font bullet
    "\uf0a7": "-",
    "\u2022": "-",
    "\u2212": "-",    # minus sign
}


def normalize_extracted_text(text: str) -> str:
    if not text:
        return ""
    for bad, good in _GLYPH_REPAIRS.items():
        text = text.replace(bad, good)
    # NFKC expands the real ligatures (ﬁ, ﬀ, ﬃ) and odd-width characters
    text = _unicodedata.normalize("NFKC", text)
    return "\n".join(line.rstrip() for line in text.splitlines())
