"""Math core package for incllmv2.

Provides precision mathematics for the entire LLM harness:

- precision: Split-bit quantization, mixed-precision arithmetic, sub-byte
  weight format calculations (1.58-bit ternary, 2-bit, 4-bit, FP8, FP16).
- geometry: Vector, matrix, quaternion, and game physics math for the
  AI Gaming MPC companion (spatial reasoning, collision detection, trajectories).
- statistics: Bayesian updating, Shannon entropy, KL divergence, confidence
  intervals, EWMA — rigorous statistical math for adaptive tuning.

All functions are pure mathematics — O(1) or O(n) where n is small.
Zero-slowdown: called during parameter computation or post-turn analysis.
"""

from inc_llm.math_core.precision import SplitBitMath
from inc_llm.math_core.geometry import GeometryMath, Vec3, Mat4, Quat
from inc_llm.math_core.statistics import PrecisionStatistics

__all__ = [
    "SplitBitMath",
    "GeometryMath",
    "Vec3",
    "Mat4",
    "Quat",
    "PrecisionStatistics",
]
