"""Shared Blender helpers for the jet asset pipeline.

Conventions
-----------
* Blender space: +Y = nose, +Z = up, X = right wing. glTF export converts to
  +Y up / -Z nose for Three.js.
* Units are metres.
* Every builder works inside a collection named SHOWCASE or GAME.
"""

from __future__ import annotations

import math
from typing import Iterable, Sequence

import bmesh
import bpy
from mathutils import Matrix, Vector


# --------------------------------------------------------------------------- #
# Scene / collections
# --------------------------------------------------------------------------- #

def read_factory_empty() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def ensure_collection(name: str, parent=None):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(coll)
    return coll


def link_object(obj, coll) -> None:
    if obj.name not in coll.objects:
        coll.objects.link(obj)


def select_only(objs: Iterable) -> None:
    bpy.ops.object.select_all(action='DESELECT')
    active = None
    for obj in objs:
        if obj is None:
            continue
        obj.select_set(True)
        active = obj
    if active is not None:
        bpy.context.view_layer.objects.active = active


# --------------------------------------------------------------------------- #
# Colour / materials
# --------------------------------------------------------------------------- #

def srgb_to_linear(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_str: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    h = hex_str.strip().lstrip('#')
    if len(h) == 3:
        h = ''.join(ch * 2 for ch in h)
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


def darken_hex(hex_str: str, factor: float) -> str:
    """Darken an sRGB hex colour (perceptual, good enough for aircraft paint)."""
    h = hex_str.strip().lstrip('#')
    if len(h) == 3:
        h = ''.join(ch * 2 for ch in h)
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    r, g, b = (max(0, min(255, round(v * factor))) for v in (r, g, b))
    return f'#{r:02x}{g:02x}{b:02x}'


def _set_input(node, name: str, value) -> None:
    socket = node.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def make_material(
    name: str,
    color: str,
    metallic: float = 0.0,
    roughness: float = 0.5,
    emission: str | None = None,
    emission_strength: float = 1.0,
    alpha: float = 1.0,
    coat: float = 0.0,
):
    """Create a small Principled BSDF material that survives glTF export."""
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (420, 0)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    base = hex_to_linear(color, alpha)
    _set_input(bsdf, 'Base Color', base)
    _set_input(bsdf, 'Metallic', metallic)
    _set_input(bsdf, 'Roughness', roughness)
    _set_input(bsdf, 'Alpha', alpha)
    if coat:
        _set_input(bsdf, 'Coat Weight', coat)
        _set_input(bsdf, 'Coat Roughness', min(1.0, roughness * 0.5))
    if emission:
        _set_input(bsdf, 'Emission Color', hex_to_linear(emission, 1.0))
        _set_input(bsdf, 'Emission Strength', emission_strength)
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    if alpha < 0.999:
        if hasattr(mat, 'blend_method'):
            mat.blend_method = 'BLEND'
        if hasattr(mat, 'surface_render_method'):
            mat.surface_render_method = 'BLENDED'
        if hasattr(mat, 'use_transparency_overlap'):
            mat.use_transparency_overlap = False
    return mat


def palette_materials(palette: dict) -> dict:
    """Build the standard material set shared by every jet.

    Keys are referenced throughout the geometry builders.
    """
    p = palette
    mats = {
        'base': make_material('Paint_Base', p['base'], metallic=0.36, roughness=0.34, coat=0.35),
        'secondary': make_material('Paint_Secondary', p['secondary'], metallic=0.4, roughness=0.38, coat=0.2),
        'accent': make_material('Paint_Accent', p['accent'], metallic=0.62, roughness=0.28, coat=0.25),
        'dark': make_material('Paint_Dark', p.get('dark', '#14171c'), metallic=0.55, roughness=0.46),
        'structural': make_material('Paint_Structural', p.get('structural', '#232a31'), metallic=0.72, roughness=0.4),
        'metal': make_material('Metal_Detail', '#aeb6bd', metallic=0.96, roughness=0.22),
        'burn': make_material('Metal_Heat', '#5f6570', metallic=0.9, roughness=0.34),
        'glass': make_material('Canopy_Glass', '#0a1620', metallic=0.55, roughness=0.06, alpha=0.42, coat=1.0),
        'glass_dark': make_material('Canopy_Glass_Dark', '#060d14', metallic=0.8, roughness=0.08),
        'glow': make_material('Glow_Emit', p.get('glow_dark', '#0c2326'), metallic=0.2, roughness=0.3,
                              emission=p['glow'], emission_strength=3.0),
        'glow_soft': make_material('Glow_Soft', p.get('glow_dark', '#0c2326'), metallic=0.2, roughness=0.4,
                                   emission=p['glow'], emission_strength=1.6),
        'marking': make_material('Paint_Marking', p.get('marking', '#e8e1d2'), metallic=0.25, roughness=0.42),
        'panel': make_material('Panel_Line', p.get('panel', '#85897f'), metallic=0.15, roughness=0.58),
        'underside': make_material('Paint_Underside', darken_hex(p['base'], 0.74),
                                   metallic=0.32, roughness=0.42),
        'radome': make_material('Paint_Radome', darken_hex(p['base'], 0.64),
                                metallic=0.2, roughness=0.5),
        'airfoil': make_material('Paint_Base', p['base'], metallic=0.36, roughness=0.34, coat=0.35),
    }
    return mats


# --------------------------------------------------------------------------- #
# Meshes
# --------------------------------------------------------------------------- #

def create_mesh_object(name: str, verts, faces, mat, coll, smooth: bool = False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    if mat is not None:
        mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    return obj


def bm_to_object(name: str, bm, mat, coll, smooth: bool = True):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    if mat is not None:
        mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    return obj


def recalc_normals(obj) -> None:
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    me.update()


def merge_verts(obj, distance: float = 0.0005) -> None:
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=distance)
    bm.to_mesh(me)
    bm.free()
    me.update()


def apply_modifiers(obj) -> None:
    select_only([obj])
    for mod in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except RuntimeError:
            obj.modifiers.remove(mod)


def bevel(obj, width: float, segments: int = 2, angle_deg: float = 32.0) -> None:
    mod = obj.modifiers.new('EdgeBevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle_deg)
    mod.miter_outer = 'MITER_ARC'
    mod.harden_normals = True
    mod.use_clamp_overlap = True
    mod.loop_slide = True


def weighted_normal(obj) -> None:
    mod = obj.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    mod.weight = 50


def mark_sharp_by_angle(obj, angle_deg: float = 38.0) -> None:
    """Blender 4.1+ uses explicit sharp edges instead of use_auto_smooth."""
    me = obj.data
    if hasattr(me, 'set_sharp_from_angle'):
        try:
            me.set_sharp_from_angle(angle=math.radians(angle_deg))
        except Exception:
            pass


def shade_smooth(obj) -> None:
    for poly in obj.data.polygons:
        poly.use_smooth = True


def shade_flat(obj) -> None:
    for poly in obj.data.polygons:
        poly.use_smooth = False


def finalize(obj, bevel_width: float = 0.0, bevel_segments: int = 2, smooth: bool = True,
             sharp_angle: float = 38.0, merge: bool = False) -> None:
    if merge:
        merge_verts(obj)
    recalc_normals(obj)
    if bevel_width > 0:
        bevel(obj, bevel_width, bevel_segments)
        weighted_normal(obj)
    # Modifiers must be applied before sharp-edge detection, otherwise the
    # bevel output is shaded as one smooth surface.
    apply_modifiers(obj)
    if smooth:
        shade_smooth(obj)
        mark_sharp_by_angle(obj, sharp_angle)
        try:
            select_only([obj])
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(sharp_angle))
        except Exception:
            pass


# --------------------------------------------------------------------------- #
# Primitive helpers
# --------------------------------------------------------------------------- #

def add_box(name: str, size: tuple[float, float, float], location, mat, coll,
            rotation=(0.0, 0.0, 0.0), bevel_width: float = 0.0, smooth: bool = False):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Move ownership to our collection.
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    if bevel_width > 0:
        finalize(obj, bevel_width=bevel_width, bevel_segments=2, smooth=smooth)
    else:
        shade_flat(obj) if not smooth else shade_smooth(obj)
    return obj


def add_cylinder(name: str, radius: float, depth: float, location, mat, coll,
                 axis: str = 'Z', vertices: int = 24, smooth: bool = True,
                 rotation=(0.0, 0.0, 0.0), bevel_width: float = 0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location,
                                        rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    if axis == 'Y':
        obj.rotation_euler[0] = math.pi / 2
    elif axis == 'X':
        obj.rotation_euler[1] = math.pi / 2
    if bevel_width > 0:
        finalize(obj, bevel_width=bevel_width, bevel_segments=2, smooth=smooth)
    elif smooth:
        shade_smooth(obj)
    return obj


def add_sphere(name: str, radius: float, location, mat, coll, scale=(1.0, 1.0, 1.0),
               segments: int = 24, rings: int = 12, smooth: bool = True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius,
                                         location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    if smooth:
        shade_smooth(obj)
    return obj


def add_text(name: str, text: str, size: float, mat, coll, extrude: float = 0.01):
    curve = bpy.data.curves.new(name, type='FONT')
    curve.body = text
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = size
    curve.extrude = extrude
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(mat)
    coll.objects.link(obj)
    select_only([obj])
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.active_object
    obj.name = name
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def add_polyline(name: str, points: Sequence[Sequence[float]], radius: float, mat, coll,
                 cyclic: bool = False, resolution: int = 2):
    curve = bpy.data.curves.new(name, type='CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.use_fill_caps = True
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for i, p in enumerate(points):
        spline.points[i].co = (p[0], p[1], p[2], 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(mat)
    coll.objects.link(obj)
    select_only([obj])
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.active_object
    obj.name = name
    shade_smooth(obj)
    return obj


def place_text(obj, location, normal=(0, 0, 1), up=(0, 1, 0), size: float = 1.0) -> None:
    """Place a text object on a surface plane.

    Blender's text lies in local XY with +Z normal. Build the local axes from
    the requested right/up/normal and scale the object.
    """
    n = Vector(normal).normalized()
    u = Vector(up).normalized()
    r = u.cross(n).normalized()
    # Re-orthogonalise in case the caller supplied a non-perpendicular pair.
    u = n.cross(r).normalized()
    mat = Matrix((
        (r.x, u.x, n.x, location[0]),
        (r.y, u.y, n.y, location[1]),
        (r.z, u.z, n.z, location[2]),
        (0.0, 0.0, 0.0, 1.0),
    ))
    obj.matrix_world = mat
    obj.scale = (size, size, size)


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #

def set_collection_visibility(coll, visible: bool) -> None:
    coll.hide_viewport = not visible
    coll.hide_render = not visible
    for obj in coll.all_objects:
        obj.hide_set(not visible)
        obj.hide_render = not visible


def export_glb(filepath: str, objects: Sequence, draco: bool = True) -> dict:
    select_only(objects)
    kwargs = dict(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_materials='EXPORT',
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_animations=False,
        export_extras=True,
    )
    if draco:
        kwargs.update(
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=6,
        )
    try:
        bpy.ops.export_scene.gltf(**kwargs)
        return {'draco': draco, 'path': filepath}
    except Exception as exc:  # noqa: BLE001 - exporter raises many types
        if not draco:
            raise
        print(f'[export] Draco failed ({exc}); retrying without compression')
        kwargs.pop('export_draco_mesh_compression_enable', None)
        kwargs.pop('export_draco_mesh_compression_level', None)
        bpy.ops.export_scene.gltf(**kwargs)
        return {'draco': False, 'path': filepath}


def mesh_bounds(objects: Sequence) -> dict:
    """Exact world-space bounds; object.bound_box can be stale after joins."""
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != 'MESH':
            continue
        mw = obj.matrix_world
        for vert in obj.data.vertices:
            p = mw @ vert.co
            mn.x = min(mn.x, p.x)
            mn.y = min(mn.y, p.y)
            mn.z = min(mn.z, p.z)
            mx.x = max(mx.x, p.x)
            mx.y = max(mx.y, p.y)
            mx.z = max(mx.z, p.z)
    return {
        'min': [round(v, 4) for v in mn],
        'max': [round(v, 4) for v in mx],
        'size': [round(mx.x - mn.x, 4), round(mx.y - mn.y, 4), round(mx.z - mn.z, 4)],
    }


def triangle_count(objects: Sequence) -> int:
    total = 0
    for obj in objects:
        if obj.type != 'MESH':
            continue
        me = obj.data
        total += sum(max(0, len(p.vertices) - 2) for p in me.polygons)
    return total


def count_meshes(objects: Sequence) -> int:
    return sum(1 for o in objects if o.type == 'MESH')


def clear_scene_objects() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
