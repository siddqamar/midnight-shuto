"""
Generate original low-poly vehicle GLBs for Midnight Shuto.

Four class-distinct arcade cars (sport coupe, turbo hatch, grand tourer, supercar).
Original geometry only — not licensed game assets.

Usage (from repo root):
  blender --background --python tools/blender/build_cars.py

Env:
  OUTPUT_DIR  output folder (default: <repo>/public/models)
"""

from __future__ import annotations

import math
import os
import sys
import traceback
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", REPO_ROOT / "public" / "models")).resolve()


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(obj: bpy.types.Object, collection: bpy.types.Collection) -> bpy.types.Object:
    collection.objects.link(obj)
    return obj


def empty(name: str, location: tuple[float, float, float], collection: bpy.types.Collection) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.12
    obj.location = location
    return link(obj, collection)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.5,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
    alpha: float = 1.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
    if emission is not None:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = emission
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    if alpha < 1.0:
        mat.blend_method = "BLEND"
        if hasattr(mat, "shadow_method"):
            mat.shadow_method = "NONE"
    return mat


def assign(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    data = obj.data
    if data.materials:
        data.materials[0] = mat
    else:
        data.materials.append(mat)


def smooth(obj: bpy.types.Object) -> None:
    for poly in obj.data.polygons:
        poly.use_smooth = True


def apply_mods(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def apply_transform(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def parent_keep(child: bpy.types.Object, parent_obj: bpy.types.Object) -> None:
    child.parent = parent_obj
    child.matrix_parent_inverse = parent_obj.matrix_world.inverted()


def mesh_from_bmesh(name: str, bm: bmesh.types.BMesh, collection: bpy.types.Collection) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    return link(obj, collection)


def create_box(
    name: str,
    size: tuple[float, float, float],
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    obj = mesh_from_bmesh(name, bm, collection)
    obj.scale = size
    obj.location = location
    obj.rotation_euler = rotation
    apply_transform(obj)
    return obj


def create_cylinder(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    rotation: tuple[float, float, float] = (0.0, 0.0, math.pi / 2),
    segments: int = 20,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius,
        depth=depth,
    )
    obj = mesh_from_bmesh(name, bm, collection)
    obj.location = location
    obj.rotation_euler = rotation
    apply_transform(obj)
    return obj


def create_sphere(
    name: str,
    radius: float,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    segments: int = 14,
    rings: int = 8,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    obj = mesh_from_bmesh(name, bm, collection)
    obj.location = location
    return obj


def extrude_profile(
    name: str,
    profile: list[tuple[float, float]],
    half_width: float,
    collection: bpy.types.Collection,
    taper_nose: float = 0.08,
    taper_tail: float = 0.03,
) -> bpy.types.Object:
    """Build a solid from closed-ish side profile points (z, y), extruded on X."""
    zs = [p[0] for p in profile]
    z_min, z_max = min(zs), max(zs)
    span = max(1e-3, z_max - z_min)

    def width_at(z: float) -> float:
        nose = max(0.0, (z - (z_min + span * 0.55)) / (span * 0.45))
        tail = max(0.0, ((z_min + span * 0.35) - z) / (span * 0.35))
        return half_width * (1.0 - nose * taper_nose - tail * taper_tail)

    bm = bmesh.new()
    left: list[bmesh.types.BMVert] = []
    right: list[bmesh.types.BMVert] = []
    for z, y in profile:
        w = width_at(z)
        left.append(bm.verts.new((-w, y, z)))
        right.append(bm.verts.new((w, y, z)))
    bm.verts.ensure_lookup_table()

    n = len(profile)
    for i in range(n - 1):
        bm.faces.new((left[i], left[i + 1], right[i + 1], right[i]))
    # end caps
    if n >= 3:
        bm.faces.new(list(reversed(left)))
        bm.faces.new(right)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_from_bmesh(name, bm, collection)

    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = 0.016
    mod.segments = 2
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(28)
    apply_mods(obj)
    smooth(obj)
    return obj


CARS = {
    "kaze": {
        "class": "sport_compact",
        "paint": (0.788, 0.157, 0.196, 1.0),
        "rim": (0.78, 0.80, 0.82, 1.0),
        "width": 1.90,
        "length": 4.34,
        "wheel_radius": 0.34,
        "wheel_width": 0.22,
        "wheel_x": 0.82,
        "front_axle": 1.28,
        "rear_axle": -1.30,
        "body": [
            (-2.10, 0.18), (-2.10, 0.62), (-1.85, 0.78), (-1.15, 0.86),
            (-0.55, 0.88), (0.55, 0.86), (1.25, 0.78), (1.75, 0.68),
            (2.05, 0.52), (2.12, 0.30), (2.12, 0.18),
        ],
        "cabin": [(-0.95, 0.86), (-0.70, 1.28), (0.35, 1.30), (0.95, 0.88)],
        "glass_width": 0.78,
        "spoiler": False,
        "hood_scoop": False,
        "grille": "bar",
        "headlights": "rect",
        "exhausts": [0.55],
        "ride": 0.18,
    },
    "michi": {
        "class": "turbo_hatch",
        "paint": (0.090, 0.396, 0.757, 1.0),
        "rim": (0.82, 0.62, 0.18, 1.0),
        "width": 1.94,
        "length": 4.20,
        "wheel_radius": 0.35,
        "wheel_width": 0.24,
        "wheel_x": 0.84,
        "front_axle": 1.22,
        "rear_axle": -1.18,
        "body": [
            (-2.00, 0.18), (-2.00, 0.78), (-1.55, 0.92), (-0.40, 0.96),
            (0.70, 0.96), (1.35, 0.88), (1.80, 0.72), (2.00, 0.48),
            (2.05, 0.28), (2.05, 0.18),
        ],
        "cabin": [(-1.35, 0.94), (-1.15, 1.42), (0.55, 1.40), (1.05, 0.96)],
        "glass_width": 0.80,
        "spoiler": True,
        "hood_scoop": True,
        "grille": "mesh",
        "headlights": "quad",
        "exhausts": [-0.50],
        "ride": 0.18,
    },
    "raiden": {
        "class": "grand_tourer",
        "paint": (0.090, 0.294, 0.196, 1.0),
        "rim": (0.83, 0.84, 0.86, 1.0),
        "width": 1.92,
        "length": 4.75,
        "wheel_radius": 0.36,
        "wheel_width": 0.23,
        "wheel_x": 0.83,
        "front_axle": 1.42,
        "rear_axle": -1.40,
        "body": [
            (-2.30, 0.18), (-2.28, 0.70), (-1.80, 0.86), (-0.90, 0.90),
            (0.40, 0.88), (1.35, 0.80), (2.00, 0.62), (2.30, 0.42),
            (2.35, 0.26), (2.35, 0.18),
        ],
        "cabin": [(-1.20, 0.90), (-0.85, 1.28), (0.45, 1.30), (0.85, 0.92)],
        "glass_width": 0.78,
        "spoiler": False,
        "hood_scoop": False,
        "grille": "oval",
        "headlights": "round",
        "exhausts": [-0.55, 0.55],
        "ride": 0.18,
    },
    "shogun": {
        "class": "supercar",
        "paint": (0.945, 0.722, 0.0, 1.0),
        "rim": (0.78, 0.80, 0.82, 1.0),
        "width": 2.05,
        "length": 4.55,
        "wheel_radius": 0.36,
        "wheel_width": 0.26,
        "wheel_x": 0.90,
        "front_axle": 1.35,
        "rear_axle": -1.28,
        "body": [
            (-2.20, 0.16), (-2.15, 0.72), (-1.40, 0.86), (-0.40, 0.82),
            (0.80, 0.70), (1.55, 0.55), (2.15, 0.38), (2.25, 0.24),
            (2.25, 0.16),
        ],
        "cabin": [(-1.05, 0.84), (-0.70, 1.18), (0.35, 1.18), (0.95, 0.78)],
        "glass_width": 0.82,
        "spoiler": True,
        "hood_scoop": False,
        "grille": "vent",
        "headlights": "pop",
        "exhausts": [-0.60, 0.60],
        "ride": 0.14,
    },
}


def build_wheel(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    width: float,
    collection: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    root = empty(name, location, collection)

    tire = create_cylinder(f"{name}_tire", radius, width, (0, 0, 0), collection, segments=24)
    assign(tire, mats["Rubber"])
    smooth(tire)
    parent_keep(tire, root)

    rim = create_cylinder(f"{name}_rim", radius * 0.58, width * 0.55, (0, 0, 0), collection, segments=18)
    assign(rim, mats["Rim"])
    smooth(rim)
    parent_keep(rim, root)

    hub = create_cylinder(f"{name}_hub", radius * 0.18, width * 0.62, (0, 0, 0), collection, segments=12)
    assign(hub, mats["Chrome"])
    parent_keep(hub, root)

    disc = create_cylinder(f"{name}_disc", radius * 0.42, width * 0.08, (0, 0, 0), collection, segments=14)
    assign(disc, mats["Brake"])
    parent_keep(disc, root)

    for i in range(5):
        angle = (i / 5.0) * math.tau
        spoke = create_box(
            f"{name}_spoke_{i}",
            (width * 0.12, radius * 0.08, radius * 0.55),
            (0.0, math.sin(angle) * radius * 0.28, math.cos(angle) * radius * 0.28),
            collection,
            rotation=(angle, 0.0, 0.0),
        )
        assign(spoke, mats["Rim"])
        parent_keep(spoke, root)

    return root


def build_vehicle(vehicle_id: str, spec: dict) -> Path:
    reset_scene()
    collection = bpy.context.scene.collection
    root = empty("CarRoot", (0.0, 0.0, 0.0), collection)

    mats = {
        "BodyPaint": make_material("BodyPaint", spec["paint"], metallic=0.58, roughness=0.26),
        "Glass": make_material("Glass", (0.05, 0.08, 0.12, 0.7), metallic=0.15, roughness=0.08, alpha=0.7),
        "Trim": make_material("Trim", (0.06, 0.07, 0.09, 1.0), metallic=0.35, roughness=0.55),
        "Chrome": make_material("Chrome", (0.85, 0.88, 0.90, 1.0), metallic=0.95, roughness=0.16),
        "Rubber": make_material("Rubber", (0.03, 0.03, 0.035, 1.0), metallic=0.0, roughness=0.95),
        "Rim": make_material("Rim", spec["rim"], metallic=0.85, roughness=0.28),
        "Brake": make_material("Brake", (0.35, 0.36, 0.38, 1.0), metallic=0.7, roughness=0.45),
        "LightHead": make_material(
            "LightHead",
            (0.9, 0.94, 1.0, 1.0),
            metallic=0.1,
            roughness=0.15,
            emission=(0.7, 0.85, 1.0, 1.0),
            emission_strength=2.2,
        ),
        "LightTail": make_material(
            "LightTail",
            (0.95, 0.12, 0.16, 1.0),
            metallic=0.1,
            roughness=0.25,
            emission=(0.7, 0.05, 0.08, 1.0),
            emission_strength=1.8,
        ),
        "Indicator": make_material(
            "Indicator",
            (1.0, 0.55, 0.08, 1.0),
            metallic=0.05,
            roughness=0.3,
            emission=(0.9, 0.35, 0.05, 1.0),
            emission_strength=1.2,
        ),
        "Dark": make_material("Dark", (0.02, 0.02, 0.025, 1.0), metallic=0.2, roughness=0.7),
    }

    half_w = spec["width"] * 0.5
    ride = spec["ride"]
    body_profile = [(z, y + ride) for z, y in spec["body"]]
    cabin_profile = [(z, y + ride) for z, y in spec["cabin"]]

    body = extrude_profile(
        "body_shell",
        body_profile,
        half_w * 0.98,
        collection,
        taper_nose=0.12 if spec["class"] == "supercar" else 0.08,
        taper_tail=0.05 if spec["class"] == "supercar" else 0.03,
    )
    assign(body, mats["BodyPaint"])
    parent_keep(body, root)

    for side in (-1.0, 1.0):
        skirt = create_box(
            f"skirt_{'L' if side < 0 else 'R'}",
            (0.06, 0.10, spec["length"] * 0.72),
            (side * (half_w + 0.01), ride + 0.22, 0.05),
            collection,
        )
        assign(skirt, mats["Trim"])
        parent_keep(skirt, root)

    glass = extrude_profile(
        "cabin_glass",
        cabin_profile,
        half_w * spec["glass_width"],
        collection,
        taper_nose=0.06,
        taper_tail=0.02,
    )
    assign(glass, mats["Glass"])
    parent_keep(glass, root)

    cabin_mid_z = (cabin_profile[0][0] + cabin_profile[-1][0]) * 0.5
    cabin_top_y = max(y for _, y in cabin_profile)
    for side in (-1.0, 1.0):
        pillar = create_box(
            f"pillar_{'L' if side < 0 else 'R'}",
            (0.06, 0.42, 0.08),
            (side * half_w * 0.72, (cabin_profile[0][1] + cabin_top_y) * 0.5, cabin_mid_z),
            collection,
            rotation=(0.12, 0.0, 0.0),
        )
        assign(pillar, mats["BodyPaint"])
        parent_keep(pillar, root)

    front_z = max(z for z, _ in body_profile) + 0.02
    rear_z = min(z for z, _ in body_profile) - 0.02
    front_bumper = create_box("front_bumper", (spec["width"] * 0.92, 0.18, 0.16), (0.0, ride + 0.28, front_z), collection)
    rear_bumper = create_box("rear_bumper", (spec["width"] * 0.92, 0.16, 0.14), (0.0, ride + 0.28, rear_z), collection)
    assign(front_bumper, mats["Trim"])
    assign(rear_bumper, mats["Trim"])
    parent_keep(front_bumper, root)
    parent_keep(rear_bumper, root)

    if spec["grille"] == "oval":
        grille = create_cylinder("grille", 0.28, 0.06, (0.0, ride + 0.48, front_z + 0.02), collection, rotation=(math.pi / 2, 0, 0), segments=24)
        grille.scale = (1.6, 1.0, 0.7)
        apply_transform(grille)
        assign(grille, mats["Chrome"])
        parent_keep(grille, root)
        bar = create_box("grille_bar", (0.9, 0.04, 0.04), (0.0, ride + 0.42, front_z + 0.03), collection)
        assign(bar, mats["Chrome"])
        parent_keep(bar, root)
    elif spec["grille"] == "mesh":
        grille = create_box("grille", (0.85, 0.22, 0.05), (0.0, ride + 0.38, front_z + 0.02), collection)
        assign(grille, mats["Dark"])
        parent_keep(grille, root)
        for i, x in enumerate((-0.28, 0.0, 0.28)):
            bar = create_box(f"grille_bar_{i}", (0.04, 0.18, 0.03), (x, ride + 0.38, front_z + 0.04), collection)
            assign(bar, mats["Chrome"])
            parent_keep(bar, root)
    elif spec["grille"] == "vent":
        for i, x in enumerate((-0.45, -0.15, 0.15, 0.45)):
            vent = create_box(f"vent_{i}", (0.22, 0.10, 0.05), (x, ride + 0.28, front_z + 0.01), collection)
            assign(vent, mats["Dark"])
            parent_keep(vent, root)
    else:
        grille = create_box("grille", (0.95, 0.12, 0.05), (0.0, ride + 0.36, front_z + 0.02), collection)
        assign(grille, mats["Dark"])
        parent_keep(grille, root)

    light_y = ride + 0.55
    if spec["headlights"] == "round":
        for side, sx in ((-1.0, -0.55), (1.0, 0.55)):
            for j, ox in enumerate((-0.12, 0.12)):
                lamp = create_sphere(f"headlight_{'L' if side < 0 else 'R'}_{j}", 0.09, (sx + ox * side, light_y + 0.08, front_z + 0.01), collection)
                assign(lamp, mats["LightHead"])
                smooth(lamp)
                parent_keep(lamp, root)
            ind = create_sphere(f"indicator_{'L' if side < 0 else 'R'}", 0.06, (sx * 1.15, light_y - 0.08, front_z + 0.01), collection, segments=10, rings=6)
            assign(ind, mats["Indicator"])
            parent_keep(ind, root)
    elif spec["headlights"] == "quad":
        for side, sx in ((-1.0, -0.52), (1.0, 0.52)):
            lamp = create_box(f"headlight_{'L' if side < 0 else 'R'}", (0.42, 0.14, 0.05), (sx, light_y + 0.05, front_z + 0.01), collection)
            assign(lamp, mats["LightHead"])
            parent_keep(lamp, root)
            fog = create_sphere(f"fog_{'L' if side < 0 else 'R'}", 0.08, (sx, light_y - 0.14, front_z + 0.02), collection)
            assign(fog, mats["LightHead"])
            parent_keep(fog, root)
    elif spec["headlights"] == "pop":
        for side, sx in ((-1.0, -0.48), (1.0, 0.48)):
            housing = create_box(
                f"head_housing_{'L' if side < 0 else 'R'}",
                (0.38, 0.10, 0.36),
                (sx, ride + 0.62, front_z - 0.25),
                collection,
                rotation=(-0.18, 0.0, 0.0),
            )
            assign(housing, mats["BodyPaint"])
            parent_keep(housing, root)
            lamp = create_box(
                f"headlight_{'L' if side < 0 else 'R'}",
                (0.32, 0.06, 0.04),
                (sx, ride + 0.64, front_z - 0.08),
                collection,
                rotation=(-0.18, 0.0, 0.0),
            )
            assign(lamp, mats["LightHead"])
            parent_keep(lamp, root)
    else:
        for side, sx in ((-1.0, -0.52), (1.0, 0.52)):
            lamp = create_box(f"headlight_{'L' if side < 0 else 'R'}", (0.40, 0.12, 0.05), (sx, light_y, front_z + 0.01), collection)
            assign(lamp, mats["LightHead"])
            parent_keep(lamp, root)
            ind = create_box(f"indicator_{'L' if side < 0 else 'R'}", (0.12, 0.08, 0.04), (sx * 1.28, light_y - 0.02, front_z + 0.01), collection)
            assign(ind, mats["Indicator"])
            parent_keep(ind, root)

    if spec["class"] == "turbo_hatch":
        for side, sx in ((-1.0, -0.62), (1.0, 0.62)):
            lamp = create_box(f"brake_light_{'L' if side < 0 else 'R'}", (0.18, 0.32, 0.05), (sx, ride + 0.72, rear_z - 0.01), collection)
            assign(lamp, mats["LightTail"])
            parent_keep(lamp, root)
    elif spec["class"] == "grand_tourer":
        for side, sx in ((-1.0, -0.58), (1.0, 0.58)):
            lamp = create_sphere(f"brake_light_{'L' if side < 0 else 'R'}", 0.14, (sx, ride + 0.58, rear_z - 0.01), collection)
            lamp.scale = (1.0, 0.7, 0.4)
            apply_transform(lamp)
            assign(lamp, mats["LightTail"])
            parent_keep(lamp, root)
        chrome = create_box("rear_chrome", (0.7, 0.04, 0.03), (0.0, ride + 0.72, rear_z - 0.02), collection)
        assign(chrome, mats["Chrome"])
        parent_keep(chrome, root)
    else:
        for side, sx in ((-1.0, -0.55), (1.0, 0.55)):
            lamp = create_box(f"brake_light_{'L' if side < 0 else 'R'}", (0.42, 0.12, 0.05), (sx, ride + 0.58, rear_z - 0.01), collection)
            assign(lamp, mats["LightTail"])
            parent_keep(lamp, root)

    if spec["hood_scoop"]:
        scoop = create_box("hood_scoop", (0.42, 0.08, 0.36), (0.0, ride + 0.92, 0.85), collection, rotation=(-0.12, 0.0, 0.0))
        assign(scoop, mats["Trim"])
        parent_keep(scoop, root)

    if spec["spoiler"]:
        wing_z = rear_z + 0.35 if spec["class"] == "turbo_hatch" else rear_z + 0.55
        wing_y = cabin_top_y + 0.08 if spec["class"] == "turbo_hatch" else ride + 0.95
        wing = create_box("spoiler_wing", (spec["width"] * 0.78, 0.05, 0.22), (0.0, wing_y, wing_z), collection, rotation=(-0.08, 0.0, 0.0))
        assign(wing, mats["BodyPaint"])
        parent_keep(wing, root)
        for side, sx in ((-1.0, -0.45), (1.0, 0.45)):
            stand = create_box(f"spoiler_stand_{'L' if side < 0 else 'R'}", (0.05, 0.18, 0.06), (sx, wing_y - 0.12, wing_z + 0.02), collection)
            assign(stand, mats["Trim"])
            parent_keep(stand, root)

    for side, sx in ((-1.0, -half_w - 0.06), (1.0, half_w + 0.06)):
        mirror = create_box(f"mirror_{'L' if side < 0 else 'R'}", (0.14, 0.08, 0.18), (sx, ride + 0.95, 0.35), collection)
        assign(mirror, mats["BodyPaint"])
        parent_keep(mirror, root)

    for i, x in enumerate(spec["exhausts"]):
        ex = create_cylinder(f"exhaust_{i}", 0.055, 0.18, (x, ride + 0.22, rear_z - 0.08), collection, rotation=(math.pi / 2, 0, 0), segments=12)
        assign(ex, mats["Chrome"])
        parent_keep(ex, root)

    under = create_box("undertray", (spec["width"] * 0.85, 0.06, spec["length"] * 0.85), (0.0, ride + 0.12, 0.0), collection)
    assign(under, mats["Dark"])
    parent_keep(under, root)

    wr = spec["wheel_radius"]
    wx = spec["wheel_x"]
    for wname, loc in (
        ("wheel_fl", (-wx, wr, spec["front_axle"])),
        ("wheel_fr", (wx, wr, spec["front_axle"])),
        ("wheel_rl", (-wx, wr, spec["rear_axle"])),
        ("wheel_rr", (wx, wr, spec["rear_axle"])),
    ):
        wheel = build_wheel(wname, loc, wr, spec["wheel_width"], collection, mats)
        parent_keep(wheel, root)

    meta = empty("collision_meta", (0.0, 0.5, 0.0), collection)
    meta["half_extent_x"] = half_w * 0.96
    meta["half_extent_y"] = 0.42
    meta["half_extent_z"] = spec["length"] * 0.47
    meta["vehicle_id"] = vehicle_id
    parent_keep(meta, root)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"{vehicle_id}.glb"

    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root

    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    print(f"[build_cars] wrote {out_path} ({out_path.stat().st_size} bytes)")
    return out_path


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for vehicle_id, spec in CARS.items():
        print(f"[build_cars] building {vehicle_id} ({spec['class']}) ...")
        written.append(build_vehicle(vehicle_id, spec))
    print("[build_cars] done:")
    for path in written:
        print(f"  - {path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[build_cars] ERROR: {exc}", file=sys.stderr)
        traceback.print_exc()
        raise SystemExit(1)
