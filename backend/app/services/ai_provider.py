# app/services/ai_provider.py
"""
The AI provider: AIML API (https://aimlapi.com), an OpenAI-compatible gateway to
hundreds of models. The active model is chosen by an admin in the admin panel
(stored in app_settings as "ai_model"); AI_MODEL in the environment is the default.
"""
import logging
import threading
import time

import httpx
from openai import OpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)

MODELS_CACHE_SECONDS = 3600
CHAT_MODEL_TYPE = "openai/chat-completions"

# Shown first in the admin picker when the provider lists them. Cheap, fast models
# that handle structured JSON output well; quotes don't need a frontier model.
RECOMMENDED_MODELS = [
    "openai/gpt-4o-mini",
    "openai/gpt-4.1-mini",
    "openai/gpt-4o",
    "openai/gpt-4.1",
    "google/gemini-2.5-flash",
    "anthropic/claude-haiku-4.5",
    "deepseek/deepseek-chat",
]

_cache_lock = threading.Lock()
_models_cache: dict = {"at": 0.0, "models": []}


def make_client(api_key: str, timeout: float | None = None) -> OpenAI:
    # Retries and model fallback are handled by the callers.
    return OpenAI(api_key=api_key, base_url=settings.AI_BASE_URL, timeout=timeout, max_retries=0)


def _stored_settings() -> dict:
    try:
        from app.api.admin import load_global_settings
        return load_global_settings()
    except Exception as e:  # never block quoting on a settings read
        logger.warning(f"Could not read AI model setting, using AI_MODEL: {e}")
        return {}


def active_model() -> str:
    model = str(_stored_settings().get("ai_model") or "").strip()
    return model or settings.AI_MODEL


def candidate_models() -> list[str]:
    stored = _stored_settings()
    primary = str(stored.get("ai_model") or "").strip() or settings.AI_MODEL
    fallbacks = stored.get("ai_fallback_models")
    if not isinstance(fallbacks, str):
        fallbacks = settings.AI_FALLBACK_MODELS or ""
    models = [primary] + [m.strip() for m in fallbacks.split(",")]
    return list(dict.fromkeys(m for m in models if m))


def _fetch_models() -> list[dict]:
    res = httpx.get(settings.AI_MODELS_URL, timeout=20.0)
    res.raise_for_status()
    payload = res.json()
    rows = payload.get("data", payload) if isinstance(payload, dict) else payload
    seen: dict[str, dict] = {}
    for row in rows or []:
        if not isinstance(row, dict) or row.get("type") != CHAT_MODEL_TYPE:
            continue
        model_id = row.get("id")
        if not model_id or model_id in seen:
            continue
        info = row.get("info") or {}
        seen[model_id] = {
            "id": model_id,
            "name": info.get("name") or model_id,
            "developer": info.get("developer") or model_id.split("/")[0],
            "context_length": info.get("contextLength"),
        }
    return sorted(seen.values(), key=lambda m: m["id"])


def list_chat_models(force_refresh: bool = False) -> tuple[list[dict], bool]:
    """
    Chat models the provider offers, cached for an hour.
    Returns (models, live): live is False when the provider couldn't be reached
    and the list is the built-in recommendations only.
    """
    with _cache_lock:
        fresh = time.time() - _models_cache["at"] < MODELS_CACHE_SECONDS
        if _models_cache["models"] and fresh and not force_refresh:
            return _models_cache["models"], True
    try:
        models = _fetch_models()
        with _cache_lock:
            _models_cache.update(at=time.time(), models=models)
        return models, True
    except Exception as e:
        logger.warning(f"Could not fetch the AI model list: {e}")
        with _cache_lock:
            if _models_cache["models"]:
                return _models_cache["models"], True
        return [{"id": m, "name": m, "developer": m.split("/")[0], "context_length": None} for m in RECOMMENDED_MODELS], False
