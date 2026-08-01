# Iris native packaging (Citra-style)

Main package `@sylphx/image-reader-mcp` / brand `@sylphx/iris` is a **thin launcher**.

Natives ship as optionalDependencies:

| Platform package | Target |
| --- | --- |
| `@sylphx/image-reader-mcp-darwin-arm64` | macOS Apple Silicon |
| `@sylphx/image-reader-mcp-darwin-x64` | macOS Intel |
| `@sylphx/image-reader-mcp-linux-x64-gnu` | Linux x64 glibc |
| `@sylphx/image-reader-mcp-linux-arm64-gnu` | Linux arm64 glibc |

Sources under `packages/npm/<platform>/`. Publish platform packages **before** or with the main package at the same version.
