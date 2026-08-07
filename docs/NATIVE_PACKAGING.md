# Iris native packaging (Citra-style)

Main package **`@sylphx/iris`** (deprecated transitional id `@sylphx/image-reader-mcp`) is a **thin launcher**.

Natives ship as optionalDependencies:

| Platform package | Target |
| --- | --- |
| `@sylphx/iris-darwin-arm64` | macOS Apple Silicon |
| `@sylphx/iris-darwin-x64` | macOS Intel |
| `@sylphx/iris-linux-x64-gnu` | Linux x64 glibc |
| `@sylphx/iris-linux-arm64-gnu` | Linux arm64 glibc |

Sources under `packages/npm/<platform>/`. Publish platform packages **before** or with the main package at the same version.
