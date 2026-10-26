"""Assembly + livery for the five jets."""

from __future__ import annotations

import math

import bpy
from mathutils import Vector

from blender_utils import add_box, add_polyline, add_sphere
from geometry import (
    PROFILES, build_fin, build_fin_patch, build_fuse_panel, build_fuselage, build_wing,
    build_wing_patch, build_wing_shape, build_wing_strip, fin_surface_point,
    fuse_point, station_at, wing_point,
)
from jet_specs import fuse_top_at
from jet_parts import (
    add_details, add_fin_numbers, add_fuselage_panel_lines, add_reference_nodes,
    add_wing_numbers, add_wing_panel_lines, build_canopy, build_dorsal_spine,
    build_engine_housing, build_gear, build_intakes, build_nozzles,
)
from jet_specs import JETS, JetSpec


# --------------------------------------------------------------------------- #
# Livery helpers
# --------------------------------------------------------------------------- #

def _tag(obj, group: str) -> None:
    obj['part_group'] = group


def _wing_panel(name, spec, sign, u0, u1, v0, v1, mat, coll, top=True, offset=0.008):
    return build_wing_patch(name, spec.wing, sign, u0, u1, v0, v1, mat, coll,
                            top=top, offset=offset, nu=8, nv=8)


def _wing_edge_line(name, spec, sign, v, mat, coll, top=True, offset=0.009, radius=0.014):
    pts = [wing_point(spec.wing, sign, u, v, offset, top) for u in [i / 16 for i in range(17)]]
    return add_polyline(name, pts, radius, mat, coll)


def _fin_edge_line(name, spec, sign, side, u, mat, coll, radius=0.009, offset=0.008):
    from geometry import fin_surface_point
    fin = spec.fins[0]
    pts = [fin_surface_point(fin, sign, u, v, side, offset) for v in [i / 12 for i in range(13)]]
    return add_polyline(name, pts, radius, mat, coll)


def _fin_le_line(name, spec, sign, side, mat, coll, v=0.015, offset=0.008, radius=0.010):
    from geometry import fin_surface_point
    fin = spec.fins[0]
    pts = [fin_surface_point(fin, sign, u, v, side, offset) for u in [i / 14 for i in range(15)]]
    return add_polyline(name, pts, radius, mat, coll)


def _cloud_spiral(center_u, center_v, turns=2.1, radius=0.09, sign=1):
    pts = []
    n = 38
    for i in range(n):
        t = i / (n - 1)
        a = t * turns * math.pi * 2
        r = radius * (0.15 + 0.85 * t)
        pts.append((center_u + math.cos(a) * r, center_v + math.sin(a) * r * 0.85 * sign))
    return pts


# --------------------------------------------------------------------------- #
# Per-jet livery
# --------------------------------------------------------------------------- #

def livery_qingluan(spec: JetSpec, mats, coll, lod: str = 'showcase'):
    objs = []
    jade_poly = [(0.035, 0.52), (0.925, 0.43), (0.988, 0.985), (0.05, 0.985)]
    for sign in (-1, 1):
        objs.append(build_wing_shape(f'JadeTop{sign}', spec.wing, sign, jade_poly,
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_shape(f'JadeBottom{sign}', spec.wing, sign, jade_poly,
                                     mats['secondary'], coll, top=False, offset=0.010))
        objs.append(build_wing_patch(f'GoldLE{sign}', spec.wing, sign, 0.015, 0.985, 0.0, 0.020,
                                     mats['accent'], coll, top=True, offset=0.011,
                                     nu=22 if lod == 'showcase' else 8, nv=1))
        if lod == 'showcase':
            # Gold outline follows the diagonal jade panel edge.
            border = [wing_point(spec.wing, sign, 0.035 + (0.925 - 0.035) * i / 18,
                                 0.52 + (0.43 - 0.52) * i / 18, 0.012, True) for i in range(19)]
            objs.append(add_polyline(f'JadeBorder{sign}', border, 0.013, mats['accent'], coll))
            # Extra jade panels at the wing root and the clipped wingtip.
            objs.append(build_wing_shape(f'JadeRoot{sign}', spec.wing, sign,
                                         [(0.02, 0.10), (0.24, 0.07), (0.20, 0.33), (0.02, 0.42)],
                                         mats['secondary'], coll, top=True, offset=0.010))
            objs.append(build_wing_shape(f'JadeTip{sign}', spec.wing, sign,
                                         [(0.82, 0.05), (0.99, 0.035), (0.99, 0.34), (0.84, 0.38)],
                                         mats['secondary'], coll, top=True, offset=0.010))
            # Gold spiral cloud motifs on the wing top.
            for k, (cu, cv, r) in enumerate(((0.34, 0.74, 0.075), (0.56, 0.70, 0.055),
                                             (0.75, 0.68, 0.042))):
                pts = [wing_point(spec.wing, sign, max(0.02, min(0.99, u)), max(0.02, min(0.99, v)),
                                  0.012, True)
                       for u, v in _cloud_spiral(cu, cv, 2.0, r, sign if sign > 0 else -1)]
                objs.append(add_polyline(f'Cloud{sign}_{k}', pts, 0.018, mats['accent'], coll))
        # Jade panel on the fin outer surface.
        if spec.fins:
            fin = spec.fins[0]
            objs.append(build_fin_patch(f'FinJade{sign}', fin, sign, 0.20, 0.96, 0.60, 0.99,
                                        1, mats['secondary'], coll, offset=0.008, nu=6, nv=6))
            objs.append(_fin_le_line(f'FinGoldLE{sign}', spec, sign, 1, mats['accent'], coll))
            if lod == 'showcase':
                objs.append(_fin_edge_line(f'FinGoldTE{sign}', spec, sign, 1, 0.96,
                                           mats['accent'], coll, radius=0.008))
                for k, (cu, cv, r) in enumerate(((0.42, 0.62, 0.11), (0.54, 0.52, 0.075))):
                    pts = [fin_surface_point(fin, sign, max(0.05, min(0.95, u)),
                                             max(0.08, min(0.92, v)), 1, 0.010)
                           for u, v in _cloud_spiral(cu, cv, 1.8, r, sign)]
                    objs.append(add_polyline(f'FinCloud{sign}_{k}', pts, 0.014,
                                             mats['accent'], coll))
        if lod == 'showcase':
            # Underside: a calm shadow tone keeps the all-ivory silhouette readable.
            objs.append(build_wing_patch(f'UnderWing{sign}', spec.wing, sign, 0.04, 0.96, 0.10, 0.52,
                                         mats['underside'], coll, top=False, offset=0.009,
                                         nu=10, nv=8))
        if spec.lerx:
            objs.append(build_wing_patch(f'LerxJade{sign}', spec.lerx, sign, 0.18, 0.94, 0.12, 0.92,
                                         mats['secondary'], coll, top=True, offset=0.011,
                                         nu=8, nv=6))
            objs.append(build_wing_patch(f'LerxGold{sign}', spec.lerx, sign, 0.02, 0.98, 0.0, 0.03,
                                         mats['accent'], coll, top=True, offset=0.012, nu=14, nv=1))
        if spec.canards:
            objs.append(build_wing_patch(f'CanardJade{sign}', spec.canards, sign, 0.12, 0.92, 0.18, 0.9,
                                         mats['secondary'], coll, top=True, offset=0.010,
                                         nu=8, nv=6))
            objs.append(build_wing_patch(f'CanardGold{sign}', spec.canards, sign, 0.02, 0.98, 0.0, 0.05,
                                         mats['accent'], coll, top=True, offset=0.011, nu=12, nv=1))
    # Jade panels alongside the dorsal spine and on the fuselage sides.
    for side, (p0, p1) in ((1, (0.055, 0.175)), (-1, (0.825, 0.945))):
        objs.append(build_fuse_panel(f'JadeDeck{side}', spec.stations, spec.profile,
                                     -spec.length * 0.38, spec.canopy.y_back - 0.25,
                                     p0, p1, mats['secondary'], coll, offset=0.006,
                                     nu=16, np=2, top=side > 0))
    for side, (p0, p1) in ((1, (0.30, 0.44)), (-1, (0.56, 0.70))):
        objs.append(build_fuse_panel(f'JadeSide{side}', spec.stations, spec.profile,
                                     -spec.length * 0.20, spec.length * 0.27,
                                     p0, p1, mats['secondary'], coll, offset=0.006,
                                     nu=16, np=2, top=side > 0))
        objs.append(build_fuse_panel(f'JadeFore{side}', spec.stations, spec.profile,
                                     spec.length * 0.24, spec.length * 0.38,
                                     p0, p1, mats['secondary'], coll, offset=0.006,
                                     nu=10, np=2, top=side > 0))
    # Darker belly panel.
    objs.append(build_fuse_panel('Underside', spec.stations, spec.profile,
                                 -spec.length * 0.34, spec.length * 0.20,
                                 0.37, 0.63, mats['underside'], coll, offset=0.006,
                                 nu=18, np=3, top=False))
    # Dark radar aperture on the upper nose + a lower-contrast radome tip.
    objs.append(build_fuse_panel('RadarAperture', spec.stations, spec.profile,
                                 spec.length * 0.38, spec.length * 0.47,
                                 0.965, 1.035, mats['radome'], coll, offset=0.005,
                                 nu=4, np=2, top=True))
    objs.append(build_fuse_panel('RadomeTip', spec.stations, spec.profile,
                                 spec.length * 0.455, spec.length * 0.492,
                                 0.0, 1.0, mats['radome'], coll, offset=0.004,
                                 nu=3, np=16, top=True))
    # Small dark canopy sill strip ahead of the glass.
    if spec.canopy:
        objs.append(build_fuse_panel('CanopySill', spec.stations, spec.profile,
                                     spec.canopy.y_front - 0.08, spec.canopy.y_front + 0.22,
                                     0.99, 1.01, mats['panel'], coll, offset=0.006,
                                     nu=2, np=1, top=True))
    # Gold trim along the chine and the dorsal spine sides.
    for side, p in ((1, 0.25), (-1, 0.75)):
        pts = []
        for i in range(26):
            t = i / 25
            y = (-0.42 + 0.80 * t) * spec.length
            pts.append(fuse_point(spec.stations, PROFILES[spec.profile], y, p, 0.0065))
        objs.append(add_polyline(f'ChineGold{side}', pts, 0.011, mats['accent'], coll))
    if spec.dorsal_spine:
        for sign in (-1, 1):
            y0, y1 = spec.length * -0.42, spec.canopy.y_back - 0.2
            pts = []
            for i in range(16):
                t = i / 15
                y = y0 + (y1 - y0) * t
                st = station_at(spec.stations, y)
                pts.append((sign * st.width * 0.18, y, fuse_top_at(spec.stations, y) + 0.015))
            objs.append(add_polyline(f'SpineGold{sign}', pts, 0.012, mats['accent'], coll))
    return objs


def livery_akari(spec: JetSpec, mats, coll, lod: str = 'showcase'):
    objs = []
    for sign in (-1, 1):
        # Clean red diagonal bands, matching the two broad stripes on the sheet.
        objs.append(build_wing_shape(f'RedBandA{sign}', spec.wing, sign,
                                     [(0.02, 0.18), (0.96, 0.44), (0.96, 0.57), (0.02, 0.32)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_shape(f'RedBandB{sign}', spec.wing, sign,
                                     [(0.06, 0.45), (0.90, 0.60), (0.90, 0.67), (0.06, 0.53)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_patch(f'RedLE{sign}', spec.wing, sign, 0.02, 0.985, 0.0, 0.015,
                                     mats['secondary'], coll, top=True, offset=0.011, nu=20, nv=1))
        # Navy tip band, inner leading-edge wedge and dorsal flash.
        objs.append(build_wing_shape(f'NavyTip{sign}', spec.wing, sign,
                                     [(0.93, 0.02), (0.995, 0.02), (0.995, 0.98), (0.93, 0.98)],
                                     mats['accent'], coll, top=True, offset=0.012))
        objs.append(build_wing_shape(f'NavyInner{sign}', spec.wing, sign,
                                     [(0.20, 0.02), (0.42, 0.02), (0.38, 0.09), (0.18, 0.09)],
                                     mats['accent'], coll, top=True, offset=0.012))
        if spec.fins:
            fin = spec.fins[0]
            objs.append(build_fin_patch(f'FinRed{sign}', fin, sign, 0.05, 0.46, 0.35, 0.98,
                                        1, mats['secondary'], coll, offset=0.008, nu=6, nv=6))
            objs.append(build_fin_patch(f'FinNavy{sign}', fin, sign, 0.46, 0.90, 0.05, 0.95,
                                        1, mats['accent'], coll, offset=0.009, nu=6, nv=6))
            objs.append(_fin_edge_line(f'FinRedLE{sign}', spec, sign, 1, 0.06,
                                       mats['secondary'], coll, radius=0.012))
        # Wingtip missile rails: small navy pods with red tips on the clipped tips.
        p = wing_point(spec.wing, sign, 0.985, 0.52, 0.0, True)
        pod = add_sphere(f'WingtipRail{sign}', 1.0, (p.x, p.y, p.z), mats['accent'], coll,
                         scale=(0.10, 0.58, 0.10), segments=12, rings=8)
        tip = add_sphere(f'WingtipRailTip{sign}', 0.10, (p.x, p.y - 0.62, p.z),
                         mats['secondary'], coll, segments=10, rings=6)
        objs.extend([pod, tip])
    # Red spine stripe and navy tail flash.
    objs.append(build_fuse_panel('RedSpine', spec.stations, spec.profile,
                                 -spec.length * 0.18, spec.length * 0.18,
                                 0.965, 1.035, mats['secondary'], coll, offset=0.006,
                                 nu=10, np=1, top=True))
    objs.append(build_fuse_panel('NavyNoseFlash', spec.stations, spec.profile,
                                 spec.length * 0.28, spec.length * 0.34,
                                 0.30, 0.42, mats['accent'], coll, offset=0.006,
                                 nu=4, np=2, top=True))
    objs.append(build_fuse_panel('NavyNoseFlashL', spec.stations, spec.profile,
                                 spec.length * 0.28, spec.length * 0.34,
                                 0.58, 0.70, mats['accent'], coll, offset=0.006,
                                 nu=4, np=2, top=True))
    return objs


def livery_haneul(spec: JetSpec, mats, coll, lod: str = 'showcase'):
    objs = []
    for sign in (-1, 1):
        # Silver structural panels near the roots and wingtips.
        objs.append(build_wing_shape(f'HiVisRoot{sign}', spec.wing, sign,
                                     [(0.03, 0.02), (0.24, 0.02), (0.18, 0.55), (0.03, 0.62)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_shape(f'HiVisTip{sign}', spec.wing, sign,
                                     [(0.80, 0.72), (0.985, 0.68), (0.985, 0.98), (0.80, 0.98)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_patch(f'EWLE{sign}', spec.wing, sign, 0.02, 0.985, 0.0, 0.018,
                                     mats['glow'], coll, top=True, offset=0.011, nu=20, nv=1))
        # Cyan sensor strips along the wing.
        pts = [wing_point(spec.wing, sign, 0.12 + i * 0.8 / 8, 0.42, 0.012, True) for i in range(9)]
        objs.append(add_polyline(f'EWWing{sign}', pts, 0.012, mats['glow'], coll))
        # Datum line on the fuselage side.
        y0, y1 = -spec.length * 0.28, spec.length * 0.30
        for side in (-1, 1):
            objs.append(build_fuse_panel(f'EWSide{sign}_{side}', spec.stations, spec.profile,
                                         y0, y1, 0.145 if side > 0 else 0.855,
                                         0.175 if side > 0 else 0.825,
                                         mats['glow'], coll, offset=0.006, nu=14, np=1,
                                         top=side > 0))
        if spec.fins:
            fin = spec.fins[0]
            objs.append(build_fin_patch(f'FinSilver{sign}', fin, sign, 0.62, 0.99, 0.05, 0.98,
                                        1, mats['secondary'], coll, offset=0.008, nu=4, nv=6))
            objs.append(_fin_edge_line(f'FinCyan{sign}', spec, sign, 1, 0.08,
                                       mats['glow'], coll, radius=0.009))
    return objs


def livery_astra(spec: JetSpec, mats, coll, lod: str = 'showcase'):
    objs = []
    for sign in (-1, 1):
        # Low-saturation cobalt geometric panels.
        objs.append(build_wing_shape(f'CobaltRoot{sign}', spec.wing, sign,
                                     [(0.035, 0.02), (0.36, 0.02), (0.28, 0.50), (0.035, 0.58)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_shape(f'CobaltMid{sign}', spec.wing, sign,
                                     [(0.44, 0.10), (0.66, 0.06), (0.58, 0.44), (0.38, 0.40)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_shape(f'CobaltTip{sign}', spec.wing, sign,
                                     [(0.80, 0.55), (0.985, 0.48), (0.985, 0.98), (0.82, 0.92)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_patch(f'BlueLE{sign}', spec.wing, sign, 0.02, 0.985, 0.0, 0.02,
                                     mats['accent'], coll, top=True, offset=0.011, nu=20, nv=1))
        objs.append(build_wing_patch(f'GlowLE{sign}', spec.wing, sign, 0.16, 0.86, 0.0, 0.010,
                                     mats['glow'], coll, top=True, offset=0.012, nu=14, nv=1))
        if spec.fins:
            fin = spec.fins[0]
            objs.append(build_fin_patch(f'FinCobalt{sign}', fin, sign, 0.58, 0.99, 0.05, 0.98,
                                        1, mats['secondary'], coll, offset=0.008, nu=4, nv=6))
            objs.append(_fin_edge_line(f'FinCyan{sign}', spec, sign, 1, 0.07,
                                       mats['glow'], coll, radius=0.008))
    # A subdued star marking on the right wing of the command variant.
    for sign in (-1, 1):
        pts = []
        center_u, center_v = 0.64, 0.68
        for i in range(10):
            a = math.pi * 2 * i / 10 - math.pi / 2
            r = 0.055 if i % 2 == 0 else 0.022
            pts.append((center_u + math.cos(a) * r, center_v + math.sin(a) * r))
        objs.append(build_wing_shape(f'Star{sign}', spec.wing, sign, pts,
                                     mats['accent'], coll, top=True, offset=0.012))
    return objs


def livery_snega(spec: JetSpec, mats, coll, lod: str = 'showcase'):
    objs = []
    for sign in (-1, 1):
        # Frost/steel-blue camo polygons.
        objs.append(build_wing_shape(f'CamoA{sign}', spec.wing, sign,
                                     [(0.03, 0.03), (0.34, 0.02), (0.46, 0.34), (0.32, 0.62), (0.03, 0.54)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_shape(f'CamoB{sign}', spec.wing, sign,
                                     [(0.48, 0.22), (0.72, 0.16), (0.84, 0.50), (0.62, 0.70)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_shape(f'CamoC{sign}', spec.wing, sign,
                                     [(0.82, 0.72), (0.985, 0.62), (0.985, 0.98), (0.80, 0.98)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_shape(f'CamoD{sign}', spec.wing, sign,
                                     [(0.02, 0.02), (0.17, 0.02), (0.30, 0.22), (0.10, 0.30)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_shape(f'CamoE{sign}', spec.wing, sign,
                                     [(0.86, 0.02), (0.995, 0.02), (0.995, 0.28), (0.90, 0.34)],
                                     mats['secondary'], coll, top=True, offset=0.010))
        objs.append(build_wing_patch(f'FrostLE{sign}', spec.wing, sign, 0.02, 0.985, 0.0, 0.016,
                                     mats['accent'], coll, top=True, offset=0.011, nu=20, nv=1))
        if spec.levcons:
            objs.append(build_wing_patch(f'LevconBlue{sign}', spec.levcons, sign, 0.10, 0.92,
                                         0.12, 0.90, mats['secondary'], coll, top=True,
                                         offset=0.010, nu=6, nv=5))
        pts = [wing_point(spec.wing, sign, 0.10 + i * 0.82 / 9, 0.52, 0.012, True) for i in range(10)]
        objs.append(add_polyline(f'FrostLine{sign}', pts, 0.011, mats['glow'], coll))
        if spec.fins:
            fin = spec.fins[0]
            objs.append(build_fin_patch(f'FinCamo{sign}', fin, sign, 0.22, 0.62, 0.35, 0.98,
                                        1, mats['secondary'], coll, offset=0.008, nu=5, nv=6))
            objs.append(build_fin_patch(f'FinCamo2{sign}', fin, sign, 0.64, 0.99, 0.05, 0.95,
                                        1, mats['secondary'], coll, offset=0.008, nu=4, nv=6))
            objs.append(_fin_edge_line(f'FinCyan{sign}', spec, sign, 1, 0.06,
                                       mats['glow'], coll, radius=0.009))
    # Warm-grey blue band down the fuselage sides.
    for side in (-1, 1):
        objs.append(build_fuse_panel(f'CamoSide{side}', spec.stations, spec.profile,
                                     -spec.length * 0.36, spec.length * 0.20,
                                     0.16 if side > 0 else 0.84,
                                     0.27 if side > 0 else 0.73,
                                     mats['secondary'], coll, offset=0.007, nu=16, np=2,
                                     top=side > 0))
    return objs


LIVERIES = {
    'qingluan': livery_qingluan,
    'akari': livery_akari,
    'haneul': livery_haneul,
    'astra': livery_astra,
    'snega': livery_snega,
}


# --------------------------------------------------------------------------- #
# Assembly
# --------------------------------------------------------------------------- #

def build_jet(spec: JetSpec, mats, coll, lod: str):
    objs = []
    body = build_fuselage('Fuselage', spec.stations, spec.profile, mats['base'], coll, lod=lod,
                          bevel_width=0.012,
                          sharp_angle=18.0 if spec.profile == 'faceted' else 26.0)
    objs.append(body)
    objs.extend(build_dorsal_spine(spec, mats, coll, lod))
    objs.extend(build_intakes(spec, mats, coll, lod))

    for sign in (-1, 1):
        objs.append(build_wing('MainWing', spec.wing, sign, mats['base'], coll, lod=lod))
        if spec.lerx:
            objs.append(build_wing('LERX', spec.lerx, sign, mats['base'], coll, lod=lod,
                                   cap=True))
        if spec.canards:
            objs.append(build_wing('Canard', spec.canards, sign, mats['base'], coll, lod=lod))
        if spec.levcons:
            objs.append(build_wing('LEVCON', spec.levcons, sign, mats['base'], coll, lod=lod))
        for fin in spec.fins:
            objs.append(build_fin('Fin', fin, sign, mats['base'], coll, lod=lod))

    objs.extend(build_engine_housing(spec, mats, coll, lod))
    objs.extend(build_nozzles(spec, mats, coll, lod))
    objs.extend(build_canopy(spec, mats, coll, lod))

    gear_objs = build_gear(spec, mats, coll, lod)
    for obj in gear_objs:
        obj['part_group'] = 'gear'
    objs.extend(gear_objs)

    if lod == 'showcase':
        objs.extend(add_fuselage_panel_lines(spec, mats, coll, lod))
        objs.extend(add_wing_panel_lines(spec, mats, coll, lod))
        objs.extend(add_details(spec, mats, coll, lod))

    livery = LIVERIES.get(spec.livery)
    if livery:
        objs.extend(livery(spec, mats, coll, lod))

    if lod == 'showcase':
        objs.extend(add_fin_numbers(spec, mats, coll, lod))
        objs.extend(add_wing_numbers(spec, mats, coll, lod))

    objs.extend(add_reference_nodes(spec, coll, spec.nozzles[0].radius if spec.nozzles else 0.5))

    # Group tag defaults to body; gear objects were tagged above.
    for obj in objs:
        if 'part_group' not in obj:
            obj['part_group'] = 'body'
    return objs
