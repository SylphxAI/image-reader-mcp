"""Pure contract logic for the Iris L2 semantics sidecar (stdlib only).

Kept dependency-free so the conformance test runs in any CI without FastAPI,
PIL, or torch. The FastAPI server in app.py wraps these functions.
"""

from __future__ import annotations

from typing import Any, Optional

MAX_IMAGE_BYTES = 16 * 1024 * 1024


def clamp_bbox(bbox: Any, width: int, height: int) -> Optional[dict[str, int]]:
    if not isinstance(bbox, dict):
        return None
    try:
        x = int(bbox.get("x", 0))
        y = int(bbox.get("y", 0))
        w = int(bbox.get("width", bbox.get("w", 0)))
        h = int(bbox.get("height", bbox.get("h", 0)))
    except (TypeError, ValueError):
        return None
    x = max(0, min(width, x))
    y = max(0, min(height, y))
    w = max(1, min(width - x, w))
    h = max(1, min(height - y, h))
    return {"x": x, "y": y, "width": w, "height": h}


def normalize_score(score: Any) -> Optional[float]:
    if score is None:
        return None
    try:
        f = float(score)
    except (TypeError, ValueError):
        return None
    return max(0.0, min(1.0, f / 100.0 if f > 1 else f))


def normalize_response(  # noqa: C901
    raw: dict[str, Any],
    width: int,
    height: int,
) -> dict[str, Any]:
    objects: list[dict[str, Any]] = []
    warnings: list[str] = []
    raw_objects = raw.get("objects")
    if isinstance(raw_objects, list):
        for item in raw_objects[:64]:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", "")).strip()
            if not label:
                continue
            bbox = clamp_bbox(item.get("bbox"), width, height)
            if item.get("bbox") is not None and bbox is None:
                warnings.append(f"dropped invalid bbox for {label}")
            score = normalize_score(item.get("score", item.get("confidence")))
            obj: dict[str, Any] = {
                "id": str(item.get("id") or f"obj_{len(objects) + 1}"),
                "label": label[:128],
            }
            category = item.get("category")
            if category:
                obj["category"] = str(category)[:64]
            if bbox is not None:
                obj["bbox"] = bbox
            if score is not None:
                obj["score"] = score
            if "mask_ref" in item:
                obj["mask_ref"] = item["mask_ref"]
            objects.append(obj)

    response: dict[str, Any] = {"objects": objects}
    caption = raw.get("caption")
    if caption:
        response["caption"] = str(caption)[:4000]
    model = raw.get("model")
    if model:
        response["model"] = str(model)
    response["warnings"] = warnings
    return response
