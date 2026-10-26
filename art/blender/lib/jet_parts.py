"""Reusable aircraft sub-assemblies: intakes, nozzles, canopy, gear, details."""

from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Vector

from blender_utils import (
    add_box, add_cylinder, add_polyline, add_sphere, add_text, bm_to_object,
    create_mesh_object, finalize, place_text, select_only, shade_smooth,
)
from geometry import (
    PROFILES, Station, build_fin_patch, build_fuse_panel, build_flat_plate,
    build_fuselage, build_intake, build_nozzle, build_torus, build_wing,
    build_wing_patch, build_wing_shape, build_wing_strip, fin_surface_point,
    fuse_point, station_at, wing_point,
)
from jet_specs import CanopySpec, GearSpec, IntakeSpec, JetSpec, NozzleSpec, fuse_top_at


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def add_empty(name: str, location=(0, 0, 0), coll=None, size: float = 0.15):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = size
    obj.location = location
    if coll is not None:
        coll.objects.link(obj)
    return obj


def parent_keep(obj, parent) -> None:
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()


def fuse_bottom_at(stations, y: float, profile_key: str) -> float:
    st = station_at(stations, y)
    return st.z - st.bottom


def _sign_list(spec: JetSpec, x: float) -> list[int]:
    return [0] if abs(x) < 1e-6 else [-1, 1]


# --------------------------------------------------------------------------- #
# Dorsal spine / fairing
# --------------------------------------------------------------------------- #

def build_dorsal_spine(spec: JetSpec, mats, coll, lod: str):
    if not spec.dorsal_spine:
        return []
    n = 18 if lod == 'showcase' else 8
    y0 = -spec.length * 0.46
    y1 = spec.canopy.y_back - 0.10 if spec.canopy else spec.length * 0.08
    stations = []
    for i in range(n):
        t = i / (n - 1)
        y = y0 + (y1 - y0) * t
        top_z = fuse_top_at(spec.stations, y)
        # A proper dorsal hump: high behind the cockpit, tapering into the tail.
        hump = math.sin(math.pi * min(1.0, max(0.0, (t * 0.85 + 0.10)))) ** 0.65
        width = 0.22 + 0.36 * hump
        stations.append(Station(y=y, width=width * 0.5, top=0.14 + 0.30 * hump,
                                bottom=0.26, z=top_z - 0.08))
    obj = build_fuselage('DorsalSpine', stations, 'round', mats['secondary'], coll,
                         lod=lod, bevel_width=0.010)
    # Accent centre stripe on top of the spine.
    if lod == 'showcase':
        pts = []
        for i in range(n):
            t = i / (n - 1)
            y = y0 + (y1 - y0) * t
            idx = min(len(stations) - 1, i)
            st = stations[idx]
            pts.append((0.0, y, st.z + st.top + 0.004))
        line = add_polyline('SpineStripe', pts, 0.016, mats['accent'], coll)
        return [obj, line]
    return [obj]


# --------------------------------------------------------------------------- #
# Intakes
# --------------------------------------------------------------------------- #

def build_intakes(spec: JetSpec, mats, coll, lod: str):
    objs = []
    for idx, intake in enumerate(spec.intakes):
        for sign in _sign_list(spec, intake.x):
            x = sign * intake.x
            parts = build_intake(
                f'Intake{idx}_{sign}', x=x, y_lip=intake.y_lip, z=intake.z,
                width=intake.width, height=intake.height, length=intake.length,
                mat_lip=mats['metal'], mat_dark=mats['structural'],
                mat_body=mats['base'], coll=coll, lod=lod,
                chamfer=intake.chamfer, inner_scale=intake.inner_scale,
            )
            objs.extend(parts)
            if intake.style == 'dsi' and lod == 'showcase':
                # DSI bump on the fuselage side just ahead of the lip.
                st = station_at(spec.stations, intake.y_lip + 0.65)
                bx = sign * (st.width + 0.06)
                bump = add_sphere(
                    f'DSIBump{idx}_{sign}', 1.0, (bx, intake.y_lip + 0.45, intake.z),
                    mats['base'], coll,
                    scale=(intake.dsi_size[0], intake.dsi_size[1], intake.dsi_size[2]),
                    segments=18, rings=10,
                )
                objs.append(bump)
                # Boundary-layer diverter lip plate.
                plate = build_flat_plate(
                    f'DSIPlate{idx}_{sign}',
                    [Vector((bx - 0.06, intake.y_lip + 0.25, intake.z - 0.28)),
                     Vector((bx + 0.06, intake.y_lip + 0.25, intake.z - 0.28)),
                     Vector((bx + 0.06, intake.y_lip - 0.35, intake.z - 0.22)),
                     Vector((bx - 0.06, intake.y_lip - 0.35, intake.z - 0.22))],
                    0.025, Vector((1, 0, 0)), mats['structural'], coll,
                )
                objs.append(plate)
            elif intake.style == 'caret' and lod == 'showcase':
                st = station_at(spec.stations, intake.y_lip + 0.5)
                bx = sign * (st.width + 0.08)
                div = build_flat_plate(
                    f'Splitter{idx}_{sign}',
                    [Vector((bx, intake.y_lip + 0.45, intake.z - 0.30)),
                     Vector((bx, intake.y_lip + 0.45, intake.z + 0.30)),
                     Vector((bx, intake.y_lip - 0.20, intake.z + 0.24)),
                     Vector((bx, intake.y_lip - 0.20, intake.z - 0.24))],
                    0.035, Vector((1, 0, 0)), mats['structural'], coll,
                )
                objs.append(div)
            elif intake.style == 'belly':
                # A splitter lip ahead of the belly intake.
                plate = build_flat_plate(
                    f'BellySplitter{idx}',
                    [Vector((-intake.width * 0.55, intake.y_lip + 0.35, intake.z - 0.02)),
                     Vector((intake.width * 0.55, intake.y_lip + 0.35, intake.z - 0.02)),
                     Vector((intake.width * 0.5, intake.y_lip - 0.2, intake.z - 0.12)),
                     Vector((-intake.width * 0.5, intake.y_lip - 0.2, intake.z - 0.12))],
                    0.025, Vector((0, 0, 1)), mats['structural'], coll,
                )
                objs.append(plate)
    return objs


# --------------------------------------------------------------------------- #
# Nozzles
# --------------------------------------------------------------------------- #

def build_engine_housing(spec: JetSpec, mats, coll, lod: str):
    """Wide rear deck that hides the twin nacelles, F-22 style."""
    if len(spec.nozzles) != 1 or abs(spec.nozzles[0].x) < 1e-6:
        return []
    nz = spec.nozzles[0]
    y_front = nz.y_exit + nz.length * 0.92
    y_back = nz.y_exit + 0.28
    n = 16 if lod == 'showcase' else 6
    stations = []
    for i in range(n):
        t = i / (n - 1)
        stations.append(Station(
            y=y_front + (y_back - y_front) * t,
            width=1.22 - 0.10 * t,
            top=0.24 - 0.04 * t,
            bottom=0.28 - 0.04 * t,
            z=-0.16,
        ))
    obj = build_fuselage('EngineHousing', stations, 'faceted', mats['base'], coll,
                         lod=lod, bevel_width=0.012,
                         sharp_angle=18.0 if spec.profile == 'faceted' else 26.0)
    return [obj]


def build_nozzles(spec: JetSpec, mats, coll, lod: str):
    objs = []
    for idx, nz in enumerate(spec.nozzles):
        for sign in _sign_list(spec, nz.x):
            parts = build_nozzle(
                f'Nozzle{idx}_{sign}', x=sign * nz.x, y_exit=nz.y_exit, z=nz.z,
                radius=nz.radius, length=nz.length, style=nz.style,
                mats=mats, coll=coll, lod=lod,
            )
            objs.extend(parts)
    return objs


# --------------------------------------------------------------------------- #
# Canopy + cockpit
# --------------------------------------------------------------------------- #

# Faceted greenhouse cross-section: base, lower side, shoulder, ridge.
_CANOPY_PROFILE = [(-1.0, 0.0), (-0.74, 0.42), (-0.34, 0.78), (0.0, 1.0),
                   (0.34, 0.78), (0.74, 0.42), (1.0, 0.0)]


def _canopy_surface(spec: JetSpec, canopy: CanopySpec, glass_mat, coll, lod: str,
                    name: str = 'Canopy'):
    base_z = fuse_top_at(spec.stations, (canopy.y_front + canopy.y_back) * 0.5) + canopy.base_lift
    n_y = 20 if lod == 'showcase' else 8
    verts = []
    for i in range(n_y):
        t = i / (n_y - 1)
        y = canopy.y_back + (canopy.y_front - canopy.y_back) * t
        shape = math.sin(math.pi * t)
        w = max(0.015, canopy.width * (shape ** 0.55))
        h = max(0.008, canopy.height * (shape ** 0.80))
        for px, pz in _CANOPY_PROFILE:
            verts.append(Vector((w * px, y, base_z + h * pz)))
    faces = []
    n_a = len(_CANOPY_PROFILE)
    for i in range(n_y - 1):
        for j in range(n_a - 1):
            a = i * n_a + j
            faces.append((a, a + 1, a + n_a + 1, a + n_a))
    obj = create_mesh_object(name, verts, faces, glass_mat, coll, smooth=False)
    if lod == 'showcase':
        mod = obj.modifiers.new('CanopyShell', 'SOLIDIFY')
        mod.thickness = 0.014
        mod.offset = 0.0
        finalize(obj, bevel_width=0.0, smooth=False, sharp_angle=20.0)
    else:
        shade_smooth(obj)
    return obj, base_z


def build_canopy(spec: JetSpec, mats, coll, lod: str):
    canopy = spec.canopy
    if canopy is None:
        return []
    high = lod == 'showcase'
    glass = mats['glass'] if high else mats['glass_dark']

    obj, base_z = _canopy_surface(spec, canopy, glass, coll, lod)
    objs = [obj]

    # Frame rails and bows.
    n = 14 if high else 6
    left = []
    right = []
    top = []
    for i in range(n):
        t = i / (n - 1)
        y = canopy.y_back + (canopy.y_front - canopy.y_back) * t
        shape = math.sin(math.pi * t)
        w = max(0.015, canopy.width * (shape ** 0.55))
        left.append((-w, y, base_z))
        right.append((w, y, base_z))
        top.append((0.0, y, base_z + max(0.008, canopy.height * (shape ** 0.8))))
    rail_l = add_polyline('CanopyRailL', left, 0.018, mats['metal'], coll)
    rail_r = add_polyline('CanopyRailR', right, 0.018, mats['metal'], coll)
    spine = add_polyline('CanopySpine', top, 0.012, mats['metal'], coll)
    objs.extend([rail_l, rail_r, spine])

    bows = 4 if high else 2
    for k in range(1, bows + 1):
        t = k / (bows + 1)
        y = canopy.y_back + (canopy.y_front - canopy.y_back) * t
        shape = math.sin(math.pi * t)
        w = max(0.015, canopy.width * (shape ** 0.55))
        h = max(0.008, canopy.height * (shape ** 0.8))
        pts = [(w * px, y, base_z + h * pz) for px, pz in _CANOPY_PROFILE]
        objs.append(add_polyline(f'CanopyBow{k}', pts, 0.014, mats['metal'], coll))

    # Cockpit interior (visible through the transparent canopy on the high LOD).
    if high and canopy.cockpit:
        mid = (canopy.y_front + canopy.y_back) * 0.5
        floor = add_box('CockpitFloor', (canopy.width * 0.72, (canopy.y_front - canopy.y_back) * 0.58, 0.025),
                        (0, mid, base_z + 0.018), mats['dark'], coll)
        objs.append(floor)
        seat_back = add_box('SeatBack', (0.36, 0.10, 0.46),
                            (0, canopy.y_back + 0.55, base_z + 0.26), mats['structural'], coll,
                            rotation=(math.radians(-12), 0, 0))
        seat = add_box('SeatPad', (0.32, 0.34, 0.08),
                       (0, canopy.y_back + 0.68, base_z + 0.09), mats['dark'], coll)
        headrest = add_box('Headrest', (0.24, 0.10, 0.18),
                           (0, canopy.y_back + 0.52, base_z + 0.47), mats['dark'], coll)
        objs.extend([seat_back, seat, headrest])
        dash = add_box('CockpitDash', (canopy.width * 0.62, 0.18, 0.16),
                       (0, canopy.y_front - 0.42, base_z + 0.15), mats['dark'], coll,
                       rotation=(math.radians(-18), 0, 0))
        console_l = add_box('ConsoleL', (0.10, 0.55, 0.09),
                            (-canopy.width * 0.28, mid, base_z + 0.11), mats['structural'], coll)
        console_r = add_box('ConsoleR', (0.10, 0.55, 0.09),
                            (canopy.width * 0.28, mid, base_z + 0.11), mats['structural'], coll)
        stick = add_cylinder('Stick', 0.018, 0.28, (0, mid - 0.05, base_z + 0.15),
                              mats['metal'], coll, axis='Z', vertices=8)
        hud = add_box('HUDFrame', (0.20, 0.02, 0.14),
                      (0, canopy.y_front - 0.72, base_z + 0.30), mats['metal'], coll,
                      rotation=(math.radians(-8), 0, 0))
        hud_glass = add_box('HUDGlass', (0.17, 0.006, 0.11),
                            (0, canopy.y_front - 0.73, base_z + 0.30), mats['glow_soft'], coll,
                            rotation=(math.radians(-8), 0, 0))
        objs.extend([dash, console_l, console_r, stick, hud, hud_glass])

    return objs


# --------------------------------------------------------------------------- #
# Landing gear
# --------------------------------------------------------------------------- #

def _wheel(name: str, center: Vector, radius: float, width: float, mats, coll, lod: str):
    objs = []
    seg = 20 if lod == 'showcase' else 10
    tire = build_torus(name + '_Tire', radius * 0.72, radius * 0.28,
                       (center.x, center.y, center.z), mats['dark'], coll,
                       rotation=(0, math.pi / 2, 0), major_segments=seg, minor_segments=8)
    hub = add_cylinder(name + '_Hub', radius * 0.44, width, center, mats['metal'], coll,
                       axis='X', vertices=seg, smooth=True)
    objs.extend([tire, hub])
    if lod == 'showcase':
        disc = add_cylinder(name + '_Disc', radius * 0.22, width * 1.08, center,
                            mats['structural'], coll, axis='X', vertices=seg, smooth=True)
        objs.append(disc)
    return objs


def build_gear(spec: JetSpec, mats, coll, lod: str):
    gear = spec.gear
    if gear is None:
        return []
    root = add_empty('Gear', coll=coll)
    objs = []
    high = lod == 'showcase'
    seg = 16 if high else 8

    def strut(name, x, y, top_z, bottom_z, radius=0.055):
        obj = add_cylinder(name, radius, top_z - bottom_z,
                           (x, y, (top_z + bottom_z) * 0.5), mats['metal'], coll,
                           axis='Z', vertices=12, smooth=True)
        objs.append(obj)
        # oleo sleeve
        sleeve = add_cylinder(name + '_Sleeve', radius * 1.45, (top_z - bottom_z) * 0.42,
                              (x, y, top_z - (top_z - bottom_z) * 0.22), mats['structural'],
                              coll, axis='Z', vertices=12, smooth=True)
        objs.append(sleeve)
        return obj

    # Nose gear
    nose_top = fuse_bottom_at(spec.stations, gear.nose_y, spec.profile) + 0.08
    nose_bottom = nose_top - gear.nose_strut
    strut('NoseGear', 0.0, gear.nose_y, nose_top, nose_bottom, 0.048)
    objs.extend(_wheel('NoseWheel', Vector((0.0, gear.nose_y, nose_bottom)), gear.nose_wheel,
                       0.16, mats, coll, lod))
    if gear.doors:
        door = add_box('NoseGearDoor', (0.34, 0.62, 0.022),
                       (0.0, gear.nose_y + 0.18, nose_top - 0.30), mats['base'], coll,
                       rotation=(math.radians(16), 0, 0))
        objs.append(door)
    bay = add_box('NoseGearBay', (0.42, 0.78, 0.12),
                  (0.0, gear.nose_y, nose_top + 0.04), mats['dark'], coll)
    objs.append(bay)

    # Main gear
    for sign in (-1, 1):
        main_top = fuse_bottom_at(spec.stations, gear.main_y, spec.profile) + 0.10
        main_bottom = main_top - gear.main_strut
        x = sign * gear.main_x
        strut(f'MainGear{sign}', x, gear.main_y, main_top, main_bottom, 0.062)
        objs.extend(_wheel(f'MainWheel{sign}', Vector((x, gear.main_y, main_bottom)),
                           gear.main_wheel, 0.20, mats, coll, lod))
        if gear.doors:
            door = add_box(f'MainGearDoor{sign}', (0.42, 0.72, 0.022),
                           (x, gear.main_y + 0.20, main_top - 0.32), mats['base'], coll,
                           rotation=(math.radians(14), 0, sign * math.radians(6)))
            objs.append(door)
        bay = add_box(f'MainGearBay{sign}', (0.48, 0.9, 0.12),
                      (x, gear.main_y, main_top + 0.05), mats['dark'], coll)
        objs.append(bay)

    for obj in objs:
        parent_keep(obj, root)
    return [root] + objs


# --------------------------------------------------------------------------- #
# Panel lines
# --------------------------------------------------------------------------- #

def add_fuselage_panel_lines(spec: JetSpec, mats, coll, lod: str):
    if lod != 'showcase':
        return []
    objs = []
    L = spec.length
    radius = 0.011
    ring_ys = [-0.44, -0.40, -0.36, -0.32, -0.28, -0.24, -0.20, -0.16, -0.12,
               -0.08, -0.04, 0.0, 0.05, 0.10, 0.15, 0.20, 0.26, 0.32, 0.38, 0.43, 0.47]
    for k, yn in enumerate(ring_ys):
        y = yn * L
        pts = []
        for i in range(40):
            p = i / 40
            pts.append(fuse_point(spec.stations, PROFILES[spec.profile], y, p, 0.0125))
        objs.append(add_polyline(f'PanelRing{k}', pts, radius, mats['panel'], coll, cyclic=True))
    p_values = [0.04, 0.12, 0.25, 0.38, 0.62, 0.75, 0.88, 0.96]
    for k, p in enumerate(p_values):
        pts = []
        for i in range(24):
            t = i / 23
            y = (-0.40 + 0.78 * t) * L
            pts.append(fuse_point(spec.stations, PROFILES[spec.profile], y, p, 0.0125))
        objs.append(add_polyline(f'PanelLong{k}', pts, radius * 0.85, mats['panel'], coll))
    # Centreline and the sharp chine are the two most important read lines.
    for k, p in enumerate((0.0, 0.25, 0.75)):
        pts = []
        for i in range(30):
            t = i / 29
            y = (-0.47 + 0.94 * t) * L
            pts.append(fuse_point(spec.stations, PROFILES[spec.profile], y, p, 0.0135))
        objs.append(add_polyline(f'PanelKeyLine{k}', pts, radius * 1.05, mats['panel'], coll))
    return objs


def add_wing_panel_lines(spec: JetSpec, mats, coll, lod: str):
    if lod != 'showcase':
        return []
    objs = []
    for sign in (-1, 1):
        for k, u in enumerate((0.12, 0.30, 0.48, 0.66, 0.84)):
            pts = [wing_point(spec.wing, sign, u, v, 0.0140, True) for v in [i / 14 for i in range(15)]]
            objs.append(add_polyline(f'WingSpan{sign}_{k}', pts, 0.0105, mats['panel'], coll))
        for k, v in enumerate((0.18, 0.36, 0.54, 0.72, 0.86, 0.95)):
            pts = [wing_point(spec.wing, sign, u, v, 0.0140, True) for u in [0.06 + i * 0.92 / 14 for i in range(15)]]
            objs.append(add_polyline(f'WingChord{sign}_{k}', pts, 0.0105, mats['panel'], coll))
        for k, v in enumerate((0.55, 0.82)):
            pts = [wing_point(spec.wing, sign, u, v, 0.0140, False) for u in [0.12 + i * 0.84 / 10 for i in range(11)]]
            objs.append(add_polyline(f'WingBottom{sign}_{k}', pts, 0.0095, mats['panel'], coll))
        if spec.fins:
            fin = spec.fins[0]
            for k, u in enumerate((0.3, 0.6, 0.84)):
                for side in (-1, 1):
                    pts = [fin_surface_point(fin, sign, u, v, side, 0.0120) for v in [i / 10 for i in range(11)]]
                    objs.append(add_polyline(f'FinChord{sign}_{k}_{side}', pts, 0.0075,
                                             mats['panel'], coll))
    return objs


# --------------------------------------------------------------------------- #
# Details
# --------------------------------------------------------------------------- #

def add_details(spec: JetSpec, mats, coll, lod: str):
    if lod != 'showcase':
        return []
    d = spec.details
    objs = []
    L = spec.length
    high = True

    if d.get('pitot'):
        base_y = L * 0.5
        tip = add_cylinder('Pitot', 0.022, 0.85, (0, base_y + 0.42, 0), mats['metal'], coll,
                           axis='Y', vertices=8)
        cone = add_cylinder('PitotTip', 0.001, 0.18, (0, base_y + 0.9, 0), mats['metal'], coll,
                            axis='Y', vertices=8)
        objs.extend([tip, cone])

    if d.get('irst'):
        y = L * 0.5 - 1.6
        dome = add_sphere('IRSTDome', 1.0, (0, y, -0.08), mats['glass_dark'], coll,
                          scale=(0.20, 0.26, 0.20), segments=20, rings=12)
        ring = build_torus('IRSTRing', 0.21, 0.022, (0, y, -0.08), mats['metal'], coll,
                           rotation=(math.radians(90), 0, 0), major_segments=20, minor_segments=6)
        objs.extend([dome, ring])

    if d.get('eots'):
        y = L * 0.5 - 1.15
        pts = [
            Vector((-0.22, y + 0.22, -0.55)), Vector((0.22, y + 0.22, -0.55)),
            Vector((0.18, y - 0.25, -0.60)), Vector((-0.18, y - 0.25, -0.60)),
        ]
        eots = build_flat_plate('EOTSWindow', pts, 0.02, Vector((0, 0, -1)),
                                mats['glass_dark'], coll)
        objs.append(eots)

    if d.get('refuel'):
        y = 0.5
        hatch = add_box('RefuelHatch', (0.22, 0.28, 0.025), (0, y, fuse_top_at(spec.stations, y) + 0.01),
                        mats['structural'], coll)
        objs.append(hatch)

    if d.get('aux_intakes'):
        for sign in (-1, 1):
            x = sign * max(0.45, spec.wing.root_x * 0.62)
            y = spec.wing.root_le - 0.55
            z = fuse_top_at(spec.stations, y) - 0.10
            vent = add_box(f'AuxIntake{sign}', (0.24, 0.42, 0.10), (x, y, z),
                           mats['structural'], coll, rotation=(0, 0, sign * 0.2))
            objs.append(vent)

    if d.get('sensor_windows'):
        for sign in (-1, 1):
            # nose side sensor window
            y = L * 0.5 - 2.7
            st = station_at(spec.stations, y)
            x = sign * (st.width * 0.72)
            z = 0.1
            win = add_box(f'SensorNose{sign}', (0.06, 0.30, 0.10), (x, y, z),
                          mats['glow_soft'], coll, rotation=(0, sign * 0.25, 0))
            objs.append(win)
            # wing-root sensor window
            u = 0.10
            p = wing_point(spec.wing, sign, u, 0.45, 0.012, True)
            win2 = add_box(f'SensorWing{sign}', (0.16, 0.22, 0.035), (p.x, p.y, p.z),
                           mats['glow_soft'], coll)
            objs.append(win2)

    if d.get('ew_strips'):
        # Emissive strips along the wing leading edge.
        for sign in (-1, 1):
            objs.append(build_wing_patch(
                f'EWLead{sign}', spec.wing, sign, 0.04, 0.94, 0.0, 0.025,
                mats['glow'], coll, top=True, offset=0.012, nu=18, nv=1,
            ))
            spts = [wing_point(spec.wing, sign, 0.06 + i * 0.86 / 10, 0.62, 0.012, True)
                    for i in range(11)]
            objs.append(add_polyline(f'EWStrip{sign}', spts, 0.014, mats['glow'], coll))

    if d.get('dorsal_antenna'):
        y = -spec.length * 0.12
        z = fuse_top_at(spec.stations, y) + 0.05
        ant = add_box('DorsalAntenna', (0.035, 0.34, 0.26), (0, y, z + 0.12),
                      mats['structural'], coll, rotation=(math.radians(-8), 0, 0))
        objs.append(ant)

    if d.get('serrated'):
        # Small saw-tooth plates along the wing trailing edge (F-35 style RAM).
        for sign in (-1, 1):
            for k in range(10):
                u = 0.14 + k * 0.075
                p0 = wing_point(spec.wing, sign, u, 0.995, 0.008, True)
                p1 = wing_point(spec.wing, sign, u + 0.028, 0.995, 0.008, True)
                p2 = Vector(((p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5 - 0.10, p0.z))
                tooth = build_flat_plate(f'Serration{sign}_{k}', [p0, p1, p2], 0.012,
                                         Vector((0, 0, 1)), mats['dark'], coll)
                objs.append(tooth)

    # Vent slots on the rear deck.
    for sign in (-1, 1):  # noqa: PLR1704
        for k in range(3):
            y = -1.2 - k * 0.55
            x = sign * 0.42
            z = fuse_top_at(spec.stations, y) - 0.02
            vent = add_box(f'DeckVent{sign}_{k}', (0.16, 0.22, 0.024), (x, y, z),
                           mats['panel'], coll)
            objs.append(vent)

    return objs


# --------------------------------------------------------------------------- #
# Markings
# --------------------------------------------------------------------------- #

def _fin_frame(fin, sign: int):
    cant_s = math.sin(fin.cant)
    cant_c = math.cos(fin.cant)
    span = Vector((sign * cant_s, 0.0, cant_c))
    normal = Vector((sign * cant_c, 0.0, -cant_s))
    base = Vector((sign * fin.offset, 0.0, fin.root_z))
    return base, span, normal


def add_fin_numbers(spec: JetSpec, mats, coll, lod: str):
    if not spec.fins:
        return []
    objs = []
    fin = spec.fins[0]
    for sign in (-1, 1):
        base, span, normal = _fin_frame(fin, sign)
        for side in (-1, 1):
            u = 0.60
            v = 0.55
            pos = fin_surface_point(fin, sign, u, v, side, 0.012)
            txt = add_text(f'FinNumber{sign}_{side}', spec.number, 0.9 if lod == 'showcase' else 0.85,
                           mats['marking'], coll, extrude=0.004)
            place_text(txt, pos, normal * side, span)
            objs.append(txt)
    return objs


def add_wing_numbers(spec: JetSpec, mats, coll, lod: str):
    objs = []
    for sign in (-1, 1):
        p = wing_point(spec.wing, sign, 0.58, 0.58, 0.014, True)
        txt = add_text(f'WingNumber{sign}', spec.number, 0.72 if lod == 'showcase' else 0.62,
                       mats['marking'], coll, extrude=0.003)
        place_text(txt, p, (0, 0, 1), (0, 1, 0))
        objs.append(txt)
    return objs


# --------------------------------------------------------------------------- #
# Reference / FX nodes
# --------------------------------------------------------------------------- #

def add_reference_nodes(spec: JetSpec, coll, nozzle_radius: float):
    """Empties that let QA verify orientation and let the loader place FX."""
    nodes = []
    nodes.append(add_empty('REF_NOSE', (0.0, spec.length * 0.5, 0.0), coll))
    nodes.append(add_empty('REF_TAIL', (0.0, -spec.length * 0.5, 0.0), coll))
    nodes.append(add_empty('REF_LEFT', (-spec.span * 0.5, -spec.length * 0.05, 0.0), coll))
    nodes.append(add_empty('REF_RIGHT', (spec.span * 0.5, -spec.length * 0.05, 0.0), coll))
    top_y = (spec.fins[0].root_le + spec.fins[0].tip_te) * 0.5 if spec.fins else 0.0
    nodes.append(add_empty('REF_TOP', (0.0, top_y, spec.height * 0.55), coll))
    for idx, nz in enumerate(spec.nozzles):
        for sign in _sign_list(spec, nz.x):
            nodes.append(add_empty(f'FX_FLAME_{idx}_{sign}', (sign * nz.x, nz.y_exit - 0.05, nz.z), coll))
    return nodes
