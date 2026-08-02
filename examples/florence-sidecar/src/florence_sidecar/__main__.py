"""CLI entry for iris-sidecar."""

from __future__ import annotations

import os

from .serve import serve


def main() -> None:
    host = os.environ.get("IRIS_SIDECAR_HOST", "127.0.0.1")
    port = int(os.environ.get("IRIS_SIDECAR_PORT", "8765"))
    serve(host=host, port=port)


if __name__ == "__main__":
    main()
