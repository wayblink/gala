from __future__ import annotations

import json
import hashlib
import os
import threading
import time
from collections import OrderedDict
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class MarquezError(RuntimeError):
    """Raised when the Marquez API cannot return a usable response."""


class MarquezClient:
    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = 60,
        retries: int = 2,
        retry_delay: float = 0.5,
        token: str | None = None,
        user_agent: str = "marquez-lineage/0.2.0",
        cache_ttl: float = 30,
        cache_max_entries: int = 256,
        cache_dir: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.retries = retries
        self.retry_delay = retry_delay
        self.token = token
        self.user_agent = user_agent
        if cache_ttl < 0:
            raise ValueError("cache_ttl must be non-negative")
        if cache_max_entries < 1:
            raise ValueError("cache_max_entries must be at least 1")
        self.cache_ttl = cache_ttl
        self.cache_max_entries = cache_max_entries
        self.cache_dir = os.path.expanduser(cache_dir) if cache_dir else None
        if self.cache_dir:
            os.makedirs(self.cache_dir, exist_ok=True)
        self._cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
        self._cache_lock = threading.Lock()
        self._cache_hits = 0
        self._cache_misses = 0

    @property
    def cache_stats(self) -> dict[str, int]:
        with self._cache_lock:
            return {"hits": self._cache_hits, "misses": self._cache_misses, "entries": len(self._cache)}

    def clear_cache(self) -> None:
        with self._cache_lock:
            self._cache.clear()
            self._cache_hits = 0
            self._cache_misses = 0

    def search(self, query: str) -> list[dict[str, Any]]:
        if not query.strip():
            raise ValueError("search query must not be blank")
        payload = self._get("/api/v1/search", {"q": query})
        results = payload.get("results", [])
        if not isinstance(results, list):
            raise MarquezError("Marquez search response has no results array")
        return results

    def lineage(self, node_id: str, *, depth: int = 1) -> list[dict[str, Any]]:
        if depth < 1:
            raise ValueError("lineage depth must be at least 1")
        payload = self._get("/api/v1/lineage", {"nodeId": node_id, "depth": depth})
        graph = payload.get("graph", [])
        if not isinstance(graph, list):
            raise MarquezError("Marquez lineage response has no graph array")
        return graph

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        cache_key = f"{path}?{urlencode(sorted(params.items()))}"
        if self.cache_ttl > 0:
            now = time.time()
            with self._cache_lock:
                cached = self._cache.get(cache_key)
                if cached and now - cached[0] < self.cache_ttl:
                    self._cache.move_to_end(cache_key)
                    self._cache_hits += 1
                    return cached[1]
                disk_payload = self._read_disk_cache(cache_key, now)
                if disk_payload is not None:
                    self._cache[cache_key] = (now, disk_payload)
                    self._cache_hits += 1
                    return disk_payload
                self._cache_misses += 1
        url = f"{self.base_url}{path}?{urlencode(params)}"
        headers = {"Accept": "application/json", "User-Agent": self.user_agent}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(url, headers=headers)
        last_error: Exception | None = None

        for attempt in range(self.retries + 1):
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                if not isinstance(payload, dict):
                    raise MarquezError(f"Marquez returned non-object JSON for {path}")
                if payload.get("errors"):
                    raise MarquezError(f"Marquez API error: {payload['errors']}")
                if self.cache_ttl > 0:
                    with self._cache_lock:
                        cached_at = time.time()
                        self._cache[cache_key] = (cached_at, payload)
                        self._cache.move_to_end(cache_key)
                        self._write_disk_cache(cache_key, cached_at, payload)
                        while len(self._cache) > self.cache_max_entries:
                            self._cache.popitem(last=False)
                return payload
            except HTTPError as exc:
                last_error = MarquezError(f"Marquez request failed with HTTP {exc.code}: {url}")
                if exc.code < 500 or attempt >= self.retries:
                    raise last_error from exc
            except (URLError, TimeoutError) as exc:
                last_error = MarquezError(f"Marquez request failed: {exc.reason if isinstance(exc, URLError) else exc}")
                if attempt >= self.retries:
                    raise last_error from exc
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise MarquezError(f"Marquez returned invalid JSON for {url}") from exc

            time.sleep(self.retry_delay * (2**attempt))

        raise last_error or MarquezError(f"Marquez request failed: {url}")

    def _disk_path(self, cache_key: str) -> str | None:
        if not self.cache_dir:
            return None
        auth_scope = hashlib.sha256((self.token or "").encode()).hexdigest()
        digest = hashlib.sha256(f"{self.base_url}|{auth_scope}|{cache_key}".encode()).hexdigest()
        return os.path.join(self.cache_dir, f"{digest}.json")

    def _read_disk_cache(self, cache_key: str, now: float) -> dict[str, Any] | None:
        path = self._disk_path(cache_key)
        if not path:
            return None
        try:
            with open(path, encoding="utf-8") as stream:
                cached = json.load(stream)
            if now - float(cached["created_at"]) >= self.cache_ttl:
                return None
            payload = cached["payload"]
            return payload if isinstance(payload, dict) else None
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            return None

    def _write_disk_cache(self, cache_key: str, created_at: float, payload: dict[str, Any]) -> None:
        path = self._disk_path(cache_key)
        if not path:
            return
        temporary = f"{path}.{os.getpid()}.tmp"
        try:
            with open(temporary, "w", encoding="utf-8") as stream:
                json.dump({"created_at": created_at, "payload": payload}, stream)
            os.replace(temporary, path)
            self._prune_disk_cache()
        except OSError:
            try:
                os.unlink(temporary)
            except OSError:
                pass

    def _prune_disk_cache(self) -> None:
        if not self.cache_dir:
            return
        try:
            entries = [
                os.path.join(self.cache_dir, name)
                for name in os.listdir(self.cache_dir)
                if name.endswith(".json")
            ]
            if len(entries) <= self.cache_max_entries:
                return
            entries.sort(key=os.path.getmtime)
            for path in entries[: len(entries) - self.cache_max_entries]:
                try:
                    os.unlink(path)
                except OSError:
                    pass
        except OSError:
            pass
