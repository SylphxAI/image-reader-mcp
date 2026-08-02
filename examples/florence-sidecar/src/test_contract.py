"""Contract conformance for the Iris L2 semantics sidecar.

Pure stdlib test of src.contract — runs in any CI with no optional deps.
(fastapi/PIL server smoke is dev-only; see test_contract_server.py.)
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.contract import normalize_response, clamp_bbox, normalize_score, MAX_IMAGE_BYTES  # noqa: E402


class ContractTest(unittest.TestCase):
    def test_clamp_bbox(self):
        self.assertEqual(clamp_bbox({"x": 10, "y": 20, "width": 30, "height": 40}, 200, 200),
                         {"x": 10, "y": 20, "width": 30, "height": 40})
        # clamps to image bounds
        b = clamp_bbox({"x": 190, "y": 190, "width": 50, "height": 50}, 200, 200)
        self.assertEqual(b["width"], 10)
        self.assertIsNone(clamp_bbox("nope", 200, 200))

    def test_score(self):
        self.assertAlmostEqual(normalize_score(0.91), 0.91)
        self.assertAlmostEqual(normalize_score(88), 0.88)   # percent path
        self.assertAlmostEqual(normalize_score(-5), 0.0)
        self.assertIsNone(normalize_score("x"))

    def test_normalize_cleans_invalid(self):
        out = normalize_response({
            "caption": "a person walking a dog",
            "model": "florence2-mock",
            "objects": [
                {"label": "person", "bbox": {"x": 10, "y": 20, "width": 30, "height": 40}, "score": 0.91},
                {"label": "dog", "bbox": {"x": 50, "y": 60, "width": 25, "height": 20}, "score": 88},
                {"label": "broken", "bbox": "nope", "score": -5},
            ],
        }, 200, 200)
        self.assertEqual(out["caption"], "a person walking a dog")
        self.assertEqual(out["model"], "florence2-mock")
        self.assertEqual(len(out["objects"]), 3)  # invalid-bbox object retained without bbox
        self.assertNotIn("bbox", out["objects"][2])  # broken object has no bbox
        self.assertEqual(out["objects"][0]["bbox"], {"x": 10, "y": 20, "width": 30, "height": 40})
        self.assertAlmostEqual(out["objects"][0]["score"], 0.91)
        self.assertAlmostEqual(out["objects"][1]["score"], 0.88)
        self.assertIn("dropped invalid bbox for broken", out["warnings"])

    def test_size_bound(self):
        # bound is a constant contract guard
        self.assertGreater(MAX_IMAGE_BYTES, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
