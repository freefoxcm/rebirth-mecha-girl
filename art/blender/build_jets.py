"""Headless jet builder.

Usage (called via scripts/build-jets.mjs):
    blender -b --factory-startup --python art/blender/build_jets.py -- \
        --only qingluan --out public/assets/jets --summary artifacts/jets/build

For each jet this script:
  * resets the Blender file,
  * builds the SHOWCASE and GAME levels of detail,
  * saves an editable .blend,
  * merges static meshes per material for low draw-call export,
  * exports showcase.glb / game.glb (Draco when available),
  * writes a JSON summary consumed by the Node manifest writer.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import traceback

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(HERE, 'lib'))

import blender_utils as bu  # noqa: E402
import jet_builders  # noqa: E402
import jet_specs  # noqa: E402
from geometry import station_at, wing_point  # noqa: E402


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def parse_args():
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', default='', help='comma separated jet ids')
    parser.add_argument('--out', default=os.path.join(ROOT, 'public', 'assets', 'jets'))
    parser.add_argument('--blend-dir', default=os.path.join(HERE, 'source'))
    parser.add_argument('--summary', default=os.path.join(ROOT, 'artifacts', 'jets', 'build'))
    parser.add_argument('--no-draco', action='store_true')
    return parser.parse_args(argv)


def get_ids(only: str) -> list[str]:
    if not only:
        return list(jet_specs.JET_ORDER)
    wanted = [x.strip() for x in only.split(',') if x.strip()]
    bad = [x for x in wanted if x not in jet_specs.JETS]
    if bad:
        raise SystemExit(f'unknown jet id(s): {bad}')
    return wanted


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = 'BLENDER_EEVEE'


def mesh_objects(objs):
    return [o for o in objs if o.type == 'MESH']


def empties(objs):
    return [o for o in objs if o.type == 'EMPTY']


def join_group(objs, name):
    meshes = mesh_objects(objs)
    if not meshes:
        return None
    bu.select_only(meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def merge_for_export(objs, lod_name: str):
    """Join static meshes per material to keep draw calls low."""
    groups: dict[tuple[str, str], list] = {}
    for obj in mesh_objects(objs):
        mat = obj.data.materials[0].name if obj.data.materials else 'NoMaterial'
        if mat == 'Panel_Line':
            # The thin raised seam tubes aliased into dotted black lines in the
            # browser at gameplay distance. They stay in the .blend / Cycles
            # renders but are omitted from the realtime GLB.
            continue
        group = obj.get('part_group', 'body')
        key = (group, mat)
        groups.setdefault(key, []).append(obj)
    joined = []
    for (group, mat), items in groups.items():
        name = f'{lod_name}_{group}_{mat}'
        obj = join_group(items, name)
        if obj is not None:
            joined.append(obj)
    return joined


def unique_material_names(objs) -> list[str]:
    names = []
    for obj in mesh_objects(objs):
        for slot in obj.data.materials:
            if slot and slot.name not in names:
                names.append(slot.name)
    return names


def gltf_vec(v: Vector) -> list[float]:
    # Blender (x, y, z) -> glTF (x, z, -y)
    return [round(float(v.x), 4), round(float(v.z), 4), round(float(-v.y), 4)]


def effect_data(spec) -> dict:
    flames = []
    glows = []
    for nz in spec.nozzles:
        xs = [0.0] if abs(nz.x) < 1e-6 else [-nz.x, nz.x]
        for x in xs:
            flames.append({
                'x': round(x, 4), 'y': round(nz.z, 4), 'z': round(-(nz.y_exit - 0.06), 4),
                'radius': round(nz.radius, 4), 'length': round(nz.radius * 4.6, 4),
            })
            glows.append({
                'x': round(x, 4), 'y': round(nz.z, 4), 'z': round(-nz.y_exit, 4),
                'radius': round(nz.radius, 4),
            })
    navs = []
    for sign in (-1, 1):
        p = wing_point(spec.wing, sign, 1.0, 0.72, 0.0, True)
        navs.append({'x': round(p.x, 4), 'y': round(p.z, 4), 'z': round(-p.y, 4),
                     'color': 'red' if sign < 0 else 'green'})
    return {
        'flames': flames,
        'glows': glows,
        'navs': navs,
        'gearNode': 'Gear' if spec.gear else None,
    }


def lod_stats(name: str, objs, path: str) -> dict:
    body = [o for o in objs if o.type == 'MESH' and o.get('part_group', 'body') != 'gear']
    bounds = bu.mesh_bounds(body)
    return {
        'name': name,
        'path': path.replace('\\', '/'),
        'triangles': bu.triangle_count(mesh_objects(objs)),
        'meshes': bu.count_meshes(mesh_objects(objs)),
        'materials': unique_material_names(objs),
        'bounds': bounds,
        'bytes': os.path.getsize(path) if os.path.exists(path) else 0,
    }


def build_one(jet_id: str, args) -> dict:
    t0 = time.time()
    spec = jet_specs.JETS[jet_id]
    reset()
    showcase = bu.ensure_collection('SHOWCASE')
    game = bu.ensure_collection('GAME')
    mats = bu.palette_materials(spec.palette)

    print(f'[{jet_id}] 构建 SHOWCASE…', flush=True)
    high_objs = jet_builders.build_jet(spec, mats, showcase, 'showcase')
    print(f'[{jet_id}] SHOWCASE objects={len(high_objs)}', flush=True)
    print(f'[{jet_id}] 构建 GAME…', flush=True)
    low_objs = jet_builders.build_jet(spec, mats, game, 'game')
    print(f'[{jet_id}] GAME objects={len(low_objs)}', flush=True)

    # Save editable source before merging anything.
    os.makedirs(args.blend_dir, exist_ok=True)
    blend_path = os.path.join(args.blend_dir, f'{jet_id}.blend')
    bu.set_collection_visibility(game, False)
    bu.set_collection_visibility(showcase, True)
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    print(f'[{jet_id}] saved {blend_path}', flush=True)

    out_dir = os.path.join(args.out, jet_id)
    os.makedirs(out_dir, exist_ok=True)
    results = {}

    for lod_name, coll, objs in (('showcase', showcase, high_objs), ('game', game, low_objs)):
        bu.set_collection_visibility(game, lod_name == 'game')
        bu.set_collection_visibility(showcase, lod_name == 'showcase')
        empty_nodes = empties(objs)
        merged = merge_for_export(objs, lod_name)
        export_nodes = list(merged) + empty_nodes
        path = os.path.join(out_dir, f'{lod_name}.glb')
        print(f'[{jet_id}] export {lod_name}: {len(merged)} meshes…', flush=True)
        export_info = bu.export_glb(path, export_nodes, draco=not args.no_draco)
        results[lod_name] = lod_stats(lod_name, merged, path)
        results[lod_name]['draco'] = export_info.get('draco', False)
        results[lod_name]['source_objects'] = len(objs)
        print(f'[{jet_id}] {lod_name}: tris={results[lod_name]["triangles"]} '
              f'meshes={results[lod_name]["meshes"]} bytes={results[lod_name]["bytes"]}',
              flush=True)

    summary = {
        'id': jet_id,
        'name': spec.name,
        'number': spec.number,
        'length': spec.length,
        'span': spec.span,
        'height': spec.height,
        'bounds': results['showcase']['bounds'],
        'effects': effect_data(spec),
        'showcase': results['showcase'],
        'game': results['game'],
        'blend': blend_path.replace('\\', '/'),
        'buildSeconds': round(time.time() - t0, 1),
    }
    os.makedirs(args.summary, exist_ok=True)
    with open(os.path.join(args.summary, f'{jet_id}.json'), 'w', encoding='utf-8') as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)
    print(f'[{jet_id}] done in {summary["buildSeconds"]}s', flush=True)
    return summary


def main():
    args = parse_args()
    for attr in ('out', 'blend_dir', 'summary'):
        value = getattr(args, attr)
        if not os.path.isabs(value):
            setattr(args, attr, os.path.join(ROOT, value))
    ids = get_ids(args.only)
    print(f'[build] Blender {bpy.app.version_string}; jets={ids}', flush=True)
    summaries = []
    for jet_id in ids:
        summaries.append(build_one(jet_id, args))
    out = os.path.join(args.summary, 'summary.json')
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(summaries, fh, ensure_ascii=False, indent=2)
    print(f'[build] summary -> {out}', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
