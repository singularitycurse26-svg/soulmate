"""Geometry mathematics for incllmv2 AI Gaming MPC companion.

Provides vector, matrix, quaternion, and game physics math for the AI Gaming
companion's spatial reasoning, game decisions, and smooth animations.

Vector operations (Vec3):
  dot(a, b) = Σ a_i * b_i
  cross(a, b) = (a_y*b_z - a_z*b_y, a_z*b_x - a_x*b_z, a_x*b_y - a_y*b_x)
  magnitude(v) = sqrt(dot(v, v))
  normalize(v) = v / magnitude(v)
  distance(a, b) = magnitude(a - b)
  angle_between(a, b) = acos(dot(a,b) / (|a| * |b|))
  lerp(a, b, t) = a + (b - a) * t
  slerp(a, b, t) = spherical linear interpolation for smooth rotations

Matrix operations (4x4):
  identity, translate, scale, rotate_x/y/z, multiply, transform_point, look_at
  Used for transform composition: M = T * R * S

Quaternion operations:
  from_axis_angle, from_euler, multiply, slerp, to_matrix
  Quaternions avoid gimbal lock and enable smooth rotation interpolation.
  q = (w, x, y, z) where w = cos(θ/2), (x,y,z) = sin(θ/2) * axis

Game physics:
  collision_sphere_sphere, collision_aabb, ray_sphere_intersect
  trajectory, field_of_view, spatial_distance_3d, spatial_distance_manhattan

Why geometry is needed for AI Gaming:
  - Companion reasons about game world positions, distances, spatial relations
  - Game decisions (move, attack, retreat) require geometric understanding
  - Smooth companion animations need quaternion slerp, not linear interpolation
  - Collision detection for autonomous game playing
  - The LLM generates game decisions — geometry math gives it spatial reasoning

All formulas are exact mathematics.
Zero-slowdown: O(1) for all operations.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Vec3:
    """3D vector — position, direction, velocity in game world space."""

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def __add__(self, other: "Vec3") -> "Vec3":
        return Vec3(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other: "Vec3") -> "Vec3":
        return Vec3(self.x - other.x, self.y - other.y, self.z - other.z)

    def __mul__(self, scalar: float) -> "Vec3":
        return Vec3(self.x * scalar, self.y * scalar, self.z * scalar)

    def __truediv__(self, scalar: float) -> "Vec3":
        if scalar == 0:
            return Vec3(0, 0, 0)
        return Vec3(self.x / scalar, self.y / scalar, self.z / scalar)

    def __neg__(self) -> "Vec3":
        return Vec3(-self.x, -self.y, -self.z)

    def as_tuple(self) -> tuple[float, float, float]:
        return (self.x, self.y, self.z)

    def as_list(self) -> list[float]:
        return [self.x, self.y, self.z]


@dataclass
class Quat:
    """Quaternion — rotation representation without gimbal lock.

    q = (w, x, y, z) where w = cos(θ/2), (x,y,z) = sin(θ/2) * axis
    Unit quaternion: w² + x² + y² + z² = 1
    """

    w: float = 1.0
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def as_tuple(self) -> tuple[float, float, float, float]:
        return (self.w, self.x, self.y, self.z)

    def as_list(self) -> list[float]:
        return [self.w, self.x, self.y, self.z]


class Mat4:
    """4x4 transformation matrix — stored row-major.

    Used for translation, rotation, scaling, and view/projection transforms.
    Standard graphics convention: column vectors, M * v.
    """

    def __init__(self, data: list[list[float]] | None = None) -> None:
        if data:
            self.m = [row[:] for row in data]
        else:
            self.m = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]

    @staticmethod
    def identity() -> "Mat4":
        return Mat4()

    @staticmethod
    def translate(x: float, y: float, z: float) -> "Mat4":
        return Mat4([
            [1, 0, 0, x],
            [0, 1, 0, y],
            [0, 0, 1, z],
            [0, 0, 0, 1],
        ])

    @staticmethod
    def scale(x: float, y: float, z: float) -> "Mat4":
        return Mat4([
            [x, 0, 0, 0],
            [0, y, 0, 0],
            [0, 0, z, 0],
            [0, 0, 0, 1],
        ])

    @staticmethod
    def rotate_x(angle_rad: float) -> "Mat4":
        c, s = math.cos(angle_rad), math.sin(angle_rad)
        return Mat4([
            [1, 0, 0, 0],
            [0, c, -s, 0],
            [0, s, c, 0],
            [0, 0, 0, 1],
        ])

    @staticmethod
    def rotate_y(angle_rad: float) -> "Mat4":
        c, s = math.cos(angle_rad), math.sin(angle_rad)
        return Mat4([
            [c, 0, s, 0],
            [0, 1, 0, 0],
            [-s, 0, c, 0],
            [0, 0, 0, 1],
        ])

    @staticmethod
    def rotate_z(angle_rad: float) -> "Mat4":
        c, s = math.cos(angle_rad), math.sin(angle_rad)
        return Mat4([
            [c, -s, 0, 0],
            [s, c, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
        ])

    @staticmethod
    def multiply(m1: "Mat4", m2: "Mat4") -> "Mat4":
        """Matrix multiplication: result = m1 * m2."""
        result = Mat4()
        for i in range(4):
            for j in range(4):
                result.m[i][j] = sum(m1.m[i][k] * m2.m[k][j] for k in range(4))
        return result

    @staticmethod
    def transform_point(matrix: "Mat4", point: Vec3) -> Vec3:
        """Apply 4x4 transform to a 3D point (w=1)."""
        m = matrix.m
        x = m[0][0] * point.x + m[0][1] * point.y + m[0][2] * point.z + m[0][3]
        y = m[1][0] * point.x + m[1][1] * point.y + m[1][2] * point.z + m[1][3]
        z = m[2][0] * point.x + m[2][1] * point.y + m[2][2] * point.z + m[2][3]
        w = m[3][0] * point.x + m[3][1] * point.y + m[3][2] * point.z + m[3][3]
        if w != 0 and w != 1:
            return Vec3(x / w, y / w, z / w)
        return Vec3(x, y, z)

    @staticmethod
    def look_at(eye: Vec3, target: Vec3, up: Vec3) -> "Mat4":
        """Camera view matrix — look from eye toward target with up vector."""
        forward = GeometryMath.normalize(target - eye)
        right = GeometryMath.normalize(GeometryMath.cross(forward, up))
        new_up = GeometryMath.cross(right, forward)

        return Mat4([
            [right.x, right.y, right.z, -GeometryMath.dot(right, eye)],
            [new_up.x, new_up.y, new_up.z, -GeometryMath.dot(new_up, eye)],
            [-forward.x, -forward.y, -forward.z, GeometryMath.dot(forward, eye)],
            [0, 0, 0, 1],
        ])

    def as_list(self) -> list[list[float]]:
        return [row[:] for row in self.m]


class GeometryMath:
    """Geometry and game physics math for AI Gaming MPC companion.

    All methods are pure mathematics — O(1).
    Zero-slowdown: used during game decision generation, not during inference.
    """

    # --- Vector operations ---

    @staticmethod
    def dot(a: Vec3, b: Vec3) -> float:
        """Dot product: a · b = a_x*b_x + a_y*b_y + a_z*b_z."""
        return a.x * b.x + a.y * b.y + a.z * b.z

    @staticmethod
    def cross(a: Vec3, b: Vec3) -> Vec3:
        """Cross product: a × b = (a_y*b_z - a_z*b_y, a_z*b_x - a_x*b_z, a_x*b_y - a_y*b_x)."""
        return Vec3(
            a.y * b.z - a.z * b.y,
            a.z * b.x - a.x * b.z,
            a.x * b.y - a.y * b.x,
        )

    @staticmethod
    def magnitude(v: Vec3) -> float:
        """Vector magnitude: |v| = sqrt(v · v)."""
        return math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2)

    @staticmethod
    def normalize(v: Vec3) -> Vec3:
        """Unit vector: v / |v|."""
        mag = GeometryMath.magnitude(v)
        if mag == 0:
            return Vec3(0, 0, 0)
        return v / mag

    @staticmethod
    def distance(a: Vec3, b: Vec3) -> float:
        """Euclidean distance: |a - b|."""
        return GeometryMath.magnitude(a - b)

    @staticmethod
    def distance_squared(a: Vec3, b: Vec3) -> float:
        """Squared distance (avoids sqrt for comparison): |a - b|²."""
        d = a - b
        return d.x ** 2 + d.y ** 2 + d.z ** 2

    @staticmethod
    def angle_between(a: Vec3, b: Vec3) -> float:
        """Angle between vectors in radians: acos(a · b / (|a| * |b|))."""
        mag_a = GeometryMath.magnitude(a)
        mag_b = GeometryMath.magnitude(b)
        if mag_a == 0 or mag_b == 0:
            return 0.0
        cos_angle = GeometryMath.dot(a, b) / (mag_a * mag_b)
        cos_angle = max(-1.0, min(1.0, cos_angle))
        return math.acos(cos_angle)

    @staticmethod
    def lerp(a: Vec3, b: Vec3, t: float) -> Vec3:
        """Linear interpolation: a + (b - a) * t.

        Used for simple position interpolation.
        t=0 → a, t=1 → b.
        """
        t = max(0.0, min(1.0, t))
        return a + (b - a) * t

    @staticmethod
    def slerp(a: Vec3, b: Vec3, t: float) -> Vec3:
        """Spherical linear interpolation for direction vectors.

        Formula: slerp = (sin((1-t)*Ω) * a + sin(t*Ω) * b) / sin(Ω)
        where Ω = angle_between(a, b).

        Used for smooth rotation transitions — no sudden direction changes.
        t=0 → a, t=1 → b.
        """
        t = max(0.0, min(1.0, t))
        omega = GeometryMath.angle_between(a, b)
        if omega < 1e-6:
            return GeometryMath.lerp(a, b, t)
        sin_omega = math.sin(omega)
        factor_a = math.sin((1.0 - t) * omega) / sin_omega
        factor_b = math.sin(t * omega) / sin_omega
        return (a * factor_a) + (b * factor_b)

    # --- Quaternion operations ---

    @staticmethod
    def quat_from_axis_angle(axis: Vec3, angle_rad: float) -> Quat:
        """Create quaternion from axis-angle.

        q = (cos(θ/2), sin(θ/2) * axis)
        """
        half_angle = angle_rad / 2.0
        normalized_axis = GeometryMath.normalize(axis)
        sin_half = math.sin(half_angle)
        return Quat(
            w=math.cos(half_angle),
            x=normalized_axis.x * sin_half,
            y=normalized_axis.y * sin_half,
            z=normalized_axis.z * sin_half,
        )

    @staticmethod
    def quat_from_euler(pitch: float, yaw: float, roll: float) -> Quat:
        """Create quaternion from Euler angles (radians).

        Applies rotation in ZYX order (roll, pitch, yaw).
        """
        cy = math.cos(yaw / 2)
        sy = math.sin(yaw / 2)
        cp = math.cos(pitch / 2)
        sp = math.sin(pitch / 2)
        cr = math.cos(roll / 2)
        sr = math.sin(roll / 2)
        return Quat(
            w=cr * cp * cy + sr * sp * sy,
            x=sr * cp * cy - cr * sp * sy,
            y=cr * sp * cy + sr * cp * sy,
            z=cr * cp * sy - sr * sp * cy,
        )

    @staticmethod
    def quat_multiply(q1: Quat, q2: Quat) -> Quat:
        """Hamilton product: compose two rotations.

        q1 * q2 = (w1*w2 - v1·v2, w1*v2 + w2*v1 + v1×v2)
        """
        w = q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z
        x = q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y
        y = q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x
        z = q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w
        return Quat(w=w, x=x, y=y, z=z)

    @staticmethod
    def quat_slerp(q1: Quat, q2: Quat, t: float) -> Quat:
        """Spherical linear interpolation between quaternions.

        Smooth rotation interpolation — no gimbal lock.
        Formula: slerp(q1, q2, t) = q1 * (q1^-1 * q2)^t

        Used for smooth companion animation transitions.
        t=0 → q1, t=1 → q2.
        """
        t = max(0.0, min(1.0, t))
        dot = q1.w * q2.w + q1.x * q2.x + q1.y * q2.y + q1.z * q2.z

        # Choose shortest path
        if dot < 0:
            q2 = Quat(-q2.w, -q2.x, -q2.y, -q2.z)
            dot = -dot

        # If very close, use linear interpolation
        if dot > 0.9995:
            result = Quat(
                w=q1.w + t * (q2.w - q1.w),
                x=q1.x + t * (q2.x - q1.x),
                y=q1.y + t * (q2.y - q1.y),
                z=q1.z + t * (q2.z - q1.z),
            )
            # Normalize
            mag = math.sqrt(result.w ** 2 + result.x ** 2 + result.y ** 2 + result.z ** 2)
            if mag > 0:
                return Quat(
                    w=result.w / mag, x=result.x / mag,
                    y=result.y / mag, z=result.z / mag,
                )
            return result

        theta = math.acos(max(-1.0, min(1.0, dot)))
        sin_theta = math.sin(theta)
        factor_a = math.sin((1.0 - t) * theta) / sin_theta
        factor_b = math.sin(t * theta) / sin_theta
        return Quat(
            w=factor_a * q1.w + factor_b * q2.w,
            x=factor_a * q1.x + factor_b * q2.x,
            y=factor_a * q1.y + factor_b * q2.y,
            z=factor_a * q1.z + factor_b * q2.z,
        )

    @staticmethod
    def quat_to_matrix(q: Quat) -> Mat4:
        """Convert quaternion to 4x4 rotation matrix.

        Formula (for unit quaternion):
          R = [[1-2(y²+z²), 2(xy-wz), 2(xz+wy), 0],
               [2(xy+wz), 1-2(x²+z²), 2(yz-wx), 0],
               [2(xz-wy), 2(yz+wx), 1-2(x²+y²), 0],
               [0, 0, 0, 1]]
        """
        xx, yy, zz = q.x ** 2, q.y ** 2, q.z ** 2
        xy, xz, yz = q.x * q.y, q.x * q.z, q.y * q.z
        wx, wy, wz = q.w * q.x, q.w * q.y, q.w * q.z
        return Mat4([
            [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), 0],
            [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), 0],
            [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy), 0],
            [0, 0, 0, 1],
        ])

    # --- Game physics ---

    @staticmethod
    def collision_sphere_sphere(
        pos1: Vec3, r1: float, pos2: Vec3, r2: float,
    ) -> bool:
        """Sphere-sphere collision detection.

        Collision if distance(pos1, pos2) < r1 + r2.
        Uses squared distance to avoid sqrt.
        """
        dist_sq = GeometryMath.distance_squared(pos1, pos2)
        radius_sum = r1 + r2
        return dist_sq < radius_sum ** 2

    @staticmethod
    def collision_aabb(
        center1: Vec3, size1: Vec3, center2: Vec3, size2: Vec3,
    ) -> bool:
        """Axis-aligned bounding box collision detection.

        Collision if overlap on all 3 axes:
          |c1_x - c2_x| < (s1_x + s2_x) / 2 AND
          |c1_y - c2_y| < (s1_y + s2_y) / 2 AND
          |c1_z - c2_z| < (s1_z + s2_z) / 2
        """
        dx = abs(center1.x - center2.x)
        dy = abs(center1.y - center2.y)
        dz = abs(center1.z - center2.z)
        return (
            dx < (size1.x + size2.x) / 2
            and dy < (size1.y + size2.y) / 2
            and dz < (size1.z + size2.z) / 2
        )

    @staticmethod
    def ray_sphere_intersect(
        ray_origin: Vec3, ray_dir: Vec3,
        sphere_center: Vec3, sphere_radius: float,
    ) -> float | None:
        """Ray-sphere intersection — returns distance to hit or None.

        Uses quadratic equation:
          |d|²t² + 2(o-c)·d * t + |o-c|² - r² = 0
          discriminant = b² - 4ac
          If discriminant < 0: no hit
          If discriminant >= 0: t = (-b - sqrt(disc)) / 2a (nearest hit)
        """
        d = GeometryMath.normalize(ray_dir)
        oc = ray_origin - sphere_center
        a = GeometryMath.dot(d, d)
        b = 2 * GeometryMath.dot(oc, d)
        c = GeometryMath.dot(oc, oc) - sphere_radius ** 2
        discriminant = b ** 2 - 4 * a * c
        if discriminant < 0:
            return None
        sqrt_disc = math.sqrt(discriminant)
        t1 = (-b - sqrt_disc) / (2 * a)
        t2 = (-b + sqrt_disc) / (2 * a)
        if t1 >= 0:
            return t1
        if t2 >= 0:
            return t2
        return None

    @staticmethod
    def trajectory(
        initial_pos: Vec3, velocity: Vec3,
        gravity: float, time_s: float,
    ) -> Vec3:
        """Projectile trajectory: position at time t.

        Formula: p(t) = p0 + v*t + 0.5*g*t²
        where g = (0, -gravity, 0) for standard gravity.
        """
        return Vec3(
            x=initial_pos.x + velocity.x * time_s,
            y=initial_pos.y + velocity.y * time_s - 0.5 * gravity * time_s ** 2,
            z=initial_pos.z + velocity.z * time_s,
        )

    @staticmethod
    def field_of_view(
        camera_pos: Vec3, camera_dir: Vec3,
        fov_deg: float, target_pos: Vec3,
    ) -> bool:
        """Check if a target is within the camera's field of view.

        Formula: angle_between(camera_dir, target - camera_pos) < fov/2
        """
        to_target = GeometryMath.normalize(target_pos - camera_pos)
        angle = GeometryMath.angle_between(
            GeometryMath.normalize(camera_dir), to_target,
        )
        return angle < math.radians(fov_deg / 2.0)

    @staticmethod
    def spatial_distance_3d(a: Vec3, b: Vec3) -> float:
        """Euclidean distance in 3D space: sqrt(Σ(a_i - b_i)²)."""
        return GeometryMath.distance(a, b)

    @staticmethod
    def spatial_distance_manhattan(a: Vec3, b: Vec3) -> float:
        """Manhattan distance: Σ|a_i - b_i| — used for grid-based games."""
        return abs(a.x - b.x) + abs(a.y - b.y) + abs(a.z - b.z)

    @staticmethod
    def spatial_distance_chebyshev(a: Vec3, b: Vec3) -> float:
        """Chebyshev distance: max(|a_i - b_i|) — used for chess-like games."""
        return max(abs(a.x - b.x), abs(a.y - b.y), abs(a.z - b.z))

    # --- Companion emotional geometry ---

    @staticmethod
    def emotional_slerp(
        current_mood: float, target_mood: float, t: float,
    ) -> float:
        """Smooth emotional state transition using spherical interpolation.

        Maps mood [0, 1] to a point on a unit circle and uses slerp
        for smooth, non-linear emotional transitions.

        Formula: mood(t) = current + (target - current) * smooth(t)
        where smooth(t) = 3t² - 2t³ (Hermite smoothstep)
        """
        t = max(0.0, min(1.0, t))
        smooth_t = t * t * (3.0 - 2.0 * t)  # Hermite smoothstep
        return current_mood + (target_mood - current_mood) * smooth_t

    @staticmethod
    def emotional_oscillation(
        base_mood: float, amplitude: float,
        frequency: float, time_s: float,
    ) -> float:
        """Oscillating emotional state for dynamic companion behavior.

        Formula: mood(t) = base + amplitude * sin(2π * f * t)
        Clamped to [0.1, 1.0] to keep mood in valid range.

        Used for companion personality — moods naturally fluctuate.
        """
        mood = base_mood + amplitude * math.sin(2 * math.pi * frequency * time_s)
        return max(0.1, min(1.0, mood))

    # --- Game world helpers ---

    @staticmethod
    def compute_game_decision_context(
        companion_pos: Vec3,
        target_pos: Vec3,
        obstacles: list[tuple[Vec3, float]],  # (position, radius)
        fov_deg: float = 90.0,
    ) -> dict[str, Any]:
        """Compute spatial context for a game decision.

        Returns distance, angle, visibility, obstacle count, nearest obstacle,
        and recommended action — all from pure geometry math.

        This gives the LLM spatial reasoning when making game decisions.
        """
        direction = target_pos - companion_pos
        distance = GeometryMath.magnitude(direction)
        normalized_dir = GeometryMath.normalize(direction)

        # Check obstacles in path
        obstacles_in_path: list[tuple[float, Vec3, float]] = []
        for obs_pos, obs_radius in obstacles:
            # Check if obstacle is roughly between companion and target
            to_obstacle = obs_pos - companion_pos
            proj = GeometryMath.dot(to_obstacle, normalized_dir)
            if 0 < proj < distance:
                # Perpendicular distance from obstacle to ray
                closest_point = companion_pos + (normalized_dir * proj)
                perp_dist = GeometryMath.distance(obs_pos, closest_point)
                if perp_dist < obs_radius + 1.0:  # 1.0 = companion radius
                    obstacles_in_path.append((proj, obs_pos, obs_radius))

        # Check if target is visible (no obstacles blocking)
        visible = len(obstacles_in_path) == 0

        # Nearest obstacle
        nearest_obstacle_dist = float("inf")
        if obstacles_in_path:
            nearest_obstacle_dist = min(o[0] for o in obstacles_in_path)

        # Recommended action based on geometry
        if distance < 5.0 and visible:
            action = "interact"
        elif distance < 20.0 and visible:
            action = "approach"
        elif obstacles_in_path:
            action = "navigate_around"
        elif distance >= 50.0:
            action = "move_closer"
        else:
            action = "approach"

        return {
            "distance": round(distance, 2),
            "direction": [round(normalized_dir.x, 3), round(normalized_dir.y, 3), round(normalized_dir.z, 3)],
            "visible": visible,
            "obstacles_in_path": len(obstacles_in_path),
            "nearest_obstacle_distance": round(nearest_obstacle_dist, 2) if nearest_obstacle_dist != float("inf") else None,
            "recommended_action": action,
            "angle_to_target": round(math.degrees(GeometryMath.angle_between(
                Vec3(1, 0, 0), normalized_dir,
            )), 1),
        }
