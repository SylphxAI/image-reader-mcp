"""Serve the Iris L2 semantics sidecar (FastAPI)."""

from __future__ import annotations

import os

from typing import Any, Callable, Optional

from .contract import MAX_IMAGE_BYTES, normalize_response


def build_app(infer_fn: Optional[Callable[..., dict]] = None, model_name: Optional[str] = None) -> Any:
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel

    DEFAULT_MODEL = "microsoft/Florence-2-large"
    effective_model = model_name or os.getenv("IRIS_SIDECAR_MODEL", DEFAULT_MODEL)
    current_infer = infer_fn

    app = FastAPI(title="Iris L2 semantics sidecar", version="0.1.0")

    class SemanticsRequest(BaseModel):
        path: str
        mime: Optional[str] = None
        purpose: Optional[str] = None
        prompt: Optional[str] = None

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "model": effective_model}

    @app.post("/semantics")
    def semantics(req: SemanticsRequest) -> JSONResponse:
        from pathlib import Path
        import PIL.Image

        path = Path(req.path)
        if not path.is_file():
            raise HTTPException(status_code=500, detail=f"cannot read file {req.path}")
        if path.stat().st_size > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=500, detail="image too large for sidecar")
        try:
            img = PIL.Image.open(path).convert("RGB")
            width, height = img.size
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"not an image: {exc}")
        fn = current_infer or _default_infer(effective_model)
        try:
            raw = fn(path, req.prompt or "")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"inference failed: {exc}")
        payload = normalize_response(raw, width, height)
        payload.setdefault("model", effective_model)
        return JSONResponse(payload)

    return app


def _default_infer(model_name: str):
    from pathlib import Path

    def infer(path: Path, prompt: str) -> dict:
        from PIL import Image
        from transformers import AutoModelForCausalLM, AutoProcessor

        processor = AutoProcessor.from_pretrained(model_name, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(model_name, trust_remote_code=True)
        image = Image.open(path).convert("RGB")
        inputs = processor(text=prompt or "describe the objects", images=image, return_tensors="pt")
        generated = model.generate(**inputs, max_new_tokens=512)
        text = processor.batch_decode(generated, skip_special_tokens=True)[0]
        return {"caption": text, "model": model_name, "objects": []}

    return infer


def serve(host: str = "127.0.0.1", port: int = 8765) -> None:
    import uvicorn

    uvicorn.run(build_app(), host=host, port=port, log_level="info")
