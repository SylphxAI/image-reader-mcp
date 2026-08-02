"""Reference sidecar for Iris L2 local semantics.

Implements the IRIS_SEMANTICS_URL contract consumed by
image-reader-mcp src/utils/optionalSemantics.ts.

Design: FastAPI app; inference is injected so tests can run with a mock
infer function (no model, no network). Falls back to loading a local
transformers Florence-2 / Grounding-DINO when infer_fn is not provided.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Callable, Optional

from src.contract import normalize_response  # noqa: E402

try:
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel
except Exception:  # pragma: no cover - dev-only import guard
    FastAPI = None  # type: ignore
    HTTPException = None  # type: ignore
    JSONResponse = None  # type: ignore
    BaseModel = None  # type: ignore

InferFn = Callable[[Path, str, Optional[str]], dict[str, Any]]

MAX_IMAGE_BYTES = 16 * 1024 * 1024

DEFAULT_PORT = 8765
DEFAULT_HOST = "127.0.0.1"
DEFAULT_MODEL = "microsoft/Florence-2-large"  # or Grounding-DINO via local path
OBJECT_PROMPT = (
    "Detect and describe the main subjects (people, animals, objects) "
    "with bounding boxes. Return a JSON object with a short factual caption "
    "and a list of objects each with label, category, bbox {x, y, width, height} "
    "in pixels for the full image, and a score 0..1."
)


def _default_infer(path: Path, prompt: str, model_name: str) -> dict[str, Any]:
    """Load a local transformers Florence-2 / Grounding-DINO if installed.

    Raises RuntimeError with a clear message when the model stack is missing,
    so /semantics returns an honest 500 instead of empty guessing.
    """
    try:
        from PIL import Image
        from transformers import AutoProcessor, AutoModelForCausalLM  # type: ignore
    except Exception as exc:  # pragma: no cover - env-dependent
        raise RuntimeError(
            "transformers/PIL not installed. Run: pip install -r requirements.txt"
        ) from exc

    processor = AutoProcessor.from_pretrained(model_name, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(model_name, trust_remote_code=True)
    image = Image.open(path).convert("RGB")
    w, h = image.size
    task = "<MORE_DETAILED_CAPTION>" if not prompt else "<OPEN_VOCABULARY_DETECTION>"
    inputs = processor(text=OBJECT_PROMPT, images=image, return_tensors="pt")
    generated = model.generate(**inputs, max_new_tokens=512)
    text = processor.batch_decode(generated, skip_special_tokens=True)[0]
    # Florence may emit caption only; wrap minimal contract, detection expanded
    # via post-processing in production deployments. Keep honest: caption is
    # model output; objects require a detection model/task.
    return {"caption": text, "model": model_name, "objects": [], "width": w, "height": h}


def build_app(infer_fn: Optional[InferFn] = None, model_name: Optional[str] = None) -> Any:
    if FastAPI is None:  # pragma: no cover - import guard
        raise RuntimeError("fastapi not installed (dev/optional runtime)")

    effective_model = model_name or os.environ.get("IRIS_SIDECAR_MODEL", DEFAULT_MODEL)
    current_infer = infer_fn

    app = FastAPI(title="Iris L2 semantics sidecar", version="0.1.0")

    if BaseModel is not None:  # type: ignore[arg-type]

        class SemanticsRequest(BaseModel):  # type: ignore[misc]
            path: str
            mime: Optional[str] = None
            purpose: Optional[str] = None
            prompt: Optional[str] = None

        @app.get("/health")
        def health() -> dict[str, Any]:
            return {"status": "ok", "model": effective_model}

        @app.post("/semantics")
        def semantics(req: SemanticsRequest) -> JSONResponse:
            path = Path(req.path)
            if not path.is_file():
                raise HTTPException(status_code=500, detail=f"cannot read file {req.path}")

            size = path.stat().st_size
            if size > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=500, detail="image too large for sidecar")

            import PIL.Image  # type: ignore

            try:
                img = PIL.Image.open(path).convert("RGB")
                width, height = img.size
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"not an image: {exc}")

            try:
                fn = current_infer or (lambda p, pr: _default_infer(p, pr or "", effective_model))
                raw = fn(path, req.prompt or "")
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"inference failed: {exc}")

            payload = normalize_response(raw, width, height)
            if "model" not in payload:
                payload["model"] = effective_model
            return JSONResponse(payload)

    return app


def serve() -> None:  # called: python -m src.app
    import uvicorn  # type: ignore

    host = os.environ.get("IRIS_SIDECAR_HOST", DEFAULT_HOST)
    port = int(os.environ.get("IRIS_SIDECAR_PORT", str(DEFAULT_PORT)))
    app = build_app()
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    serve()
