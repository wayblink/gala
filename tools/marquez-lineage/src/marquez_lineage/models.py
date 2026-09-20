from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class DatasetRef:
    id: str
    name: str
    namespace: str
    kind: str
    logical_key: str
    physical_name: str | None = None
    updated_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {key: value for key, value in asdict(self).items() if value is not None}


@dataclass(frozen=True)
class UpstreamEdge:
    upstream_id: str
    downstream_id: str
    via_job_id: str


@dataclass
class DatasetRelation:
    upstream: DatasetRef
    downstream: DatasetRef
    hop: int
    via_jobs: set[str] = field(default_factory=set)

    def to_dict(self) -> dict[str, Any]:
        return {
            "hop": self.hop,
            "upstream": self.upstream.to_dict(),
            "downstream": self.downstream.to_dict(),
            "via_jobs": sorted(self.via_jobs),
        }
