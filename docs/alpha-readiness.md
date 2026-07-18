# Gala Alpha Readiness

Gala `0.1.0-alpha.1` is an internal alpha. The local library, browsing, People,
Similar Review, content labels, quality scoring, and reorganize workflows are
implemented, but the project is not yet approved for public distribution.

## Automated quality gate

Run before merging or producing an installer:

```bash
npm ci
npx playwright install chromium
npm run quality
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

GitHub Actions runs the frontend gate on Linux and the Rust gate on macOS and
Windows. The manual `Alpha installers` workflow builds unsigned internal macOS
and Windows artifacts. Public releases additionally require signing, notarization,
an update policy, and installation smoke tests on clean machines.

## Real-library benchmark

Run against representative, user-owned libraries. The command only reads the
source tree and writes thumbnails to a temporary directory:

```bash
cd src-tauri
cargo run --release --example library_benchmark -- /path/to/photos 1000
```

Record results for 10k, 50k, and 100k+ libraries. Capture discovery throughput,
thumbnail throughput, decode failures, generated cache bytes, peak memory, CPU,
and whether the UI remains responsive during a real app scan. The CLI benchmark
does not measure SQLite ingestion or UI responsiveness, so those remain separate
desktop acceptance checks.

## Reliability matrix

The following scenarios must pass before Beta:

| Scenario | Alpha status | Beta acceptance |
| --- | --- | --- |
| Repeat scan of the same source | Automated storage coverage | No duplicate photos; changed metadata is updated |
| Corrupt image | Automated thumbnail coverage | Failure is reported and the remaining scan completes |
| Source removed after indexing | UI states exist | Offline and missing are distinguishable after restart |
| External drive disconnected during scan | Not verified | Committed batches remain valid; retry resumes safely |
| App terminated during scan | Not verified | Restart reconciles the interrupted task and can rescan |
| Concurrent scans of one source | Not verified | Duplicate execution is rejected or serialized |
| Database migration from prior schema | Automated through v6/v12 fixtures | A packaged previous Alpha upgrades without data loss |
| Windows intelligent analysis | Noop fallback | Unavailable capabilities are explicit or backed by a real provider |

## Known Alpha limits

- macOS Vision is the only real provider for face detection, embeddings, photo
  embeddings, and content classification. Other platforms currently select a
  Noop provider for these capabilities.
- HEIC is discoverable, but decoding depends on the Rust image stack and is not
  accepted as reliable. RAW is not in the scanner support list.
- Browser E2E validates the responsive shell with mocked desktop calls. It is
  not a full Tauri WebView test.
- Installers are unsigned internal artifacts. Automatic updates are not enabled.
- Cache limits, battery policy, and large-library resource budgets are not yet enforced.

