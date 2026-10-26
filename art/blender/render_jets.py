"""Render turntable / three-view sheets for the jet prototypes.

Usage:
    blender -b art/blender/source/qingluan.blend --python art/blender/render_jets.py -- \
        --out artifacts/jets/renders --views hero,top,side,front --samples 64
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--out', default=os.path.join(HERE, '..', '..', 'artifacts', 'jets', 'renders'))
    p.add_argument('--views', default='hero,top,side,front')
    p.add_argument('--samples', type=int, default=64)
    p.add_argument('--resolution', default='1000x700')
    p.add_argument('--device', default='GPU')
    return p.parse_args(argv)


def look_at(obj, target: Vector):
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def model_bounds(coll):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in coll.all_objects:
        if obj.type != 'MESH':
            continue
        mw = obj.matrix_world
        for v in obj.data.vertices:
            p = mw @ v.co
            mn.x = min(mn.x, p.x)
            mn.y = min(mn.y, p.y)
            mn.z = min(mn.z, p.z)
            mx.x = max(mx.x, p.x)
            mx.y = max(mx.y, p.y)
            mx.z = max(mx.z, p.z)
    return mn, mx


def clear_helpers():
    for obj in list(bpy.data.objects):
        if obj.type in {'CAMERA', 'LIGHT'} or obj.name.startswith('RENDER_'):
            bpy.data.objects.remove(obj, do_unlink=True)


def setup_world(color=(0.06, 0.07, 0.09), strength=0.7):
    scene = bpy.context.scene
    world = scene.world or bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (*color, 1.0)
    bg.inputs[1].default_value = strength


def add_area(name, location, energy, size, color=(1, 1, 1), target=(0, 0, 0)):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, Vector(target))
    return obj


def setup_cycles(samples: int, device: str):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    if device.upper() == 'GPU':
        prefs = bpy.context.preferences.addons['cycles'].preferences
        try:
            prefs.compute_device_type = 'OPTIX'
            prefs.get_devices()
            for dev in prefs.devices:
                dev.use = dev.type == 'OPTIX'
            scene.cycles.device = 'GPU'
        except Exception as exc:  # noqa: BLE001
            print(f'[render] OptiX unavailable ({exc}); falling back to CPU')
            scene.cycles.device = 'CPU'
    else:
        scene.cycles.device = 'CPU'


def setup_ortho(camera, center: Vector, extents: Vector, view: str):
    cam = camera.data
    cam.type = 'ORTHO'
    if view == 'top':
        cam.ortho_scale = max(extents.x, extents.y) * 1.12
        camera.location = (center.x, center.y, center.z + max(extents) * 3)
        look_at(camera, center)
    elif view == 'side':
        cam.ortho_scale = max(extents.y, extents.z) * 1.12
        camera.location = (center.x + max(extents) * 3, center.y, center.z)
        look_at(camera, center)
    else:  # front
        cam.ortho_scale = max(extents.x, extents.z) * 1.12
        camera.location = (center.x, center.y + max(extents) * 3, center.z)
        look_at(camera, center)


def setup_hero(camera, center: Vector, extents: Vector):
    cam = camera.data
    cam.type = 'PERSP'
    cam.lens = 54
    dist = max(extents) * 1.16
    camera.location = (center.x + dist * 0.88, center.y + dist * 1.02, center.z + dist * 0.50)
    look_at(camera, center + Vector((0, 0, extents.z * 0.04)))


def enable_glare(scene, enabled: bool):
    """Blender 5.2 changed the compositor node API; glow is added in-engine.

    Keeping this hook as a no-op avoids coupling the render pipeline to a
    moving compositor API before the prototype is signed off.
    """
    return


def main():
    args = parse_args()
    root = os.path.dirname(os.path.dirname(HERE))
    if not os.path.isabs(args.out):
        args.out = os.path.join(root, args.out)
    scene = bpy.context.scene
    coll = bpy.data.collections.get('SHOWCASE')
    game = bpy.data.collections.get('GAME')
    if coll is None:
        raise SystemExit('SHOWCASE collection missing')
    if game is not None:
        game.hide_render = True
        for obj in list(game.all_objects):
            if obj is not None:
                obj.hide_render = True
    for obj in list(coll.all_objects):
        if obj is not None:
            obj.hide_render = False

    os.makedirs(args.out, exist_ok=True)
    clear_helpers()
    setup_cycles(args.samples, args.device)
    mn, mx = model_bounds(coll)
    center = (mn + mx) * 0.5
    extents = mx - mn
    print(f'[render] bounds min={mn} max={mx} extents={extents}', flush=True)

    res_w, res_h = (int(x) for x in args.resolution.lower().split('x'))
    scene.render.resolution_x = res_w
    scene.render.resolution_y = res_h
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'

    cam_data = bpy.data.cameras.new('RENDER_CAM')
    camera = bpy.data.objects.new('RENDER_CAM', cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    views = [v.strip() for v in args.views.split(',') if v.strip()]
    for view in views:
        # Clean up old lights, add a studio rig.
        for obj in list(bpy.data.objects):
            if obj.type == 'LIGHT' or obj.name.startswith('RENDER_FLOOR'):
                bpy.data.objects.remove(obj, do_unlink=True)
        if view == 'hero':
            setup_world((0.022, 0.03, 0.042), 0.55)
            add_area('RENDER_KEY', (center.x + extents.x * 1.1, center.y + extents.y * 0.85,
                                    center.z + extents.z * 1.3),
                     4200, max(extents) * 1.0, (1.0, 0.92, 0.80), center)
            add_area('RENDER_FILL', (center.x - extents.x * 1.35, center.y + extents.y * 0.25,
                                     center.z + extents.z * 0.55),
                     1500, max(extents) * 1.4, (0.58, 0.76, 1.0), center)
            add_area('RENDER_RIM', (center.x - extents.x * 0.2, center.y - extents.y * 1.3,
                                    center.z + extents.z * 0.8),
                     3200, max(extents) * 0.7, (1.0, 0.72, 0.42), center)
            add_area('RENDER_TOP', (center.x, center.y, center.z + extents.z * 2.2),
                     2600, max(extents) * 1.3, (0.85, 0.92, 1.0), center)
            bpy.ops.mesh.primitive_plane_add(size=max(extents) * 12,
                                             location=(center.x, center.y, mn.z - 0.04))
            floor = bpy.context.active_object
            floor.name = 'RENDER_FLOOR'
            mat = bpy.data.materials.get('RENDER_FLOOR_MAT') or bpy.data.materials.new('RENDER_FLOOR_MAT')
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes.get('Principled BSDF')
            bsdf.inputs['Base Color'].default_value = (0.012, 0.016, 0.021, 1)
            bsdf.inputs['Roughness'].default_value = 0.22
            bsdf.inputs['Metallic'].default_value = 0.55
            floor.data.materials.append(mat)
            enable_glare(scene, True)
            scene.view_settings.exposure = 0.55
            setup_hero(camera, center, extents)
            out = os.path.join(args.out, 'hero.png')
        else:
            enable_glare(scene, False)
            scene.view_settings.exposure = 0.0
            setup_world((0.42, 0.43, 0.45), 0.9)
            add_area('RENDER_KEY', (center.x + extents.x, center.y + extents.y * 1.4,
                                    center.z + extents.z * 1.6),
                     1800, max(extents) * 1.6, (1.0, 0.98, 0.95), center)
            add_area('RENDER_FILL', (center.x - extents.x * 0.8, center.y - extents.y * 0.7,
                                     center.z + extents.z * 0.6),
                     900, max(extents) * 1.6, (0.85, 0.9, 1.0), center)
            setup_ortho(camera, center, extents, view)
            if view == 'side':
                scene.render.resolution_x, scene.render.resolution_y = res_w, max(1, int(res_w * 0.62))
            elif view == 'front':
                scene.render.resolution_x, scene.render.resolution_y = res_w, max(1, int(res_w * 0.7))
            else:
                scene.render.resolution_x, scene.render.resolution_y = res_w, res_w
            out = os.path.join(args.out, f'{view}.png')
        scene.render.filepath = out
        print(f'[render] {view} -> {out}', flush=True)
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
