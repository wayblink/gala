import json
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from marquez_lineage.client import MarquezClient, MarquezError


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class ClientTests(unittest.TestCase):
    @patch("marquez_lineage.client.urlopen")
    def test_search_uses_q_parameter_and_returns_results(self, urlopen):
        urlopen.return_value = FakeResponse({"totalCount": 1, "results": [{"type": "DATASET"}]})
        client = MarquezClient("https://marquez.example", timeout=12)

        results = client.search("db.table")

        request = urlopen.call_args.args[0]
        self.assertIn("/api/v1/search?q=db.table", request.full_url)
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 12)
        self.assertEqual(results, [{"type": "DATASET"}])

    @patch("marquez_lineage.client.urlopen")
    def test_lineage_encodes_node_id(self, urlopen):
        urlopen.return_value = FakeResponse({"graph": []})
        client = MarquezClient("https://marquez.example")

        graph = client.lineage("dataset:hive://host:db.table", depth=1)

        request = urlopen.call_args.args[0]
        self.assertIn("nodeId=dataset%3Ahive%3A%2F%2Fhost%3Adb.table", request.full_url)
        self.assertIn("depth=1", request.full_url)
        self.assertEqual(graph, [])

    @patch("marquez_lineage.client.urlopen")
    def test_http_errors_become_actionable_client_errors(self, urlopen):
        urlopen.side_effect = HTTPError("https://x", 500, "error", {}, None)
        client = MarquezClient("https://marquez.example", retries=0)

        with self.assertRaisesRegex(MarquezError, "HTTP 500"):
            client.search("table")

    @patch("marquez_lineage.client.urlopen")
    def test_network_errors_are_retried(self, urlopen):
        urlopen.side_effect = [URLError("temporary"), FakeResponse({"results": []})]
        client = MarquezClient("https://marquez.example", retries=1, retry_delay=0)

        self.assertEqual(client.search("table"), [])
        self.assertEqual(urlopen.call_count, 2)

    @patch("marquez_lineage.client.urlopen")
    def test_successful_responses_are_cached_for_ttl(self, urlopen):
        urlopen.return_value = FakeResponse({"results": [{"type": "DATASET"}]})
        client = MarquezClient("https://marquez.example", cache_ttl=60)

        self.assertEqual(client.search("table"), client.search("table"))
        self.assertEqual(urlopen.call_count, 1)
        self.assertEqual(client.cache_stats["hits"], 1)

    @patch("marquez_lineage.client.urlopen")
    def test_disk_cache_is_reused_across_clients(self, urlopen):
        urlopen.return_value = FakeResponse({"results": [{"type": "DATASET"}]})
        with tempfile.TemporaryDirectory() as cache_dir:
            first = MarquezClient("https://marquez.example", cache_ttl=60, cache_dir=cache_dir)
            second = MarquezClient("https://marquez.example", cache_ttl=60, cache_dir=cache_dir)
            self.assertEqual(first.search("table"), second.search("table"))
        self.assertEqual(urlopen.call_count, 1)

    @patch("marquez_lineage.client.urlopen")
    def test_cache_can_be_disabled(self, urlopen):
        urlopen.return_value = FakeResponse({"results": []})
        client = MarquezClient("https://marquez.example", cache_ttl=0)

        client.search("table")
        client.search("table")
        self.assertEqual(urlopen.call_count, 2)


if __name__ == "__main__":
    unittest.main()
