# marquez-lineage

标准库 Python 实现的 Marquez client + CLI。它默认逐层请求 `depth=1` lineage，并按逻辑数据集去重，避免直接下载包含大量历史 Spark Job 的 `depth=3` 大图。逐层请求支持并发；client 提供带 TTL 和容量上限的进程内缓存，也支持跨 CLI 进程的磁盘缓存。

## 快速开始

在仓库根目录运行：

```bash
tools/marquez-lineage/marquez-lineage upstream \
  dws_stepai_quality_web_result_daily_v1 \
  --hops 3 \
  --format markdown
```

并发数是全局选项，例如：

```bash
tools/marquez-lineage/marquez-lineage --max-workers 8 upstream TABLE
```

查询下游表：

```bash
tools/marquez-lineage/marquez-lineage downstream \
  dws_stepai_quality_web_result_daily_v1 \
  --hops 3 \
  --format markdown
```

外部物理数据集可通过 mapping file 映射到逻辑表。键可以是完整 node ID、`namespace:name`、name 或 `physicalName`：

```bash
tools/marquez-lineage/marquez-lineage upstream TABLE \
  --mapping-file tools/marquez-lineage/dataset-mappings.example.json
```

示例结构：

```json
{
  "aliases": {
    "dataset:alluxio:/warehouse/dwd_example": "example_db.dwd_example"
  }
}
```

查询结果输出为 JSON：

```bash
tools/marquez-lineage/marquez-lineage upstream TABLE \
  --namespace hive://10.130.17.34:9083 \
  --hops 3 \
  --format json
```

搜索 dataset/job：

```bash
tools/marquez-lineage/marquez-lineage search TABLE --format table
```

缓存默认 30 秒、最多 256 个进程内响应，并持久化到 `~/.cache/marquez-lineage`，因此连续执行多次 CLI 也能命中；可调整或关闭：

```bash
tools/marquez-lineage/marquez-lineage \
  --cache-ttl 120 \
  --cache-size 512 \
  --cache-dir ~/.cache/marquez-lineage \
  upstream TABLE

# 关闭缓存
... --cache-ttl 0 upstream TABLE upstream TABLE
```

也可以通过环境变量覆盖服务地址和 token：

```bash
MARQUEZ_URL=https://marquez.example MARQUEZ_TOKEN=... \
  tools/marquez-lineage/marquez-lineage search TABLE
```

## Python client

```python
from marquez_lineage import MarquezClient, downstream_tables, upstream_tables

client = MarquezClient("https://marquez.stepfun-inc.com")
result = upstream_tables(client, "dws_stepai_quality_web_result_daily_v1", max_hops=3)
downstream = downstream_tables(client, "dws_stepai_quality_web_result_daily_v1", max_hops=3)

# 跨 CLI 进程缓存
cached = MarquezClient(
    "https://marquez.stepfun-inc.com",
    cache_ttl=120,
    cache_dir="~/.cache/marquez-lineage",
)
```

核心逻辑位于 `src/marquez_lineage/`，CLI 只是适配层。未来如果需要 MCP，可以直接复用 `MarquezClient`、`upstream_tables` 和 `downstream_tables`，不复制 lineage 遍历逻辑。

## 开发测试

```bash
cd tools/marquez-lineage
PYTHONPATH=src python3 -m unittest discover -s tests -v
```
