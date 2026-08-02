"""Dev alias: re-export package contract so scripts/tests can `from src.contract import ...`."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))  # ensure src/ on path

from florence_sidecar.contract import *  # noqa: E402,F401,F403
from florence_sidecar.contract import MAX_IMAGE_BYTES, clamp_bbox, normalize_response, normalize_score  # noqa: E402,F401
