from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Sequence

from .client import MarquezClient, MarquezError
from .lineage import downstream_tables, load_dataset_mappings, render_markdown, upstream_tables


DEFAULT_URL = "https://marquez.stepfun-inc.com"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="marquez-lineage",
        description="Query Marquez datasets and traverse table lineage without downloading a full multi-hop graph.",
    )
    parser.add_argument("--url", default=os.getenv("MARQUEZ_URL", DEFAULT_URL), help="Marquez base URL")
    parser.add_argument("--token", default=os.getenv("MARQUEZ_TOKEN"), help="Bearer token (or MARQUEZ_TOKEN)")
    parser.add_argument("--timeout", type=float, default=60, help="HTTP timeout in seconds (default: 60)")
    parser.add_argument("--retries", type=int, default=2, help="HTTP retry count (default: 2)")
    parser.add_argument("--cache-ttl", type=float, default=30, help="Successful response cache TTL in seconds (default: 30; 0 disables)")
    parser.add_argument("--cache-size", type=int, default=256, help="Maximum cached responses (default: 256)")
    parser.add_argument("--max-workers", type=int, default=8, help="Concurrent lineage requests per hop (default: 8)")
    parser.add_argument("--cache-dir", default=os.getenv("MARQUEZ_CACHE_DIR", os.path.expanduser("~/.cache/marquez-lineage")), help="Persistent response cache directory")
    subparsers = parser.add_subparsers(dest="command", required=True)

    for direction in ("upstream", "downstream"):
        command = subparsers.add_parser(direction, help=f"Find {direction} tables/datasets")
        command.add_argument("table", help="Full or partial table name")
        command.add_argument("--namespace", help="Prefer an exact Marquez namespace")
        command.add_argument("--hops", type=int, default=3, choices=range(1, 11), metavar="1..10")
        command.add_argument("--dedupe", choices=("logical_table", "dataset"), default="logical_table")
        command.add_argument("--no-paths", action="store_true", help="Omit detailed dataset-to-dataset paths")
        command.add_argument("--format", choices=("markdown", "json", "table"), default="table")
        command.add_argument("--mapping-file", help="JSON aliases for physical dataset to logical table mapping")

    search = subparsers.add_parser("search", help="Search Marquez datasets and jobs")
    search.add_argument("query")
    search.add_argument("--format", choices=("json", "table"), default="table")
    return parser


def _render_search_table(results: list[dict]) -> str:
    rows = [(str(item.get("type", "")), str(item.get("namespace", "")), str(item.get("name", ""))) for item in results]
    widths = [len(title) for title in ("TYPE", "NAMESPACE", "NAME")]
    for row in rows:
        widths = [max(width, len(value)) for width, value in zip(widths, row)]
    lines = [f"{'TYPE':<{widths[0]}}  {'NAMESPACE':<{widths[1]}}  NAME"]
    lines.append(f"{'-' * widths[0]}  {'-' * widths[1]}  {'-' * widths[2]}")
    lines.extend(f"{row[0]:<{widths[0]}}  {row[1]:<{widths[1]}}  {row[2]}" for row in rows)
    return "\n".join(lines) + "\n"


def _render_upstream_table(result: dict) -> str:
    target = result["target"]
    lines = [
        f"Direction: {result.get('direction', 'upstream')}",
        f"Target: {target.get('logical_key', target.get('name'))}",
        f"Namespace: {target.get('namespace', '')}",
        "",
        "HOP  KIND              UPSTREAM",
        "---  ----------------  --------",
    ]
    for level in result.get("levels", []):
        if not level.get("datasets"):
            lines.append(f"{level['hop']:<3}  {'-':<16}  (no new {result.get('direction', 'upstream')} datasets)")
        for dataset in level.get("datasets", []):
            lines.append(f"{level['hop']:<3}  {dataset.get('kind', ''):<16}  {dataset.get('logical_key', dataset.get('name', ''))}")
    if result.get("warnings"):
        lines.append("")
        lines.extend(f"Warning: {warning}" for warning in result["warnings"])
    stats = result.get("stats", {})
    lines.extend(["", f"Datasets: {stats.get('datasets_returned', 0)}; lineage requests: {stats.get('lineage_requests', 0)}; workers: {stats.get('max_workers', 1)}"])
    return "\n".join(lines) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    client = MarquezClient(
        args.url,
        timeout=args.timeout,
        retries=args.retries,
        token=args.token,
        cache_ttl=args.cache_ttl,
        cache_max_entries=args.cache_size,
        cache_dir=args.cache_dir,
    )
    try:
        if args.command == "search":
            results = client.search(args.query)
            output = json.dumps(results, ensure_ascii=False, indent=2) + "\n" if args.format == "json" else _render_search_table(results)
        else:
            traversal = upstream_tables if args.command == "upstream" else downstream_tables
            result = traversal(
                client,
                args.table,
                max_hops=args.hops,
                namespace=args.namespace,
                include_paths=not args.no_paths,
                dedupe=args.dedupe,
                max_workers=args.max_workers,
                dataset_mappings=load_dataset_mappings(args.mapping_file),
            )
            if args.format == "json":
                output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
            elif args.format == "markdown":
                output = render_markdown(result)
            else:
                output = _render_upstream_table(result)
        sys.stdout.write(output)
        return 0
    except (MarquezError, ValueError) as exc:
        parser.exit(2, f"error: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())
