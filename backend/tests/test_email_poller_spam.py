"""The email poller also imports unread mail from the Spam / Junk folder."""
from types import SimpleNamespace

import pytest

from app.services import email_poller
from tests.fake_supabase import FakeSupabase


def folder(name, *flags):
    return SimpleNamespace(name=name, flags=flags)


class FakeMailbox:
    def __init__(self, folders=(), messages=()):
        self._folders = list(folders)
        self._messages = list(messages)
        self.flagged = []
        self.fetch_kwargs = None
        self.folder = SimpleNamespace(list=lambda: self._folders, set=lambda name: None)

    def fetch(self, criteria, mark_seen=False, **kwargs):
        self.fetch_kwargs = kwargs
        return iter(self._messages)

    def flag(self, uid, flag, value):
        self.flagged.append(uid)


def message(uid, sender="buyer@example.com", subject="Need a quote"):
    return SimpleNamespace(uid=uid, from_=sender, subject=subject, text="Please quote 10 windows.", html="",
                           attachments=[], headers={"message-id": (f"<{uid}@mail>",)})


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()
    fake.tables["customer_emails"] = []
    monkeypatch.setattr(email_poller, "supabase", fake)
    return fake


def test_finds_folder_flagged_junk_first():
    mb = FakeMailbox([folder("INBOX"), folder("Spam"), folder("[Gmail]/Spam", "\\HasNoChildren", "\\Junk")])
    assert email_poller.find_spam_folder(mb) == "[Gmail]/Spam"


def test_falls_back_to_known_names_case_insensitively():
    assert email_poller.find_spam_folder(FakeMailbox([folder("INBOX"), folder("junk email")])) == "junk email"
    assert email_poller.find_spam_folder(FakeMailbox([folder("INBOX"), folder("Archive")])) is None


def test_spam_mail_is_stored_marked_and_never_auto_drafted(db, monkeypatch):
    drafted = []
    monkeypatch.setattr(email_poller, "auto_draft_email", lambda *a: drafted.append(a))
    mb = FakeMailbox(messages=[message(1)])

    email_poller._process_folder(mb, None, True, "u1", "c1", "sales@shop.com", auto_draft=True)

    rows = db.tables["customer_emails"]
    assert len(rows) == 1 and rows[0]["from_spam"] is True and rows[0]["status"] == "unread"
    assert drafted == []
    assert mb.flagged == [1]
    assert mb.fetch_kwargs == {"limit": email_poller.MAX_SPAM_PER_PASS, "reverse": True}


def test_inbox_mail_is_not_marked_spam_and_is_auto_drafted(db, monkeypatch):
    drafted = []
    monkeypatch.setattr(email_poller, "auto_draft_email", lambda *a: drafted.append(a))

    email_poller._process_folder(FakeMailbox(messages=[message(2)]), None, False, "u1", "c1", "sales@shop.com", auto_draft=True)

    assert "from_spam" not in db.tables["customer_emails"][0]
    assert len(drafted) == 1


def test_spam_mail_still_stored_before_migration_v16(db, monkeypatch):
    real_insert = db.table("customer_emails").insert.__func__

    class NoSpamColumn(type(db.table("customer_emails"))):
        def insert(self, payload):
            if "from_spam" in payload:
                raise Exception('column "from_spam" does not exist')
            return real_insert(self, payload)

    monkeypatch.setattr(db, "table", lambda name: NoSpamColumn(db, name))

    email_poller._process_folder(FakeMailbox(messages=[message(3)]), None, True, "u1", "c1", "sales@shop.com", auto_draft=False)

    rows = db.tables["customer_emails"]
    assert len(rows) == 1 and "from_spam" not in rows[0] and rows[0]["message_uid"] == "<3@mail>"
