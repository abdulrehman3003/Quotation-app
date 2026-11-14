"""A tiny in-memory stand-in for the supabase-py query builder, enough for handler tests."""
import copy
import uuid
from datetime import datetime, timezone


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.op, self.payload, self.filters, self._limit, self._order = "select", None, [], None, None

    def select(self, *_):
        self.op = "select"; return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload; return self

    def update(self, payload):
        self.op, self.payload = "update", payload; return self

    def delete(self):
        self.op = "delete"; return self

    def eq(self, col, val):
        self.filters.append(lambda r, c=col, v=val: r.get(c) == v); return self

    def in_(self, col, vals):
        self.filters.append(lambda r, c=col, v=list(vals): r.get(c) in v); return self

    def is_(self, col, val):
        assert val == "null"
        self.filters.append(lambda r, c=col: r.get(c) is None); return self

    def gte(self, col, val):
        self.filters.append(lambda r, c=col, v=val: (r.get(c) or "") >= v); return self

    def upsert(self, payload, on_conflict="id"):
        self.op, self.payload, self._conflict = "upsert", payload, on_conflict; return self

    def order(self, col, desc=False):
        self._order = (col, desc); return self

    def limit(self, n):
        self._limit = n; return self

    def execute(self):
        rows = self.db.tables.setdefault(self.table, [])
        if self.op == "upsert":
            for r in rows:
                if r.get(self._conflict) == self.payload.get(self._conflict):
                    r.update(copy.deepcopy(self.payload))
                    return _Result([copy.deepcopy(r)])
            self.op = "insert"
        if self.op == "insert":
            unknown = set(self.payload) - self.db.columns.get(self.table, set(self.payload))
            if unknown:
                raise Exception(f"PGRST204 Could not find the '{sorted(unknown)[0]}' column")
            row = {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat(), **copy.deepcopy(self.payload)}
            for col, default in self.db.defaults.get(self.table, {}).items():
                row.setdefault(col, default)
            rows.append(row)
            return _Result([copy.deepcopy(row)])
        matched = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == "update":
            unknown = set(self.payload) - self.db.columns.get(self.table, set(self.payload))
            if unknown:
                raise Exception(f"PGRST204 Could not find the '{sorted(unknown)[0]}' column")
            for r in matched:
                r.update(copy.deepcopy(self.payload))
            return _Result(copy.deepcopy(matched))
        if self.op == "delete":
            self.db.tables[self.table] = [r for r in rows if r not in matched]
            return _Result(copy.deepcopy(matched))
        if self._order:
            matched = sorted(matched, key=lambda r: r.get(self._order[0]) or "", reverse=self._order[1])
        if self._limit:
            matched = matched[: self._limit]
        return _Result(copy.deepcopy(matched))


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.columns: dict[str, set] = {}   # table -> allowed columns (unset = anything)
        self.defaults: dict[str, dict] = {}

    def table(self, name):
        return _Query(self, name)
