import unittest

from marquez_lineage.lineage import (
    extract_upstream_edges,
    logical_dataset_key,
    load_dataset_mappings,
    render_markdown,
    upstream_tables,
    downstream_tables,
)


TARGET = "dataset:hdfs://warehouse:/crawler_scheduler/dws/table/result"
INPUT = "dataset:hdfs://warehouse:/crawler_scheduler/dwd/table/input"
RAW = "dataset:s3://url-repo:crawled/successful/daily/zh"
JOB_TARGET = "job:stepmind:run.result"
JOB_INPUT = "job:stepmind:run.input"


def node(node_id, node_type, name=None, namespace=None, in_edges=None, out_edges=None):
    data = {}
    if name is not None:
        data["name"] = name
    if namespace is not None:
        data["namespace"] = namespace
    return {
        "id": node_id,
        "type": node_type,
        "data": data,
        "inEdges": in_edges or [],
        "outEdges": out_edges or [],
    }


class LineageExtractionTests(unittest.TestCase):
    def setUp(self):
        self.graph = [
            node(
                TARGET,
                "DATASET",
                "/crawler_scheduler/dws/table/result",
                "hdfs://warehouse",
                in_edges=[{"origin": JOB_TARGET, "destination": TARGET}],
            ),
            node(
                JOB_TARGET,
                "JOB",
                in_edges=[{"origin": INPUT, "destination": JOB_TARGET}, {"origin": RAW, "destination": JOB_TARGET}],
            ),
            node(
                INPUT,
                "DATASET",
                "/crawler_scheduler/dwd/table/input",
                "hdfs://warehouse",
                in_edges=[{"origin": JOB_INPUT, "destination": INPUT}],
            ),
            node(
                RAW,
                "DATASET",
                "crawled/successful/daily/zh",
                "s3://url-repo",
            ),
            node(JOB_INPUT, "JOB", in_edges=[]),
        ]

    def test_extracts_only_incoming_dataset_edges_and_preserves_job(self):
        edges = extract_upstream_edges(self.graph, TARGET)
        self.assertEqual({edge.upstream_id for edge in edges}, {INPUT, RAW})
        self.assertEqual({edge.downstream_id for edge in edges}, {TARGET})
        self.assertEqual({edge.via_job_id for edge in edges}, {JOB_TARGET})

    def test_logical_key_normalizes_hdfs_table_path(self):
        dataset = self.graph[0]
        self.assertEqual(logical_dataset_key(dataset), "crawler_scheduler.result")

    def test_finds_canonical_hdfs_target_when_search_returns_hive_node(self):
        class FakeClient:
            def search(self, query):
                return [
                    {
                        "type": "DATASET",
                        "name": "crawler_scheduler.result",
                        "namespace": "hive://metastore",
                        "nodeId": "dataset:hive://metastore:crawler_scheduler.result",
                    }
                ]

            def lineage(self, node_id, depth=1):
                return self.graph

        client = FakeClient()
        client.graph = self.graph
        result = upstream_tables(client, "result", max_hops=1)

        self.assertEqual(result["target"]["logical_key"], "crawler_scheduler.result")
        self.assertEqual(
            {item["logical_key"] for item in result["levels"][0]["datasets"]},
            {"crawler_scheduler.input", "s3://url-repo:crawled/successful/daily/zh"},
        )

    def test_downstream_traversal_uses_outgoing_job_edges(self):
        downstream = "dataset:hdfs://warehouse:/crawler_scheduler/dws/table/downstream"
        job = "job:stepmind:run.downstream"
        graph = [
            node(
                TARGET,
                "DATASET",
                "/crawler_scheduler/dws/table/result",
                "hdfs://warehouse",
                out_edges=[{"origin": TARGET, "destination": job}],
            ),
            node(
                job,
                "JOB",
                in_edges=[{"origin": TARGET, "destination": job}],
                out_edges=[{"origin": job, "destination": downstream}],
            ),
            node(
                downstream,
                "DATASET",
                "/crawler_scheduler/dws/table/downstream",
                "hdfs://warehouse",
                in_edges=[{"origin": job, "destination": downstream}],
            ),
        ]

        class FakeClient:
            def search(self, query):
                return [{
                    "type": "DATASET",
                    "name": "crawler_scheduler.result",
                    "namespace": "hive://metastore",
                    "nodeId": "dataset:hive://metastore:crawler_scheduler.result",
                }]

            def lineage(self, node_id, depth=1):
                return graph

        result = downstream_tables(FakeClient(), "result", max_hops=1)
        self.assertEqual([item["logical_key"] for item in result["levels"][0]["datasets"]], ["crawler_scheduler.downstream"])

    def test_downstream_warns_when_consumer_job_has_no_output_dataset(self):
        job = "job:stepmind:dangling.consumer"
        graph = [
            node(TARGET, "DATASET", "/crawler_scheduler/dws/table/result", "hdfs://warehouse", out_edges=[{"origin": TARGET, "destination": job}]),
            node(job, "JOB", in_edges=[{"origin": TARGET, "destination": job}], out_edges=[]),
        ]

        class FakeClient:
            def search(self, query):
                return [{"type": "DATASET", "name": "crawler_scheduler.result", "namespace": "hive://metastore", "nodeId": "dataset:hive://metastore:crawler_scheduler.result"}]

            def lineage(self, node_id, depth=1):
                return graph

        result = downstream_tables(FakeClient(), "result", max_hops=1)
        self.assertEqual(result["stats"]["incomplete_jobs"], 1)
        self.assertIn("consumer job(s) have no output dataset", result["warnings"][0])

    def test_explicit_mapping_overrides_physical_dataset_key(self):
        physical = node("dataset:alluxio:/warehouse/raw", "DATASET", "/warehouse/raw", "alluxio")
        mappings = {"dataset:alluxio:/warehouse/raw": "crawler_scheduler.dwd_raw"}
        self.assertEqual(logical_dataset_key(physical, mappings), "crawler_scheduler.dwd_raw")

    def test_mapping_file_supports_alias_object(self):
        import json
        import tempfile
        with tempfile.NamedTemporaryFile("w+", suffix=".json") as stream:
            json.dump({"aliases": {"alluxio:/warehouse/raw": "db.table"}}, stream)
            stream.flush()
            self.assertEqual(load_dataset_mappings(stream.name), {"alluxio:/warehouse/raw": "db.table"})

    def test_external_physical_mapping_prefers_catalog_table_name(self):
        physical = node(
            "dataset:alluxio:/warehouse/physical",
            "DATASET",
            "/warehouse/physical",
            "alluxio",
        )
        physical["data"]["facets"] = {"catalog": {"name": "crawler_scheduler"}}
        physical["data"]["physicalName"] = "crawler_scheduler.dwd_physical"
        self.assertEqual(logical_dataset_key(physical), "crawler_scheduler.dwd_physical")

    def test_markdown_includes_hops_and_external_dataset_warning(self):
        result = {
            "target": {"name": "crawler_scheduler.result", "kind": "hive_table"},
            "levels": [
                {
                    "hop": 1,
                    "datasets": [
                        {"name": "crawled/successful/daily/zh", "kind": "external_dataset"}
                    ],
                }
            ],
            "paths": [],
            "warnings": [],
        }
        output = render_markdown(result)
        self.assertIn("第 1 跳", output)
        self.assertIn("crawled/successful/daily/zh", output)
        self.assertIn("external_dataset", output)


if __name__ == "__main__":
    unittest.main()
