from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Iterable, Mapping

from .client import MarquezClient
from .models import DatasetRef, DatasetRelation, UpstreamEdge


def load_dataset_mappings(path: str | None) -> dict[str, str]:
    if not path:
        return {}
    try:
        with open(path, encoding="utf-8") as stream:
            payload = json.load(stream)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Cannot load dataset mapping file {path!r}: {exc}") from exc
    if isinstance(payload, dict) and isinstance(payload.get("aliases"), dict):
        payload = payload["aliases"]
    if not isinstance(payload, dict) or not all(isinstance(key, str) and isinstance(value, str) for key, value in payload.items()):
        raise ValueError("dataset mapping file must be a JSON object of alias-to-logical-table strings")
    return dict(payload)


def _dataset_node(node: dict[str, Any], mappings: Mapping[str, str] | None = None) -> DatasetRef:
    data = node.get("data") or {}
    namespace = str(data.get("namespace") or "")
    name = str(data.get("name") or node.get("id") or "")
    physical_name = data.get("physicalName")
    return DatasetRef(
        id=str(node.get("id") or ""),
        name=name,
        namespace=namespace,
        kind=dataset_kind(namespace, name, data),
        logical_key=logical_dataset_key(node, mappings),
        physical_name=str(physical_name) if physical_name else None,
        updated_at=data.get("updatedAt"),
    )


def dataset_kind(namespace: str, name: str, data: dict[str, Any] | None = None) -> str:
    value = f"{namespace}:{name}".lower()
    if namespace.startswith("hive://"):
        return "hive_table"
    if namespace.startswith("hdfs://"):
        return "hdfs_dataset"
    if namespace.startswith(("alluxio", "s3://", "file", "hdfs://")):
        return "external_dataset"
    if data and data.get("type") == "DB_TABLE":
        return "table"
    return "dataset"


def logical_dataset_key(node: dict[str, Any], mappings: Mapping[str, str] | None = None) -> str:
    data = node.get("data") or {}
    namespace = str(data.get("namespace") or "")
    name = str(data.get("name") or node.get("id") or "")
    node_id = str(node.get("id") or "")
    physical_name = str(data.get("physicalName") or "")
    if mappings:
        for alias in (node_id, f"{namespace}:{name}", name, physical_name):
            if alias and alias in mappings:
                return mappings[alias]
    if physical_name and "/" not in physical_name and "://" not in physical_name and "." in physical_name:
        return physical_name
    if namespace.startswith("hive://"):
        return name
    if namespace.startswith("hdfs://"):
        path = name.strip("/")
        parts = path.split("/")
        if "table" in parts:
            index = parts.index("table")
            table = "/".join(parts[index + 1 :])
            database = parts[index - 2] if index >= 2 else ""
            if database and table:
                return f"{database}.{table.replace('/', '.')}"
            if table:
                return table.replace("/", ".")
        return path.replace("/", ".")
    return f"{namespace}:{name}" if namespace else name


def extract_downstream_edges(graph: Iterable[dict[str, Any]], upstream_id: str) -> list[UpstreamEdge]:
    nodes = {str(node.get("id")): node for node in graph}
    upstream = nodes.get(upstream_id)
    if not upstream:
        return []

    edges: list[UpstreamEdge] = []
    for edge in upstream.get("outEdges") or []:
        job_id = str(edge.get("destination") or "")
        job = nodes.get(job_id)
        if not job or job.get("type") != "JOB":
            continue
        for job_edge in job.get("outEdges") or []:
            downstream_id = str(job_edge.get("destination") or "")
            downstream = nodes.get(downstream_id)
            if downstream and downstream.get("type") == "DATASET":
                edges.append(UpstreamEdge(upstream_id, downstream_id, job_id))
    return edges


def extract_upstream_edges(graph: Iterable[dict[str, Any]], downstream_id: str) -> list[UpstreamEdge]:
    nodes = {str(node.get("id")): node for node in graph}
    downstream = nodes.get(downstream_id)
    if not downstream:
        return []

    edges: list[UpstreamEdge] = []
    for edge in downstream.get("inEdges") or []:
        job_id = str(edge.get("origin") or "")
        job = nodes.get(job_id)
        if not job or job.get("type") != "JOB":
            continue
        for job_edge in job.get("inEdges") or []:
            upstream_id = str(job_edge.get("origin") or "")
            upstream = nodes.get(upstream_id)
            if upstream and upstream.get("type") == "DATASET":
                edges.append(UpstreamEdge(upstream_id, downstream_id, job_id))
    return edges


def resolve_target(client: MarquezClient, table: str, namespace: str | None = None) -> DatasetRef:
    results = [result for result in client.search(table) if result.get("type") == "DATASET"]
    if namespace:
        filtered = [result for result in results if result.get("namespace") == namespace]
        if filtered:
            results = filtered
    if not results:
        raise ValueError(f"No Marquez dataset found for {table!r}")

    def score(result: dict[str, Any]) -> tuple[int, str]:
        name = str(result.get("name") or "")
        exact = int(name == table or name.endswith(f".{table}"))
        return (exact, str(result.get("updatedAt") or ""))

    result = max(results, key=score)
    return DatasetRef(
        id=str(result["nodeId"]),
        name=str(result.get("name") or ""),
        namespace=str(result.get("namespace") or ""),
        kind=dataset_kind(str(result.get("namespace") or ""), str(result.get("name") or ""), result),
        logical_key=logical_dataset_key({"id": result.get("nodeId"), "data": result}),
        physical_name=result.get("physicalName"),
        updated_at=result.get("updatedAt"),
    )


def upstream_tables(
    client: MarquezClient,
    table: str,
    *,
    max_hops: int = 3,
    namespace: str | None = None,
    include_paths: bool = True,
    dedupe: str = "logical_table",
    max_workers: int = 8,
    dataset_mappings: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    if max_hops < 1:
        raise ValueError("max_hops must be at least 1")
    if dedupe not in {"logical_table", "dataset"}:
        raise ValueError("dedupe must be logical_table or dataset")
    if max_workers < 1:
        raise ValueError("max_workers must be at least 1")

    target = resolve_target(client, table, namespace)
    requested_target = target
    node_cache: dict[str, dict[str, Any]] = {}
    graph_cache: dict[tuple[str, int], list[dict[str, Any]]] = {}

    def load_graph(node_id: str) -> list[dict[str, Any]]:
        key = (node_id, 1)
        if key not in graph_cache:
            graph_cache[key] = client.lineage(node_id, depth=1)
            for node in graph_cache[key]:
                node_cache[str(node.get("id"))] = node
        return graph_cache[key]

    initial_graph = load_graph(target.id)
    if target.id not in node_cache:
        candidates = [
            node
            for node in initial_graph
            if node.get("type") == "DATASET"
            and (
                logical_dataset_key(node, dataset_mappings) == target.logical_key
                or str((node.get("data") or {}).get("name", "")).endswith(table)
            )
        ]
        if candidates:
            target = _dataset_node(max(candidates, key=lambda node: str((node.get("data") or {}).get("updatedAt", ""))), dataset_mappings)
            graph_cache[(target.id, 1)] = initial_graph

    current = {target.id: target}
    seen_ids = {target.id, requested_target.id}
    seen_keys = {target.logical_key, requested_target.logical_key}
    levels: list[dict[str, Any]] = []
    relations: list[DatasetRelation] = []
    warnings: list[str] = []

    for hop in range(1, max_hops + 1):
        next_items: dict[str, DatasetRelation] = {}
        with ThreadPoolExecutor(max_workers=min(max_workers, max(1, len(current)))) as executor:
            graphs = dict(zip(current, executor.map(load_graph, current)))
        for downstream_id, downstream_ref in current.items():
            graph = graphs[downstream_id]
            for edge in extract_upstream_edges(graph, downstream_id):
                upstream_node = node_cache.get(edge.upstream_id)
                downstream_node = node_cache.get(edge.downstream_id)
                if not upstream_node:
                    continue
                upstream_ref = _dataset_node(upstream_node, dataset_mappings)
                if downstream_node:
                    downstream_ref = _dataset_node(downstream_node, dataset_mappings)
                key = upstream_ref.logical_key if dedupe == "logical_table" else upstream_ref.id
                if upstream_ref.id in seen_ids or key in seen_keys:
                    continue
                relation = next_items.get(key)
                if relation is None:
                    relation = DatasetRelation(upstream_ref, downstream_ref, hop)
                    next_items[key] = relation
                relation.via_jobs.add(edge.via_job_id)

        level_relations = list(next_items.values())
        levels.append({"hop": hop, "datasets": [relation.upstream.to_dict() for relation in level_relations]})
        relations.extend(level_relations)
        current = {relation.upstream.id: relation.upstream for relation in level_relations}
        seen_ids.update(current)
        seen_keys.update(relation.upstream.logical_key for relation in level_relations)
        if not current:
            break

    external_count = sum(relation.upstream.kind == "external_dataset" for relation in relations)
    if external_count:
        warnings.append(f"{external_count} upstream dataset(s) are external/physical datasets, not Hive tables")
    if include_paths:
        paths = [relation.to_dict() for relation in relations]
    else:
        paths = []

    return {
        "target": target.to_dict(),
        "requested_target": requested_target.to_dict(),
        "direction": "upstream",
        "levels": levels,
        "paths": paths,
        "warnings": warnings,
        "stats": {
            "max_hops": max_hops,
            "levels_returned": len(levels),
            "datasets_returned": len(relations),
            "lineage_requests": len(graph_cache),
            "max_workers": max_workers,
        },
    }


def downstream_tables(
    client: MarquezClient,
    table: str,
    *,
    max_hops: int = 3,
    namespace: str | None = None,
    include_paths: bool = True,
    dedupe: str = "logical_table",
    max_workers: int = 8,
    dataset_mappings: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    if max_hops < 1:
        raise ValueError("max_hops must be at least 1")
    if dedupe not in {"logical_table", "dataset"}:
        raise ValueError("dedupe must be logical_table or dataset")
    if max_workers < 1:
        raise ValueError("max_workers must be at least 1")

    target = resolve_target(client, table, namespace)
    requested_target = target
    node_cache: dict[str, dict[str, Any]] = {}
    graph_cache: dict[tuple[str, int], list[dict[str, Any]]] = {}

    def load_graph(node_id: str) -> list[dict[str, Any]]:
        key = (node_id, 1)
        if key not in graph_cache:
            graph_cache[key] = client.lineage(node_id, depth=1)
            for node in graph_cache[key]:
                node_cache[str(node.get("id"))] = node
        return graph_cache[key]

    initial_graph = load_graph(target.id)
    if target.id not in node_cache:
        candidates = [
            node for node in initial_graph
            if node.get("type") == "DATASET"
            and (logical_dataset_key(node, dataset_mappings) == target.logical_key
                 or str((node.get("data") or {}).get("name", "")).endswith(table))
        ]
        if candidates:
            target = _dataset_node(max(candidates, key=lambda node: str((node.get("data") or {}).get("updatedAt", ""))), dataset_mappings)
            graph_cache[(target.id, 1)] = initial_graph

    current = {target.id: target}
    seen_ids = {target.id, requested_target.id}
    seen_keys = {target.logical_key, requested_target.logical_key}
    levels: list[dict[str, Any]] = []
    relations: list[DatasetRelation] = []
    incomplete_jobs = 0

    for hop in range(1, max_hops + 1):
        next_items: dict[str, DatasetRelation] = {}
        with ThreadPoolExecutor(max_workers=min(max_workers, max(1, len(current)))) as executor:
            graphs = dict(zip(current, executor.map(load_graph, current)))
        for upstream_id in current:
            graph = graphs[upstream_id]
            graph_nodes = {str(node.get("id")): node for node in graph}
            source_node = graph_nodes.get(upstream_id, {})
            incomplete_jobs += sum(
                1
                for edge in source_node.get("outEdges") or []
                if (job := graph_nodes.get(str(edge.get("destination") or "")))
                and job.get("type") == "JOB"
                and not job.get("outEdges")
            )
            for edge in extract_downstream_edges(graph, upstream_id):
                downstream_node = node_cache.get(edge.downstream_id)
                upstream_node = node_cache.get(edge.upstream_id)
                if not downstream_node:
                    continue
                downstream_ref = _dataset_node(downstream_node, dataset_mappings)
                if upstream_node:
                    upstream_ref = _dataset_node(upstream_node, dataset_mappings)
                key = downstream_ref.logical_key if dedupe == "logical_table" else downstream_ref.id
                if downstream_ref.id in seen_ids or key in seen_keys:
                    continue
                relation = next_items.get(key)
                if relation is None:
                    relation = DatasetRelation(upstream_ref, downstream_ref, hop)
                    next_items[key] = relation
                relation.via_jobs.add(edge.via_job_id)
        level_relations = list(next_items.values())
        levels.append({"hop": hop, "datasets": [relation.downstream.to_dict() for relation in level_relations]})
        relations.extend(level_relations)
        current = {relation.downstream.id: relation.downstream for relation in level_relations}
        seen_ids.update(current)
        seen_keys.update(relation.downstream.logical_key for relation in level_relations)
        if not current:
            break

    external_count = sum(relation.downstream.kind == "external_dataset" for relation in relations)
    warnings = [f"{external_count} downstream dataset(s) are external/physical datasets, not Hive tables"] if external_count else []
    if incomplete_jobs:
        warnings.append(f"{incomplete_jobs} consumer job(s) have no output dataset in Marquez; downstream lineage may be incomplete")
    return {
        "target": target.to_dict(),
        "requested_target": requested_target.to_dict(),
        "direction": "downstream",
        "levels": levels,
        "paths": [relation.to_dict() for relation in relations] if include_paths else [],
        "warnings": warnings,
        "stats": {
            "max_hops": max_hops,
            "levels_returned": len(levels),
            "datasets_returned": len(relations),
            "lineage_requests": len(graph_cache),
            "max_workers": max_workers,
            "incomplete_jobs": incomplete_jobs,
        },
    }


def render_markdown(result: dict[str, Any]) -> str:
    target = result["target"]
    direction = result.get("direction", "upstream")
    direction_label = "上游" if direction == "upstream" else "下游"
    lines = [
        f"# Marquez {direction_label}血缘：`{target.get('name', target.get('logical_key', ''))}`", 
        "",
        f"- Namespace：`{target.get('namespace', '')}`",
        f"- 类型：`{target.get('kind', '')}`",
        f"- 查询请求数：`{result.get('stats', {}).get('lineage_requests', 0)}`",
        "",
    ]
    for level in result.get("levels", []):
        lines.append(f"## 第 {level['hop']} 跳")
        datasets = level.get("datasets", [])
        if not datasets:
            lines.append(f"无新增{direction_label}。")
        else:
            for dataset in datasets:
                lines.append(f"- `{dataset.get('logical_key', dataset.get('name', ''))}` ({dataset.get('kind', 'dataset')})")
        lines.append("")
    if result.get("warnings"):
        lines.append("## 注意事项")
        lines.extend(f"- {warning}" for warning in result["warnings"])
        lines.append("")
    if result.get("paths"):
        lines.append("## 血缘路径")
        for relation in result["paths"]:
            lines.append(
                f"- 第 {relation['hop']} 跳：`{relation['upstream']['logical_key']}` → "
                f"`{relation['downstream']['logical_key']}`；Job：{', '.join(f'`{job}`' for job in relation['via_jobs'])}"
            )
    return "\n".join(lines).rstrip() + "\n"
