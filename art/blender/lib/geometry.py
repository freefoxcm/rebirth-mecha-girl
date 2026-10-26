"""Parametric hard-surface geometry for the jet models.

The builders deliberately avoid booleans: every part is an explicit loft or
surface patch so the result is deterministic and exports cleanly to glTF.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Iterable, Sequence

import bmesh
import bpy
from mathutils import Vector

from blender_utils import (
    add_polyline,
    apply_modifiers,
    bevel,
    bm_to_object,
    create_mesh_object,
    finalize,
    mark_sharp_by_angle,
    shade_smooth,
    weighted_normal,
)


# --------------------------------------------------------------------------- #
# Fuselage
# --------------------------------------------------------------------------- #

@dataclass
class Station:
    y: float
    width: float
    top: float
    bottom: float
    z: float = 0.0


# Half profile from top centre to bottom centre, including a sharp chine.
# u = lateral fraction of width, v = vertical fraction (top height / bottom depth).
PROFILES = {
    'stealth': [
        (0.00, 1.00), (0.26, 0.965), (0.50, 0.86), (0.70, 0.65),
        (0.86, 0.38), (0.955, 0.14), (1.00, 0.00), (0.955, -0.18),
        (0.87, -0.42), (0.72, -0.65), (0.50, -0.84), (0.26, -0.965),
        (0.00, -1.00),
    ],
    'round': [
        (0.00, 1.00), (0.20, 0.985), (0.42, 0.93), (0.62, 0.80),
        (0.79, 0.58), (0.91, 0.31), (0.975, 0.10), (1.00, 0.00),
        (0.975, -0.10), (0.92, -0.28), (0.80, -0.55), (0.62, -0.79),
        (0.40, -0.93), (0.20, -0.985), (0.00, -1.00),
    ],
    'wide': [
        (0.00, 1.00), (0.28, 0.94), (0.54, 0.82), (0.76, 0.60),
        (0.91, 0.32), (0.985, 0.10), (1.00, 0.00), (0.985, -0.10),
        (0.93, -0.30), (0.82, -0.52), (0.64, -0.72), (0.40, -0.88),
        (0.18, -0.97), (0.00, -1.00),
    ],
    'dagger': [
        (0.00, 1.00), (0.22, 0.97), (0.45, 0.87), (0.65, 0.68),
        (0.82, 0.40), (0.94, 0.14), (1.00, 0.00), (0.95, -0.16),
        (0.85, -0.38), (0.70, -0.60), (0.48, -0.80), (0.24, -0.94),
        (0.00, -1.00),
    ],
    # Broad flat top, hard shoulder and a crisp chine: reads as a stealth
    # fighter rather than a tube with a round nose.
    'faceted': [
        (0.00, 1.00), (0.34, 0.985), (0.64, 0.92), (0.86, 0.68),
        (0.96, 0.34), (1.00, 0.00), (0.96, -0.30), (0.86, -0.58),
        (0.66, -0.82), (0.36, -0.955), (0.00, -1.00),
    ],
}


def _ring(profile: Sequence[tuple[float, float]]) -> list[tuple[float, float]]:
    pts = list(profile)
    for u, v in reversed(profile[1:-1]):
        pts.append((-u, v))
    return pts


def _station_ring(station: Station, profile: Sequence[tuple[float, float]],
                  offset: float = 0.0) -> list[Vector]:
    out = []
    for u, v in _ring(profile):
        h = station.top if v >= 0 else station.bottom
        out.append(Vector((
            u * (station.width + offset),
            station.y,
            station.z + v * (h + offset),
        )))
    return out


def station_at(stations: Sequence[Station], y: float) -> Station:
    if y <= stations[0].y:
        return stations[0]
    if y >= stations[-1].y:
        return stations[-1]
    for a, b in zip(stations, stations[1:]):
        if a.y <= y <= b.y:
            t = (y - a.y) / (b.y - a.y) if b.y != a.y else 0.0
            return Station(
                y=y,
                width=a.width + (b.width - a.width) * t,
                top=a.top + (b.top - a.top) * t,
                bottom=a.bottom + (b.bottom - a.bottom) * t,
                z=a.z + (b.z - a.z) * t,
            )
    return stations[-1]


def fuse_point(stations: Sequence[Station], profile: Sequence[tuple[float, float]],
               y: float, p: float, offset: float = 0.0) -> Vector:
    """Point on the fuselage surface.

    ``p`` is a continuous ring parameter in [0, 1): 0 = top centre, 0.5 =
    bottom centre. The discrete ring is linearly interpolated.
    """
    ring = _ring(profile)
    n = len(ring)
    st = station_at(stations, y)
    pos = (p % 1.0) * n
    i0 = int(math.floor(pos)) % n
    i1 = (i0 + 1) % n
    t = pos - math.floor(pos)
    u0, v0 = ring[i0]
    u1, v1 = ring[i1]
    u = u0 + (u1 - u0) * t
    v = v0 + (v1 - v0) * t
    h = st.top if v >= 0 else st.bottom
    return Vector((u * (st.width + offset), y, st.z + v * (h + offset)))


def build_fuselage(name: str, stations: Sequence[Station], profile_key: str,
                   mat, coll, lod: str = 'showcase', bevel_width: float = 0.012,
                   sharp_angle: float = 26.0):
    profile = PROFILES[profile_key]
    rings = [_station_ring(st, profile) for st in stations]
    n = len(rings[0])
    verts: list[Vector] = []
    for ring in rings:
        verts.extend(ring)
    faces = []
    for s in range(len(rings) - 1):
        a = s * n
        b = (s + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    # Caps
    nose_center = Vector((0.0, stations[0].y, stations[0].z))
    tail_center = Vector((0.0, stations[-1].y, stations[-1].z))
    nose_idx = len(verts)
    verts.append(nose_center)
    tail_idx = len(verts)
    verts.append(tail_center)
    for i in range(n):
        j = (i + 1) % n
        faces.append((nose_idx, i, j))
        base = (len(rings) - 1) * n
        faces.append((tail_idx, base + j, base + i))
    obj = create_mesh_object(name, verts, faces, mat, coll, smooth=True)
    bevel_w = 0.0 if lod == 'game' else bevel_width
    finalize(obj, bevel_width=bevel_w, bevel_segments=2, smooth=True, sharp_angle=sharp_angle)
    return obj


def build_fuse_panel(name: str, stations: Sequence[Station], profile_key: str,
                     y0: float, y1: float, p0: float, p1: float, mat, coll,
                     offset: float = 0.006, nu: int = 8, np: int = 6, top: bool = True):
    """A patch that hugs the fuselage surface (livery stripe / sensor panel)."""
    profile = PROFILES[profile_key]
    verts = []
    for i in range(nu + 1):
        y = y0 + (y1 - y0) * (i / nu)
        for j in range(np + 1):
            p = p0 + (p1 - p0) * (j / np)
            verts.append(fuse_point(stations, profile, y, p, offset))
    faces = []
    stride = np + 1
    for i in range(nu):
        for j in range(np):
            a = i * stride + j
            b = a + 1
            c = a + stride + 1
            d = a + stride
            if top:
                faces.append((a, b, c, d))
            else:
                faces.append((a, d, c, b))
    return create_mesh_object(name, verts, faces, mat, coll, smooth=True)


# --------------------------------------------------------------------------- #
# Lifting surfaces (wings, tails, canards)
# --------------------------------------------------------------------------- #

@dataclass
class WingSpec:
    root_x: float
    tip_x: float
    root_le: float
    root_te: float
    tip_le: float
    tip_te: float
    # Optional cranked planform: [(x, le, te), ...] from root to tip. When set,
    # it replaces the root/mid/tip interpolation and lets a single wing follow
    # a concept sheet's curved/double-delta leading edge.
    curve: list[tuple[float, float, float]] | None = None
    mid_x: float | None = None
    mid_le: float | None = None
    mid_te: float | None = None
    z_root: float = 0.0
    dihedral: float = 0.0
    thickness_root: float = 0.3
    thickness_tip: float = 0.1
    twist: float = 0.0
    segments_span: int = 22
    segments_chord: int = 22
    style: str = 'conventional'


@dataclass
class FinSpec:
    offset: float
    root_z: float
    height: float
    root_le: float
    root_te: float
    tip_le: float
    tip_te: float
    cant: float = 0.0
    thickness_root: float = 0.18
    thickness_tip: float = 0.07
    segments_span: int = 14
    segments_chord: int = 18


def _chord_samples(n: int) -> list[float]:
    return [0.5 - 0.5 * math.cos(math.pi * i / (n - 1)) for i in range(n)]


def _airfoil(v: float) -> float:
    """Normalised NACA-00xx half thickness (0 at LE/TE, ~1 at 30% chord).

    The bracketed NACA polynomial peaks at ~0.1001; normalising by 0.5 (as a
    naive reading might suggest) made every wing five times too thin.
    """
    v = max(0.0, min(1.0, v))
    y = 0.2969 * math.sqrt(v) - 0.1260 * v - 0.3516 * v * v + 0.2843 * v ** 3 - 0.1015 * v ** 4
    return max(0.0, min(1.0, y / 0.1001))


def _wing_plan_at(plan: WingSpec, u: float) -> tuple[float, float, float, float, float]:
    """Return (x, le, te, z, thickness) at span fraction u."""
    x = plan.root_x + (plan.tip_x - plan.root_x) * u
    if plan.curve:
        pts = plan.curve
        if x <= pts[0][0]:
            _, le, te = pts[0]
        elif x >= pts[-1][0]:
            _, le, te = pts[-1]
        else:
            le = te = None  # type: ignore[assignment]
            for a, b in zip(pts, pts[1:]):
                if a[0] <= x <= b[0]:
                    t = (x - a[0]) / (b[0] - a[0]) if b[0] != a[0] else 0.0
                    le = a[1] + (b[1] - a[1]) * t
                    te = a[2] + (b[2] - a[2]) * t
                    break
    elif plan.mid_x is not None and plan.mid_le is not None and plan.mid_te is not None:
        mid_u = (plan.mid_x - plan.root_x) / (plan.tip_x - plan.root_x)
        mid_u = max(0.001, min(0.999, mid_u))
        if u <= mid_u:
            t = u / mid_u
            le = plan.root_le + (plan.mid_le - plan.root_le) * t
            te = plan.root_te + (plan.mid_te - plan.root_te) * t
        else:
            t = (u - mid_u) / (1.0 - mid_u)
            le = plan.mid_le + (plan.tip_le - plan.mid_le) * t
            te = plan.mid_te + (plan.tip_te - plan.mid_te) * t
    else:
        le = plan.root_le + (plan.tip_le - plan.root_le) * u
        te = plan.root_te + (plan.tip_te - plan.root_te) * u
    z = plan.z_root + math.tan(plan.dihedral) * (x - plan.root_x)
    th = plan.thickness_root + (plan.thickness_tip - plan.thickness_root) * u
    return x, le, te, z, th


def wing_point(plan: WingSpec, sign: int, u: float, v: float,
               offset: float = 0.0, top: bool = True, thickness_scale: float = 1.0) -> Vector:
    x, le, te, z, th = _wing_plan_at(plan, u)
    chord = le - te
    y = le - v * chord
    yt = _airfoil(v) * th * 0.5 * thickness_scale
    zz = z + (yt if top else -yt)
    if plan.twist:
        zz += plan.twist * (0.5 - v)
    normal = Vector((0.0, 0.0, 1.0 if top else -1.0))
    return Vector((sign * x, y, zz)) + normal * offset


def wing_uv_point(plan: WingSpec, sign: int, u: float, v: float,
                  offset: float = 0.0, top: bool = True) -> Vector:
    return wing_point(plan, sign, u, v, offset, top)


def build_wing(name: str, plan: WingSpec, sign: int, mat, coll, lod: str = 'showcase',
               cap: bool = True) -> bpy.types.Object:
    if lod == 'showcase':
        n_span = int(plan.segments_span * 1.35)
        n_chord = int(plan.segments_chord * 1.25)
    else:
        # Keep the mission LOD under budget even when the concept wing needs a
        # dense showcase mesh.
        n_span = min(max(6, plan.segments_span // 3), 12)
        n_chord = min(max(6, plan.segments_chord // 3), 10)
    ts = _chord_samples(n_chord)
    sections = []
    for i in range(n_span + 1):
        u = i / n_span
        ring: list[Vector] = []
        ring.append(wing_point(plan, sign, u, 0.0, 0.0, True))
        for v in ts[1:-1]:
            ring.append(wing_point(plan, sign, u, v, 0.0, True))
        ring.append(wing_point(plan, sign, u, 1.0, 0.0, True))
        for v in reversed(ts[1:-1]):
            ring.append(wing_point(plan, sign, u, v, 0.0, False))
        sections.append(ring)
    n = len(sections[0])
    verts: list[Vector] = []
    for sec in sections:
        verts.extend(sec)
    faces = []
    for s in range(len(sections) - 1):
        a = s * n
        b = (s + 1) * n
        for i in range(n):
            j = (i + 1) % n
            if sign > 0:
                faces.append((a + i, a + j, b + j, b + i))
            else:
                faces.append((a + i, b + i, b + j, a + j))
    if cap:
        # Flat tip cap.
        base = (len(sections) - 1) * n
        faces.append(tuple(range(base, base + n)))
        # Root cap (hidden inside the fuselage) keeps the mesh watertight.
        faces.append(tuple(range(n - 1, -1, -1)))
    obj = create_mesh_object(name, verts, faces, mat, coll, smooth=True)
    bevel_w = 0.0 if lod == 'game' else 0.006
    finalize(obj, bevel_width=bevel_w, bevel_segments=2, smooth=True, sharp_angle=36.0)
    return obj


def build_wing_patch(name: str, plan: WingSpec, sign: int, u0: float, u1: float,
                     v0: float, v1: float, mat, coll, top: bool = True,
                     offset: float = 0.007, nu: int = 6, nv: int = 6):
    verts = []
    for i in range(nu + 1):
        u = u0 + (u1 - u0) * (i / nu)
        for j in range(nv + 1):
            v = v0 + (v1 - v0) * (j / nv)
            verts.append(wing_point(plan, sign, u, v, offset, top))
    faces = []
    stride = nv + 1
    for i in range(nu):
        for j in range(nv):
            a = i * stride + j
            b = a + 1
            c = a + stride + 1
            d = a + stride
            faces.append((a, b, c, d) if top else (a, d, c, b))
    return create_mesh_object(name, verts, faces, mat, coll, smooth=True)


def build_wing_strip(name: str, plan: WingSpec, sign: int, u0: float, u1: float,
                     v0: float, v1: float, width_v: float, mat, coll, top: bool = True,
                     offset: float = 0.009, nu: int = 12):
    """A diagonal stripe following the wing surface."""
    verts = []
    for i in range(nu + 1):
        t = i / nu
        u = u0 + (u1 - u0) * t
        v = v0 + (v1 - v0) * t
        verts.append(wing_point(plan, sign, u, max(0.0, v - width_v * 0.5), offset, top))
        verts.append(wing_point(plan, sign, u, min(1.0, v + width_v * 0.5), offset, top))
    faces = []
    for i in range(nu):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2) if top else (a, a + 2, a + 3, a + 1))
    return create_mesh_object(name, verts, faces, mat, coll, smooth=True)


def build_wing_shape(name: str, plan: WingSpec, sign: int,
                     uv_polygon: Sequence[tuple[float, float]], mat, coll,
                     top: bool = True, offset: float = 0.01, subdiv: int = 6):
    """A flat polygon projected onto one wing surface.

    With ``subdiv > 0`` a 4-point polygon becomes a subdivided grid that
    follows the wing's curvature; without it, large flat decals can cut
    through a cranked wing and produce jagged fragments.
    """
    if len(uv_polygon) < 3:
        raise ValueError('need at least 3 points')
    if subdiv > 0 and len(uv_polygon) == 4:
        c0, c1, c2, c3 = uv_polygon
        nu = nv = max(2, subdiv)
        verts = []
        for i in range(nu + 1):
            s = i / nu
            top_edge = (c0[0] + (c1[0] - c0[0]) * s, c0[1] + (c1[1] - c0[1]) * s)
            bot_edge = (c3[0] + (c2[0] - c3[0]) * s, c3[1] + (c2[1] - c3[1]) * s)
            for j in range(nv + 1):
                t = j / nv
                u = top_edge[0] + (bot_edge[0] - top_edge[0]) * t
                v = top_edge[1] + (bot_edge[1] - top_edge[1]) * t
                verts.append(wing_point(plan, sign, u, v, offset, top))
        faces = []
        stride = nv + 1
        for i in range(nu):
            for j in range(nv):
                a = i * stride + j
                faces.append((a, a + 1, a + stride + 1, a + stride)
                             if top else (a, a + stride, a + stride + 1, a + 1))
        return create_mesh_object(name, verts, faces, mat, coll, smooth=True)
    verts = [wing_point(plan, sign, u, v, offset, top) for u, v in uv_polygon]
    faces = [tuple(range(len(verts)))]
    obj = create_mesh_object(name, verts, faces, mat, coll, smooth=False)
    return obj


# --------------------------------------------------------------------------- #
# Vertical fins
# --------------------------------------------------------------------------- #

def build_fin(name: str, plan: FinSpec, sign: int, mat, coll, lod: str = 'showcase') -> bpy.types.Object:
    if lod == 'showcase':
        n_span = int(plan.segments_span * 1.35)
        n_chord = int(plan.segments_chord * 1.25)
    else:
        n_span = min(max(4, plan.segments_span // 3), 8)
        n_chord = min(max(4, plan.segments_chord // 3), 10)
    ts = _chord_samples(n_chord)
    cant_s = math.sin(plan.cant)
    cant_c = math.cos(plan.cant)
    span_dir = Vector((sign * cant_s, 0.0, cant_c))
    normal_dir = Vector((sign * cant_c, 0.0, -cant_s))
    base = Vector((sign * plan.offset, 0.0, plan.root_z))

    def point(u: float, v: float, side: float) -> Vector:
        z_span = plan.height * u
        le = plan.root_le + (plan.tip_le - plan.root_le) * u
        te = plan.root_te + (plan.tip_te - plan.root_te) * u
        chord = le - te
        y = le - v * chord
        th = plan.thickness_root + (plan.thickness_tip - plan.thickness_root) * u
        t = _airfoil(v) * th * 0.5 * side
        return base + span_dir * z_span + Vector((0.0, y, 0.0)) + normal_dir * t

    sections = []
    for i in range(n_span + 1):
        u = i / n_span
        ring: list[Vector] = [point(u, 0.0, 1.0)]
        for v in ts[1:-1]:
            ring.append(point(u, v, 1.0))
        ring.append(point(u, 1.0, 1.0))
        for v in reversed(ts[1:-1]):
            ring.append(point(u, v, -1.0))
        sections.append(ring)
    n = len(sections[0])
    verts = []
    for sec in sections:
        verts.extend(sec)
    faces = []
    for s in range(len(sections) - 1):
        a = s * n
        b = (s + 1) * n
        for i in range(n):
            j = (i + 1) % n
            if sign > 0:
                faces.append((a + i, a + j, b + j, b + i))
            else:
                faces.append((a + i, b + i, b + j, a + j))
    base_i = (len(sections) - 1) * n
    faces.append(tuple(range(base_i, base_i + n)))
    faces.append(tuple(range(n - 1, -1, -1)))
    obj = create_mesh_object(name, verts, faces, mat, coll, smooth=True)
    bevel_w = 0.0 if lod == 'game' else 0.005
    finalize(obj, bevel_width=bevel_w, bevel_segments=2, smooth=True, sharp_angle=36.0)
    return obj


def fin_surface_point(plan: FinSpec, sign: int, u: float, v: float, side: float,
                      offset: float = 0.0) -> Vector:
    cant_s = math.sin(plan.cant)
    cant_c = math.cos(plan.cant)
    span_dir = Vector((sign * cant_s, 0.0, cant_c))
    normal_dir = Vector((sign * cant_c, 0.0, -cant_s))
    base = Vector((sign * plan.offset, 0.0, plan.root_z))
    z_span = plan.height * u
    le = plan.root_le + (plan.tip_le - plan.root_le) * u
    te = plan.root_te + (plan.tip_te - plan.root_te) * u
    chord = le - te
    y = le - v * chord
    th = plan.thickness_root + (plan.thickness_tip - plan.thickness_root) * u
    t = _airfoil(v) * th * 0.5 * side
    return base + span_dir * z_span + Vector((0.0, y, 0.0)) + normal_dir * (t + side * offset)


def build_fin_patch(name: str, plan: FinSpec, sign: int, u0: float, u1: float,
                    v0: float, v1: float, side: float, mat, coll,
                    offset: float = 0.005, nu: int = 5, nv: int = 5):
    verts = []
    for i in range(nu + 1):
        u = u0 + (u1 - u0) * (i / nu)
        for j in range(nv + 1):
            v = v0 + (v1 - v0) * (j / nv)
            verts.append(fin_surface_point(plan, sign, u, v, side, offset))
    faces = []
    stride = nv + 1
    for i in range(nu):
        for j in range(nv):
            a = i * stride + j
            b = a + 1
            c = a + stride + 1
            d = a + stride
            faces.append((a, b, c, d) if side > 0 else (a, d, c, b))
    return create_mesh_object(name, verts, faces, mat, coll, smooth=True)


# --------------------------------------------------------------------------- #
# Duct / intake / nozzle
# --------------------------------------------------------------------------- #

def rounded_rect_ring(width: float, height: float, chamfer: float = 0.2,
                      segments: int = 16) -> list[tuple[float, float]]:
    """Chamfered rectangle outline in local (u, v), counter-clockwise."""
    w = width * 0.5
    h = height * 0.5
    c = min(chamfer, min(w, h) * 0.9)
    pts = [
        (-w + c, h), (w - c, h), (w, h - c), (w, -h + c),
        (w - c, -h), (-w + c, -h), (-w, -h + c), (-w, h - c),
    ]
    dense = []
    for i in range(len(pts)):
        p0 = pts[i]
        p1 = pts[(i + 1) % len(pts)]
        for k in range(segments // len(pts)):
            t = k / max(1, segments // len(pts))
            dense.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t))
    return dense


def build_intake(name: str, x: float, y_lip: float, z: float, width: float, height: float,
                 length: float, mat_lip, mat_dark, mat_body, coll, lod: str = 'showcase',
                 chamfer: float = 0.25, inner_scale: float = 0.82, cant: float = 0.0):
    """A side/belly intake duct with an open dark throat."""
    n = 32 if lod == 'showcase' else 12
    ring2 = rounded_rect_ring(width, height, chamfer, n)
    # front outer ring is slightly smaller than the lip plane -> a visible lip
    verts = []
    outer_lip = []
    inner_lip = []
    back_outer = []
    back_inner = []
    for u, v in ring2:
        outer_lip.append(Vector((x + u, y_lip, z + v)))
        inner_lip.append(Vector((x + u * inner_scale, y_lip + 0.02, z + v * inner_scale)))
        back_outer.append(Vector((x + u * 1.03, y_lip - length, z + v * 1.03)))
        back_inner.append(Vector((x + u * inner_scale * 0.92, y_lip - length * 0.94,
                                  z + v * inner_scale * 0.92)))
    # outer shell
    base = 0
    verts.extend(outer_lip)
    verts.extend(back_outer)
    outer_n = len(outer_lip)
    faces = []
    for i in range(outer_n):
        j = (i + 1) % outer_n
        faces.append((base + i, base + j, base + outer_n + j, base + outer_n + i))
    # inner shell (reverse winding)
    base2 = len(verts)
    verts.extend(inner_lip)
    verts.extend(back_inner)
    for i in range(outer_n):
        j = (i + 1) % outer_n
        faces.append((base2 + i, base2 + outer_n + i, base2 + outer_n + j, base2 + j))
    # lip rim
    for i in range(outer_n):
        j = (i + 1) % outer_n
        faces.append((i, base2 + i, base2 + j, j))
    # throat cap
    faces.append(tuple(base2 + outer_n + i for i in range(outer_n)))
    obj = create_mesh_object(name, verts, faces, mat_body, coll, smooth=True)
    finalize(obj, bevel_width=0.0 if lod == 'game' else 0.004, bevel_segments=2,
             smooth=True, sharp_angle=34.0)
    # Two materials: assign lip faces after creation is possible but a simple
    # separate lip ring gives cleaner colour separation.
    lip_obj = build_duct_lip(f'{name}_Lip', x, y_lip, z, width, height, chamfer,
                             mat_lip, coll, lod, inner_scale)
    throat = build_throat_plate(f'{name}_Throat', x, y_lip, z, width, height,
                                mat_dark, coll, lod, inner_scale)
    return [obj, lip_obj, throat]


def build_duct_lip(name: str, x: float, y: float, z: float, width: float, height: float,
                   chamfer: float, mat, coll, lod: str, inner_scale: float):
    n = 48 if lod == 'showcase' else 16
    ring = rounded_rect_ring(width, height, chamfer, n)
    outer = [Vector((x + u, y, z + v)) for u, v in ring]
    inner = [Vector((x + u * inner_scale, y + 0.02, z + v * inner_scale)) for u, v in ring]
    verts = outer + inner
    faces = []
    m = len(ring)
    for i in range(m):
        j = (i + 1) % m
        faces.append((i, j, m + j, m + i))
    obj = create_mesh_object(name, verts, faces, mat, coll, smooth=True)
    finalize(obj, bevel_width=0.0 if lod == 'game' else 0.004, bevel_segments=2,
             smooth=True, sharp_angle=40.0)
    return obj


def build_throat_plate(name: str, x: float, y: float, z: float, width: float, height: float,
                       mat, coll, lod: str, inner_scale: float):
    n = 24
    ring = rounded_rect_ring(width * inner_scale * 0.92, height * inner_scale * 0.92, 0.18, n)
    verts = [Vector((x + u, y + 0.3, z + v)) for u, v in ring]
    faces = [tuple(range(len(verts)))]
    obj = create_mesh_object(name, verts, faces, mat, coll, smooth=False)
    return obj


def build_nozzle(name: str, x: float, y_exit: float, z: float, radius: float,
                 length: float, style: str, mats, coll, lod: str = 'showcase'):
    """Nacelle + convergent petals + turbine face; the game adds the flame FX."""
    n = 28 if lod == 'showcase' else 12
    petals = 16 if lod == 'showcase' else 8
    y_forward = y_exit + length
    profiles = [
        (y_forward, radius * 0.86),
        (y_forward - length * 0.25, radius * 1.06),
        (y_forward - length * 0.62, radius * 1.02),
        (y_exit + radius * 0.18, radius * 0.92),
        (y_exit, radius * 0.86),
    ]
    rings = []
    for yy, rr in profiles:
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            ring.append(Vector((x + math.cos(a) * rr, yy, z + math.sin(a) * rr)))
        rings.append(ring)
    verts = []
    for r in rings:
        verts.extend(r)
    faces = []
    for s in range(len(rings) - 1):
        a = s * n
        b = (s + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    # back cap around the inner cavity
    faces.append(tuple((len(rings) - 1) * n + i for i in range(n)))
    obj = create_mesh_object(f'{name}_Nacelle', verts, faces, mats['base'], coll, smooth=True)
    finalize(obj, bevel_width=0.0 if lod == 'game' else 0.004, bevel_segments=2,
             smooth=True, sharp_angle=36.0)

    parts = [obj]
    # Dark metallic heat-shield sleeve over the exhaust section; the painted
    # nacelle should hand over to bare metal before the petals.
    sleeve_profile = [
        (y_exit + length * 0.56, radius * 1.015),
        (y_exit + length * 0.30, radius * 1.035),
        (y_exit + radius * 0.20, radius * 0.96),
        (y_exit + 0.02, radius * 0.92),
    ]
    srings = []
    for yy, rr in sleeve_profile:
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            ring.append(Vector((x + math.cos(a) * rr, yy, z + math.sin(a) * rr)))
        srings.append(ring)
    sverts = []
    for r in srings:
        sverts.extend(r)
    sfaces = []
    for s in range(len(srings) - 1):
        a = s * n
        b = (s + 1) * n
        for i in range(n):
            j = (i + 1) % n
            sfaces.append((a + i, a + j, b + j, b + i))
    sleeve = create_mesh_object(f'{name}_HeatSleeve', sverts, sfaces, mats['burn'], coll, smooth=True)
    parts.append(sleeve)
    # Heat-shield band where the painted nacelle meets the metal nozzle.
    band = build_torus(f'{name}_HeatBand', radius * 0.985, radius * 0.055,
                       (x, y_exit + radius * 0.32, z), mats['burn'], coll,
                       rotation=(math.pi / 2, 0, 0), major_segments=n, minor_segments=6)
    parts.append(band)
    # A bright metal lip frames the hot section in the top/side views.
    lip = build_torus(f'{name}_ExitLip', radius * 0.90, radius * 0.045,
                      (x, y_exit + 0.04, z), mats['metal'], coll,
                      rotation=(math.pi / 2, 0, 0), major_segments=n, minor_segments=6)
    parts.append(lip)
    # inner cavity
    inner_r = radius * 0.74
    yy0 = y_exit + radius * 0.12
    yy1 = y_exit + length * 0.55
    inner_rings = []
    for yy, rr in [(yy0, inner_r), (yy1, inner_r * 0.9)]:
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            ring.append(Vector((x + math.cos(a) * rr, yy, z + math.sin(a) * rr)))
        inner_rings.append(ring)
    iverts = inner_rings[0] + inner_rings[1]
    ifaces = []
    for i in range(n):
        j = (i + 1) % n
        ifaces.append((i, n + i, n + j, j))
    cavity = create_mesh_object(f'{name}_Cavity', iverts, ifaces, mats['dark'], coll, smooth=True)
    parts.append(cavity)
    if lod == 'showcase':
        glow_verts = []
        for i in range(n):
            a = 2 * math.pi * i / n
            glow_verts.append(Vector((x + math.cos(a) * inner_r * 0.66, yy0 + 0.03,
                                      z + math.sin(a) * inner_r * 0.66)))
        glow = create_mesh_object(f'{name}_Glow', glow_verts, [tuple(range(n))],
                                  mats['glow_soft'], coll, smooth=False)
        parts.append(glow)

    # turbine face with radial blades
    disc_center = Vector((x, yy1 - 0.18, z))
    turb = []
    for i in range(n):
        a = 2 * math.pi * i / n
        turb.append(Vector((x + math.cos(a) * inner_r * 0.92, yy1 - 0.18,
                            z + math.sin(a) * inner_r * 0.92)))
    disc = create_mesh_object(f'{name}_Disc', turb, [tuple(range(n))], mats['burn'], coll, smooth=False)
    parts.append(disc)
    if lod == 'showcase':
        bm = bmesh.new()
        for i in range(petals):
            a = 2 * math.pi * i / petals
            # small radial blade on the turbine face
            p0 = Vector((x + math.cos(a) * inner_r * 0.2, yy1 - 0.12, z + math.sin(a) * inner_r * 0.2))
            p1 = Vector((x + math.cos(a) * inner_r * 0.8, yy1 - 0.12, z + math.sin(a) * inner_r * 0.8))
            w = 0.02
            nx = -math.sin(a) * w
            nz = math.cos(a) * w
            vs = [
                bm.verts.new(p0 + Vector((nx, 0, nz))),
                bm.verts.new(p1 + Vector((nx, 0, nz))),
                bm.verts.new(p1 - Vector((nx, 0, nz))),
                bm.verts.new(p0 - Vector((nx, 0, nz))),
            ]
            bm.faces.new(vs)
        blade_obj = bm_to_object(f'{name}_Turbine', bm, mats['metal'], coll, smooth=False)
        parts.append(blade_obj)

    # Petals around the exit.
    petal_verts = []
    petal_faces = []
    for i in range(petals):
        a0 = 2 * math.pi * i / petals
        a1 = 2 * math.pi * (i + 1) / petals - 0.012
        r0 = radius * 0.82
        r1 = radius * 0.98
        for yy, rr, spoke in [(y_exit + radius * 0.18, r0, 0.0), (y_exit - 0.02, r1, 0.05)]:
            pass
        p0 = Vector((x + math.cos(a0) * r0, y_exit + radius * 0.16, z + math.sin(a0) * r0))
        p1 = Vector((x + math.cos(a1) * r0, y_exit + radius * 0.16, z + math.sin(a1) * r0))
        p2 = Vector((x + math.cos(a1) * r1, y_exit + radius * 0.02, z + math.sin(a1) * r1))
        p3 = Vector((x + math.cos(a0) * r1, y_exit + radius * 0.02, z + math.sin(a0) * r1))
        offs = Vector((0.0, 0.012, 0.0))
        base_i = len(petal_verts)
        petal_verts.extend([p0 + offs, p1 + offs, p2 + offs, p3 + offs])
        petal_faces.append((base_i, base_i + 1, base_i + 2, base_i + 3))
    petals_obj = create_mesh_object(f'{name}_Petals', petal_verts, petal_faces, mats['metal'], coll, smooth=False)
    parts.append(petals_obj)

    if style == 'tvc':
        # Two actuator rings make the thrust-vector hardware readable.
        for k, yy in enumerate((y_exit + length * 0.72, y_exit + length * 0.5)):
            ring_verts = []
            for i in range(n):
                a = 2 * math.pi * i / n
                ring_verts.append(Vector((x + math.cos(a) * radius * 1.08, yy,
                                          z + math.sin(a) * radius * 1.08)))
            ring_obj = create_mesh_object(f'{name}_TVC{k}', ring_verts,
                                          [tuple(range(n))], mats['metal'], coll, smooth=False)
            parts.append(ring_obj)
    return parts


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #

def build_torus(name: str, major: float, minor: float, location, mat, coll,
                rotation=(0.0, 0.0, 0.0), major_segments: int = 24, minor_segments: int = 8):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, major_segments=major_segments,
        minor_segments=minor_segments, location=location, rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    shade_smooth(obj)
    return obj


def build_cylinder_between(name: str, p0: Vector, p1: Vector, radius: float, mat, coll,
                           vertices: int = 12, taper: float = 1.0):
    vec = p1 - p0
    depth = vec.length
    if depth <= 1e-6:
        return None
    mid = (p0 + p1) * 0.5
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius * taper,
                                    depth=depth, location=mid)
    obj = bpy.context.active_object
    obj.name = name
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(vec.normalized())
    shade_smooth(obj)
    return obj


def build_flat_plate(name: str, points: Sequence[Vector], thickness: float, normal: Vector,
                     mat, coll):
    """Extrude a flat polygon into a thin plate (doors, sensor covers)."""
    n = Vector(normal).normalized()
    n = n * (thickness * 0.5)
    bm = bmesh.new()
    top = [bm.verts.new(p + n) for p in points]
    bot = [bm.verts.new(p - n) for p in points]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    m = len(points)
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    obj = bm_to_object(name, bm, mat, coll, smooth=False)
    return obj
