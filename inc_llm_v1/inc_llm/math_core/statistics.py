"""Precision statistics for incllmv2 adaptive tuning and meta-learning.

Provides rigorous statistical mathematics replacing simple rolling averages:

- Bayesian updating: Beta distribution posterior for skill effectiveness
- Shannon entropy: H(X) = -Σ p(x) * log2(p(x)) — for temperature optimization
- KL divergence: D(P||Q) = Σ p * log(p/q) — for detecting distribution shifts
- Confidence intervals: t-distribution based CI for speed skill measurements
- EWMA: Exponentially weighted moving average for adaptive parameter tracking
- R²: Coefficient of determination for model fit quality

All formulas are exact mathematics — no heuristics.
Zero-slowdown: O(n) where n is sample count (typically <100).
"""

from __future__ import annotations

import logging
import math
from typing import Any

logger = logging.getLogger(__name__)


class PrecisionStatistics:
    """Rigorous statistical math for adaptive tuning and meta-learning.

    All methods are pure functions — no state, no side effects.
    Zero-slowdown: O(n) where n is small (typically <100 samples).
    """

    @staticmethod
    def mean(values: list[float]) -> float:
        """Arithmetic mean: Σx / n."""
        if not values:
            return 0.0
        return sum(values) / len(values)

    @staticmethod
    def variance(values: list[float]) -> float:
        """Population variance: Σ(x - μ)² / n."""
        if len(values) < 2:
            return 0.0
        avg = PrecisionStatistics.mean(values)
        return sum((x - avg) ** 2 for x in values) / len(values)

    @staticmethod
    def std_dev(values: list[float]) -> float:
        """Standard deviation: sqrt(variance)."""
        return math.sqrt(PrecisionStatistics.variance(values))

    @staticmethod
    def standard_error(values: list[float]) -> float:
        """Standard error of the mean: σ / sqrt(n).

        Used for confidence intervals on speed skill measurements.
        """
        n = len(values)
        if n < 2:
            return 0.0
        return PrecisionStatistics.std_dev(values) / math.sqrt(n)

    @staticmethod
    def confidence_interval(
        values: list[float], confidence: float = 0.95,
    ) -> tuple[float, float]:
        """Confidence interval using t-distribution.

        Formula: CI = mean ± t_(α/2, n-1) * SE
        where SE = std / sqrt(n)

        Uses t-distribution critical values for small samples.
        Falls back to z-values for large samples (n > 30).

        Returns (lower_bound, upper_bound).
        """
        n = len(values)
        if n < 2:
            avg = PrecisionStatistics.mean(values)
            return (avg, avg)

        avg = PrecisionStatistics.mean(values)
        se = PrecisionStatistics.standard_error(values)
        if se == 0:
            return (avg, avg)

        # t-distribution critical values for 95% and 99% confidence
        # For n > 30, t ≈ z (normal distribution)
        t_values_95: dict[int, float] = {
            2: 12.706, 3: 4.303, 4: 3.182, 5: 2.776, 6: 2.571,
            7: 2.447, 8: 2.365, 9: 2.306, 10: 2.262, 15: 2.145,
            20: 2.093, 25: 2.064, 30: 2.045, 50: 2.010, 100: 1.984,
        }
        t_values_99: dict[int, float] = {
            2: 63.657, 3: 9.925, 4: 5.841, 5: 4.604, 6: 4.032,
            7: 3.707, 8: 3.499, 9: 3.355, 10: 3.250, 15: 2.977,
            20: 2.861, 25: 2.797, 30: 2.756, 50: 2.678, 100: 2.626,
        }

        if confidence >= 0.99:
            t_table = t_values_99
            default_t = 2.576  # z-value for 99%
        else:
            t_table = t_values_95
            default_t = 1.96  # z-value for 95%

        # Find closest t-value
        dof = n - 1
        if dof in t_table:
            t_crit = t_table[dof]
        elif dof > 100:
            t_crit = default_t
        else:
            # Interpolate between nearest entries
            keys = sorted(t_table.keys())
            lower_key = max(k for k in keys if k <= dof)
            upper_key = min(k for k in keys if k >= dof)
            if lower_key == upper_key:
                t_crit = t_table[lower_key]
            else:
                ratio = (dof - lower_key) / (upper_key - lower_key)
                t_crit = t_table[lower_key] + ratio * (t_table[upper_key] - t_table[lower_key])

        margin = t_crit * se
        return (round(avg - margin, 4), round(avg + margin, 4))

    @staticmethod
    def bayesian_update(
        prior: float,
        evidence: list[bool],
        alpha: float = 1.0,
        beta: float = 1.0,
    ) -> float:
        """Bayesian posterior using Beta distribution.

        Prior: Beta(α, β) → posterior: Beta(α + successes, β + failures)

        Formula: posterior_mean = (α + successes) / (α + β + n)
        where n = total evidence count, successes = True count

        This replaces simple success_rate = successes / total with a
        Bayesian estimate that starts from a prior and updates with evidence.
        The prior (α=1, β=1) is uniform — no initial bias.

        Example: prior=0.5, evidence=[True, True, False, True]
          posterior = (1 + 3) / (1 + 1 + 4) = 4/6 = 0.667
          vs simple average: 3/4 = 0.75 (overconfident with few samples)
        """
        if not evidence:
            return prior
        successes = sum(1 for e in evidence if e)
        failures = len(evidence) - successes
        posterior_alpha = alpha + successes
        posterior_beta = beta + failures
        return round(posterior_alpha / (posterior_alpha + posterior_beta), 4)

    @staticmethod
    def entropy(probs: list[float]) -> float:
        """Shannon entropy: H(X) = -Σ p(x) * log2(p(x)).

        Measures uncertainty in a probability distribution.
        Higher entropy → more uncertainty → higher temperature for LLM.

        Example: [0.5, 0.5] → H = 1.0 bit (maximum uncertainty for 2 outcomes)
                 [1.0, 0.0] → H = 0.0 bits (no uncertainty)
                 [0.25, 0.25, 0.25, 0.25] → H = 2.0 bits
        """
        h = 0.0
        for p in probs:
            if p > 0:
                h -= p * math.log2(p)
        return round(h, 4)

    @staticmethod
    def kl_divergence(p: list[float], q: list[float]) -> float:
        """Kullback-Leibler divergence: D(P||Q) = Σ p * log(p/q).

        Measures how much distribution Q differs from P.
        Used to detect when skill effectiveness distribution shifts.

        D(P||Q) = 0 when P = Q (identical distributions).
        Higher values → more divergence → distribution has shifted.

        Example: p=[0.5, 0.5], q=[0.9, 0.1] → D = 0.5*log(0.5/0.9) + 0.5*log(0.5/0.1) ≈ 0.511
        """
        if len(p) != len(q):
            return float("inf")
        divergence = 0.0
        for pi, qi in zip(p, q):
            if pi > 0 and qi > 0:
                divergence += pi * math.log(pi / qi)
            elif pi > 0 and qi == 0:
                divergence += float("inf")
        return round(divergence, 4)

    @staticmethod
    def optimal_temperature_from_entropy(
        entropy: float, max_entropy: float = 10.0, max_temp: float = 1.0,
    ) -> float:
        """Compute optimal LLM temperature from output entropy.

        Formula: temperature = (entropy / max_entropy) * max_temp
        Clamped to [0.1, max_temp].

        Higher entropy (more uncertain output) → higher temperature (more creative).
        Lower entropy (more certain output) → lower temperature (more deterministic).

        This replaces fixed temperature with entropy-aware adjustment.
        """
        if max_entropy <= 0:
            return 0.7
        ratio = min(1.0, entropy / max_entropy)
        temp = ratio * max_temp
        return round(max(0.1, min(max_temp, temp)), 3)

    @staticmethod
    def moving_average(values: list[float], window: int) -> list[float]:
        """Simple moving average with fixed window size.

        Formula: MA_t = (Σ values[t-window+1 : t+1]) / window

        Returns list of moving averages (shorter than input by window-1).
        """
        if window <= 0 or len(values) < window:
            return []
        result: list[float] = []
        for i in range(len(values) - window + 1):
            avg = sum(values[i:i + window]) / window
            result.append(round(avg, 4))
        return result

    @staticmethod
    def exponential_weighted_moving_average(
        values: list[float], alpha: float = 0.3,
    ) -> list[float]:
        """Exponentially weighted moving average (EWMA).

        Formula: EWMA_t = α * value_t + (1 - α) * EWMA_(t-1)
        where α ∈ (0, 1] controls how quickly old data is forgotten.

        α=1.0 → no smoothing (just the latest value)
        α=0.1 → heavy smoothing (slow to react, but stable)
        α=0.3 → moderate (default, good balance)

        Used for adaptive parameter tuning — replaces simple rolling average
        with a weighted average that prioritizes recent observations.
        """
        if not values:
            return []
        alpha = max(0.01, min(1.0, alpha))
        result: list[float] = [values[0]]
        for i in range(1, len(values)):
            ewma = alpha * values[i] + (1 - alpha) * result[-1]
            result.append(round(ewma, 4))
        return result

    @staticmethod
    def coefficient_of_determination(
        actual: list[float], predicted: list[float],
    ) -> float:
        """R² — coefficient of determination (model fit quality).

        Formula: R² = 1 - SS_res / SS_tot
        where SS_res = Σ(y - ŷ)², SS_tot = Σ(y - ȳ)²

        R² = 1.0 → perfect fit
        R² = 0.0 → no better than mean
        R² < 0 → worse than mean

        Used to evaluate how well speed skill parameters predict actual performance.
        """
        if len(actual) != len(predicted) or len(actual) < 2:
            return 0.0
        mean_actual = PrecisionStatistics.mean(actual)
        ss_res = sum((a - p) ** 2 for a, p in zip(actual, predicted))
        ss_tot = sum((a - mean_actual) ** 2 for a in actual)
        if ss_tot == 0:
            return 1.0 if ss_res == 0 else 0.0
        return round(1.0 - ss_res / ss_tot, 4)

    @staticmethod
    def percentile(values: list[float], pct: float) -> float:
        """Percentile using linear interpolation.

        Formula: index = (pct/100) * (n-1)
        If index is integer: values[index]
        Else: linear interpolation between adjacent values

        Example: percentile([1,2,3,4,5], 90) = 4.6
        """
        if not values:
            return 0.0
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        if n == 1:
            return sorted_vals[0]
        index = (pct / 100.0) * (n - 1)
        lower = int(math.floor(index))
        upper = int(math.ceil(index))
        if lower == upper:
            return sorted_vals[lower]
        frac = index - lower
        return round(sorted_vals[lower] + frac * (sorted_vals[upper] - sorted_vals[lower]), 4)

    @staticmethod
    def z_score(value: float, values: list[float]) -> float:
        """Z-score: (x - μ) / σ.

        Measures how many standard deviations a value is from the mean.
        Used for anomaly detection in response times.
        """
        if len(values) < 2:
            return 0.0
        avg = PrecisionStatistics.mean(values)
        std = PrecisionStatistics.std_dev(values)
        if std == 0:
            return 0.0
        return round((value - avg) / std, 4)

    @staticmethod
    def effect_size(
        group1: list[float], group2: list[float],
    ) -> float:
        """Cohen's d effect size between two groups.

        Formula: d = (μ1 - μ2) / pooled_std
        where pooled_std = sqrt((σ1² + σ2²) / 2)

        Used to measure if a new parameter set is significantly different
        from the previous one.

        d = 0.2 → small effect
        d = 0.5 → medium effect
        d = 0.8 → large effect
        """
        if len(group1) < 2 or len(group2) < 2:
            return 0.0
        mean1 = PrecisionStatistics.mean(group1)
        mean2 = PrecisionStatistics.mean(group2)
        var1 = PrecisionStatistics.variance(group1)
        var2 = PrecisionStatistics.variance(group2)
        pooled_std = math.sqrt((var1 + var2) / 2.0)
        if pooled_std == 0:
            return 0.0
        return round((mean1 - mean2) / pooled_std, 4)

    @staticmethod
    def adaptive_alpha(
        sample_count: int, min_alpha: float = 0.1, max_alpha: float = 0.5,
    ) -> float:
        """Compute adaptive EWMA alpha based on sample count.

        Formula: alpha = clamp(1 / sqrt(n), min_alpha, max_alpha)

        With few samples: high alpha (react quickly to new data)
        With many samples: low alpha (stable, proven average)

        This replaces fixed alpha with sample-count-aware adaptation.
        """
        if sample_count <= 0:
            return max_alpha
        alpha = 1.0 / math.sqrt(sample_count)
        return round(max(min_alpha, min(max_alpha, alpha)), 4)
