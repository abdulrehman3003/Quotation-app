# app/services/kb_retrieval.py
"""
Keeps the knowledge base that goes into a prompt within a fixed size.

Small knowledge bases are passed through untouched. Once the total exceeds the
budget, each file is cut into chunks and the chunks that share the most words
with the customer's request are kept, in their original order, with each file's
header rows so table columns stay labelled.
"""
import re

CHUNK_LINES = 25
HEADER_LINES = 2
_TOKEN = re.compile(r"[a-z0-9][a-z0-9./\-]{2,}")
_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "you", "your", "our", "are", "have", "has", "can", "could",
    "would", "please", "need", "want", "like", "quote", "quotation", "price", "pricing", "cost", "thanks", "thank",
    "regards", "hello", "dear", "will", "also", "let", "know", "per", "pcs", "piece", "pieces", "each", "sender",
}


def tokenize(text: str) -> set[str]:
    return {t for t in _TOKEN.findall((text or "").lower()) if t not in _STOPWORDS}


def _chunks(content: str) -> tuple[str, list[str]]:
    lines = content.splitlines()
    non_empty = [l for l in lines if l.strip()]
    header = "\n".join(non_empty[:HEADER_LINES])
    body = lines
    return header, ["\n".join(body[i:i + CHUNK_LINES]) for i in range(0, len(body), CHUNK_LINES)]


def select_kb_context(kb_contents: list[str], query: str, budget_chars: int) -> tuple[list[str], bool]:
    """
    Returns (contents to put in the prompt, whether anything was left out).
    One output entry per input file that contributed at least one chunk.
    """
    contents = [c for c in (kb_contents or []) if c and c.strip()]
    if sum(len(c) for c in contents) <= budget_chars:
        return contents, False

    query_tokens = tokenize(query)
    candidates = []  # (score, file_index, chunk_index, text)
    headers: dict[int, str] = {}
    for file_index, content in enumerate(contents):
        header, chunks = _chunks(content)
        headers[file_index] = header
        for chunk_index, chunk in enumerate(chunks):
            score = len(query_tokens & tokenize(chunk))
            candidates.append((score, file_index, chunk_index, chunk))

    # Best matches first; ties keep document order so pricing rules near the top of a file win.
    ranked = sorted(candidates, key=lambda c: (-c[0], c[1], c[2]))
    chosen: set[tuple[int, int]] = set()
    used = 0
    for score, file_index, chunk_index, chunk in ranked:
        cost = len(chunk) + (len(headers[file_index]) if not any(f == file_index for f, _ in chosen) else 0)
        if used + cost > budget_chars:
            continue
        chosen.add((file_index, chunk_index))
        used += cost

    selected: list[str] = []
    for file_index, content in enumerate(contents):
        kept = sorted(ci for fi, ci in chosen if fi == file_index)
        if not kept:
            continue
        _, chunks = _chunks(content)
        parts = []
        if 0 not in kept and headers[file_index]:
            parts.append(headers[file_index])
        previous = None
        for ci in kept:
            if previous is not None and ci != previous + 1:
                parts.append("[...]")
            parts.append(chunks[ci])
            previous = ci
        selected.append("\n".join(parts))
    return selected, True
