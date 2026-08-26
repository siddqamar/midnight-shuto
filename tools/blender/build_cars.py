"""
Generate original low-poly vehicle GLBs for Midnight Shuto.

Uses Blender's native Z-up coordinates so glTF Y-up export is correct:
  Blender: X right, Y forward, Z up
  glTF / Three.js after export_yup: X right, Y up, Z back (-forward)

We build cars facing +Y (forward). After load in Three.js the model is rotated
so gameplay forward remains +Z.

Usage (from repo root):
  blender --background --python tools/blender/build_cars.py
"""

from __future__ import annotations

import math
import os
import sys
import traceback
from pathlib import Path

import bmesh
import bpy

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


def parent_local(
    child: bpy.types.Object,
    parent_obj: bpy.types.Object,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> None:
    child.parent = parent_obj
    child.location = location
    child.rotation_euler = rotation


def mesh_from_bmesh(name: str, bm: bmesh.types.BMesh, collection: bpy.types.Collection) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
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
    """size is (sx, sy, sz) in Blender axes: width, length, height."""
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
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
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


def create_quad(
    name: str,
    width: float,
    height: float,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    """Quad in XZ, facing -Y (toward the driver in Blender space)."""
    bm = bmesh.new()
    half_w = width * 0.5
    half_h = height * 0.5
    v0 = bm.verts.new((-half_w, 0.0, -half_h))
    v1 = bm.verts.new((half_w, 0.0, -half_h))
    v2 = bm.verts.new((half_w, 0.0, half_h))
    v3 = bm.verts.new((-half_w, 0.0, half_h))
    face = bm.faces.new((v0, v1, v2, v3))
    uv_layer = bm.loops.layers.uv.new()
    for loop, uv in zip(face.loops, ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))):
        loop[uv_layer].uv = uv
    obj = mesh_from_bmesh(name, bm, collection)
    obj.location = location
    obj.rotation_euler = rotation
    apply_transform(obj)
    return obj


def hypot(a: float, b: float) -> float:
    return math.sqrt(a * a + b * b)


def create_torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    major_segments: int = 28,
    minor_segments: int = 10,
) -> bpy.types.Object:
    bm = bmesh.new()
    rings: list[list[bmesh.types.BMVert]] = []
    for i in range(major_segments):
        u = (i / major_segments) * math.tau
        ring: list[bmesh.types.BMVert] = []
        for j in range(minor_segments):
            v = (j / minor_segments) * math.tau
            x = (major_radius + minor_radius * math.cos(v)) * math.cos(u)
            y = (major_radius + minor_radius * math.cos(v)) * math.sin(u)
            z = minor_radius * math.sin(v)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    bm.verts.ensure_lookup_table()
    for i in range(major_segments):
        nxt = (i + 1) % major_segments
        for j in range(minor_segments):
            jn = (j + 1) % minor_segments
            bm.faces.new((rings[i][j], rings[nxt][j], rings[nxt][jn], rings[i][jn]))
    obj = mesh_from_bmesh(name, bm, collection)
    obj.location = location
    obj.rotation_euler = rotation
    apply_transform(obj)
    smooth(obj)
    return obj


def extrude_profile(
    name: str,
    profile: list[tuple[float, float]],
    half_width: float,
    collection: bpy.types.Collection,
    taper_nose: float = 0.08,
    taper_tail: float = 0.03,
) -> bpy.types.Object:
    """
    Side profile points are (forward_y, up_z) in Blender space.
    Extruded symmetrically on X (width).
    """
    ys = [p[0] for p in profile]
    y_min, y_max = min(ys), max(ys)
    span = max(1e-3, y_max - y_min)

    def width_at(forward: float) -> float:
        nose = max(0.0, (forward - (y_min + span * 0.55)) / (span * 0.45))
        tail = max(0.0, ((y_min + span * 0.35) - forward) / (span * 0.35))
        return half_width * (1.0 - nose * taper_nose - tail * taper_tail)

    bm = bmesh.new()
    left: list[bmesh.types.BMVert] = []
    right: list[bmesh.types.BMVert] = []
    for forward, up in profile:
        w = width_at(forward)
        # Blender: X width, Y forward, Z up
        left.append(bm.verts.new((-w, forward, up)))
        right.append(bm.verts.new((w, forward, up)))
    bm.verts.ensure_lookup_table()

    n = len(profile)
    for i in range(n - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    if n >= 3:
        bm.faces.new(left)
        bm.faces.new(list(reversed(right)))

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
        "interior": "sport",
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
        "interior": "hatch",
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
        "interior": "gt",
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
        "interior": "super",
    },
}


INTERIOR_THEMES = {
    "sport": {
        "leather": (0.045, 0.028, 0.03, 1.0),
        "leather_alt": (0.09, 0.05, 0.05, 1.0),
        "dash": (0.03, 0.032, 0.038, 1.0),
        "carpet": (0.025, 0.02, 0.022, 1.0),
        "headliner": (0.07, 0.065, 0.06, 1.0),
        "stitch": (0.62, 0.08, 0.1, 1.0),
        "accent": (0.55, 0.06, 0.08, 1.0),
        "wheel": (0.018, 0.018, 0.02, 1.0),
        "trim": (0.55, 0.56, 0.58, 1.0),
        "spokes": 3,
        "flat_bottom": False,
        "cluster": "analog",
    },
    "hatch": {
        "leather": (0.03, 0.032, 0.04, 1.0),
        "leather_alt": (0.12, 0.09, 0.04, 1.0),
        "dash": (0.025, 0.028, 0.032, 1.0),
        "carpet": (0.04, 0.04, 0.045, 1.0),
        "headliner": (0.08, 0.082, 0.09, 1.0),
        "stitch": (0.82, 0.62, 0.12, 1.0),
        "accent": (0.82, 0.55, 0.08, 1.0),
        "wheel": (0.02, 0.02, 0.022, 1.0),
        "trim": (0.72, 0.58, 0.16, 1.0),
        "spokes": 3,
        "flat_bottom": True,
        "cluster": "analog",
    },
    "gt": {
        "leather": (0.12, 0.08, 0.05, 1.0),
        "leather_alt": (0.06, 0.04, 0.03, 1.0),
        "dash": (0.04, 0.038, 0.036, 1.0),
        "carpet": (0.05, 0.03, 0.02, 1.0),
        "headliner": (0.14, 0.12, 0.1, 1.0),
        "stitch": (0.42, 0.28, 0.14, 1.0),
        "accent": (0.42, 0.26, 0.12, 1.0),
        "wheel": (0.04, 0.03, 0.025, 1.0),
        "trim": (0.72, 0.58, 0.28, 1.0),
        "spokes": 4,
        "flat_bottom": False,
        "cluster": "analog",
    },
    "super": {
        "leather": (0.035, 0.03, 0.032, 1.0),
        "leather_alt": (0.018, 0.018, 0.02, 1.0),
        "dash": (0.02, 0.022, 0.025, 1.0),
        "carpet": (0.02, 0.02, 0.022, 1.0),
        "headliner": (0.04, 0.038, 0.036, 1.0),
        "stitch": (0.85, 0.7, 0.12, 1.0),
        "accent": (0.9, 0.72, 0.05, 1.0),
        "wheel": (0.015, 0.015, 0.016, 1.0),
        "trim": (0.18, 0.18, 0.2, 1.0),
        "spokes": 2,
        "flat_bottom": True,
        "cluster": "digital",
    },
}


def build_steering_wheel(
    hub: tuple[float, float, float],
    theme: dict,
    mats: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    tilt: float,
) -> bpy.types.Object:
    """Wheel built in local XY (hole +Z). Empty is tilted so +Z faces the driver."""
    root = empty("steering_wheel", hub, collection)
    root.rotation_euler = (-math.pi / 2 - tilt, 0.0, 0.0)
    radius = 0.172
    rim = create_torus("wheel_rim", radius, 0.013, (0.0, 0.0, 0.0), collection, major_segments=28, minor_segments=8)
    assign(rim, mats["WheelLeather"])
    parent_local(rim, root)

    hub_disc = create_cylinder("wheel_hub", 0.028, 0.01, (0.0, 0.0, 0.0), collection, segments=14)
    assign(hub_disc, mats["WheelLeather"])
    parent_local(hub_disc, root, (0.0, 0.0, 0.0))

    badge = create_cylinder("wheel_badge", 0.016, 0.005, (0.0, 0.0, 0.0), collection, segments=12)
    assign(badge, mats["Accent"])
    parent_local(badge, root, (0.0, 0.0, 0.008))

    for side in (-1.0, 1.0):
        hand = create_sphere(f"hand_{'L' if side < 0 else 'R'}", 0.032, (0.0, 0.0, 0.0), collection, segments=8, rings=6)
        assign(hand, mats["Leather"])
        parent_local(hand, root, (side * radius * 0.82, 0.02, 0.01))

    return root


def build_seat(
    name: str,
    x: float,
    y: float,
    z: float,
    mats: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    sport: bool,
) -> None:
    width = 0.38 if sport else 0.42
    base = create_box(f"{name}_base", (width, 0.46, 0.09), (x, y, z), collection)
    cushion = create_box(f"{name}_cushion", (width * 0.86, 0.4, 0.05), (x, y + 0.01, z + 0.06), collection)
    back = create_box(
        f"{name}_back", (width, 0.12, 0.52), (x, y - 0.2, z + 0.3), collection, rotation=(-0.22, 0.0, 0.0)
    )
    head = create_box(
        f"{name}_headrest", (width * 0.62, 0.1, 0.14), (x, y - 0.28, z + 0.58), collection, rotation=(-0.1, 0.0, 0.0)
    )
    assign(base, mats["Leather"])
    assign(cushion, mats["LeatherAlt"])
    assign(back, mats["Leather"])
    assign(head, mats["Leather"])
    parent_keep(base, root)
    parent_keep(cushion, root)
    parent_keep(back, root)
    parent_keep(head, root)
    for side in (-1.0, 1.0):
        bolster = create_box(
            f"{name}_bolster_{'L' if side < 0 else 'R'}",
            (0.055, 0.4, 0.12),
            (x + side * width * 0.48, y, z + 0.08),
            collection,
        )
        assign(bolster, mats["LeatherAlt"])
        parent_keep(bolster, root)
        side_wing = create_box(
            f"{name}_wing_{'L' if side < 0 else 'R'}",
            (0.05, 0.1, 0.36),
            (x + side * width * 0.48, y - 0.18, z + 0.28),
            collection,
            rotation=(-0.22, 0.0, 0.0),
        )
        assign(side_wing, mats["Leather"])
        parent_keep(side_wing, root)
    stitch = create_box(f"{name}_stitch", (0.012, 0.36, 0.012), (x, y + 0.02, z + 0.09), collection)
    assign(stitch, mats["Stitch"])
    parent_keep(stitch, root)


def build_interior(
    spec: dict,
    mats: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    cabin_profile: list[tuple[float, float]],
    half_w: float,
) -> None:
    theme = INTERIOR_THEMES[spec["interior"]]
    cabin_front_y = cabin_profile[-1][0]
    cabin_rear_y = cabin_profile[0][0]
    cabin_top_z = max(z for _, z in cabin_profile)
    belt_z = cabin_profile[-1][1]
    cabin_len = max(0.8, cabin_front_y - cabin_rear_y)
    driver_x = -half_w * 0.34
    pass_x = half_w * 0.34
    seat_y = cabin_rear_y + cabin_len * 0.38
    floor_z = belt_z - 0.42
    dash_y = cabin_front_y - 0.42
    dash_z = belt_z - 0.04
    sport = spec["interior"] in ("sport", "hatch", "super")

    floor = create_box(
        "cabin_floor",
        (spec["width"] * 0.72, cabin_len * 0.92, 0.05),
        (0.0, (cabin_front_y + cabin_rear_y) * 0.5, floor_z),
        collection,
    )
    assign(floor, mats["Carpet"])
    parent_keep(floor, root)

    tunnel = create_box(
        "center_tunnel",
        (0.22, cabin_len * 0.7, 0.16),
        (0.0, seat_y + 0.12, floor_z + 0.1),
        collection,
    )
    assign(tunnel, mats["Plastic"])
    parent_keep(tunnel, root)

    shifter = create_cylinder(
        "shifter_boot",
        0.04,
        0.08,
        (0.0, seat_y + 0.22, floor_z + 0.2),
        collection,
        segments=10,
    )
    assign(shifter, mats["Leather"])
    parent_keep(shifter, root)
    knob = create_sphere("shifter_knob", 0.032, (0.0, seat_y + 0.22, floor_z + 0.28), collection, segments=10, rings=6)
    assign(knob, mats["WheelTrim"])
    parent_keep(knob, root)

    handbrake = create_box(
        "handbrake",
        (0.03, 0.12, 0.04),
        (0.08, seat_y + 0.05, floor_z + 0.2),
        collection,
        rotation=(0.45, 0.0, 0.0),
    )
    assign(handbrake, mats["Leather"])
    parent_keep(handbrake, root)

    build_seat("seat_driver", driver_x, seat_y, floor_z + 0.16, mats, collection, root, sport)
    build_seat("seat_pass", pass_x, seat_y, floor_z + 0.16, mats, collection, root, sport)

    dash_width = spec["width"] * 0.74
    dash = create_box(
        "dashboard",
        (dash_width, 0.22, 0.14),
        (0.0, dash_y, dash_z - 0.04),
        collection,
        rotation=(-0.06, 0.0, 0.0),
    )
    assign(dash, mats["Plastic"])
    parent_keep(dash, root)

    dash_upper = create_box(
        "dash_cowl",
        (dash_width * 0.88, 0.14, 0.045),
        (0.0, dash_y + 0.06, dash_z + 0.06),
        collection,
        rotation=(-0.22, 0.0, 0.0),
    )
    assign(dash_upper, mats["Plastic"])
    parent_keep(dash_upper, root)

    defroster = create_box(
        "defroster",
        (dash_width * 0.62, 0.07, 0.01),
        (0.0, dash_y + 0.12, dash_z + 0.08),
        collection,
        rotation=(-0.4, 0.0, 0.0),
    )
    assign(defroster, mats["Dark"])
    parent_keep(defroster, root)

    for i, x in enumerate((-0.28, -0.1, 0.1, 0.28)):
        vent = create_box(
            f"dash_vent_{i}",
            (0.08, 0.03, 0.028),
            (x * dash_width * 0.7, dash_y + 0.02, dash_z + 0.04),
            collection,
        )
        assign(vent, mats["Dark"])
        parent_keep(vent, root)

    cluster_x = driver_x * 0.55
    cluster_y = dash_y - 0.02
    cluster_z = dash_z + 0.08
    binnacle = create_box(
        "cluster_binnacle",
        (0.36, 0.08, 0.04),
        (cluster_x, cluster_y + 0.03, cluster_z + 0.06),
        collection,
        rotation=(-0.55, 0.0, 0.0),
    )
    assign(binnacle, mats["Plastic"])
    parent_keep(binnacle, root)

    cluster = create_quad(
        "cluster_screen",
        0.32,
        0.14,
        (cluster_x, cluster_y - 0.01, cluster_z),
        collection,
        rotation=(0.22, 0.0, 0.0),
    )
    assign(cluster, mats["Cluster"])
    parent_keep(cluster, root)

    if spec["interior"] == "gt":
        wood = create_box(
            "dash_wood",
            (dash_width * 0.7, 0.03, 0.01),
            (0.0, dash_y - 0.02, dash_z - 0.02),
            collection,
        )
        assign(wood, mats["Wood"])
        parent_keep(wood, root)

    glove = create_box(
        "glovebox",
        (0.26, 0.07, 0.08),
        (pass_x * 0.65, dash_y - 0.06, dash_z - 0.05),
        collection,
    )
    assign(glove, mats["Plastic"])
    parent_keep(glove, root)

    wheel_hub = (driver_x, dash_y - 0.26, dash_z + 0.01)
    wheel = build_steering_wheel(wheel_hub, theme, mats, collection, tilt=0.38)
    parent_keep(wheel, root)
    column = create_cylinder(
        "steering_column",
        0.018,
        0.1,
        (wheel_hub[0], wheel_hub[1] + 0.14, wheel_hub[2] - 0.06),
        collection,
        rotation=(math.pi / 2 + 0.25, 0.0, 0.0),
        segments=10,
    )
    assign(column, mats["Plastic"])
    parent_keep(column, root)

    for i, x in enumerate((-0.12, 0.0, 0.12)):
        pedal = create_box(
            f"pedal_{i}",
            (0.05, 0.08, 0.016),
            (driver_x + x * 0.35, dash_y - 0.16, floor_z + 0.08),
            collection,
            rotation=(0.6, 0.0, 0.0),
        )
        assign(pedal, mats["Dark"])
        parent_keep(pedal, root)

    # A / B / C pillars follow the greenhouse so the cockpit is framed.
    glass_x = half_w * spec["glass_width"] * 0.96
    windshield_base = cabin_profile[-1]
    windshield_top = cabin_profile[-2]
    rear_base = cabin_profile[0]
    rear_top = cabin_profile[1]
    a_dy = windshield_top[0] - windshield_base[0]
    a_dz = windshield_top[1] - windshield_base[1]
    a_len = hypot(a_dy, a_dz)
    a_rot = math.atan2(a_dz, a_dy)
    for side in (-1.0, 1.0):
        pillar_a = create_box(
            f"pillar_a_{'L' if side < 0 else 'R'}",
            (0.045, a_len + 0.02, 0.055),
            (side * glass_x, (windshield_base[0] + windshield_top[0]) * 0.5, (windshield_base[1] + windshield_top[1]) * 0.5),
            collection,
            rotation=(a_rot, 0.0, side * -0.06),
        )
        assign(pillar_a, mats["Plastic"])
        parent_keep(pillar_a, root)

        sill = create_box(
            f"door_sill_{'L' if side < 0 else 'R'}",
            (0.08, cabin_len * 0.7, 0.05),
            (side * (half_w * 0.78), (cabin_front_y + cabin_rear_y) * 0.45, belt_z - 0.08),
            collection,
        )
        assign(sill, mats["Plastic"])
        parent_keep(sill, root)

        door = create_box(
            f"door_card_{'L' if side < 0 else 'R'}",
            (0.05, cabin_len * 0.62, 0.32),
            (side * (half_w * 0.74), seat_y + 0.1, floor_z + 0.28),
            collection,
        )
        assign(door, mats["Leather"])
        parent_keep(door, root)

        armrest = create_box(
            f"armrest_{'L' if side < 0 else 'R'}",
            (0.08, 0.28, 0.05),
            (side * (half_w * 0.68), seat_y + 0.08, floor_z + 0.32),
            collection,
        )
        assign(armrest, mats["LeatherAlt"])
        parent_keep(armrest, root)

        window_frame = create_box(
            f"window_frame_{'L' if side < 0 else 'R'}",
            (0.03, cabin_len * 0.55, 0.03),
            (side * glass_x * 0.98, (cabin_front_y + cabin_rear_y) * 0.5, belt_z + 0.02),
            collection,
        )
        assign(window_frame, mats["Plastic"])
        parent_keep(window_frame, root)

        mirror_inner = create_box(
            f"mirror_glass_{'L' if side < 0 else 'R'}",
            (0.09, 0.12, 0.02),
            (side * (half_w + 0.05), cabin_front_y - 0.55, belt_z + 0.12),
            collection,
            rotation=(0.0, 0.0, side * 0.4),
        )
        assign(mirror_inner, mats["Mirror"])
        parent_keep(mirror_inner, root)

    pillar_b_y = (cabin_front_y + cabin_rear_y) * 0.42
    for side in (-1.0, 1.0):
        pillar_b = create_box(
            f"pillar_b_{'L' if side < 0 else 'R'}",
            (0.06, 0.08, cabin_top_z - belt_z + 0.08),
            (side * glass_x * 0.9, pillar_b_y, (cabin_top_z + belt_z) * 0.5),
            collection,
        )
        assign(pillar_b, mats["Plastic"])
        parent_keep(pillar_b, root)

    c_dy = rear_top[0] - rear_base[0]
    c_dz = rear_top[1] - rear_base[1]
    c_rot = math.atan2(c_dz, c_dy)
    for side in (-1.0, 1.0):
        pillar_c = create_box(
            f"pillar_c_{'L' if side < 0 else 'R'}",
            (0.06, hypot(c_dy, c_dz) + 0.04, 0.07),
            (side * glass_x * 0.92, (rear_base[0] + rear_top[0]) * 0.5, (rear_base[1] + rear_top[1]) * 0.5),
            collection,
            rotation=(c_rot, 0.0, 0.0),
        )
        assign(pillar_c, mats["Plastic"])
        parent_keep(pillar_c, root)

    headliner = create_box(
        "headliner",
        (spec["width"] * spec["glass_width"] * 0.82, cabin_len * 0.42, 0.03),
        (0.0, (cabin_front_y + cabin_rear_y) * 0.35, cabin_top_z - 0.045),
        collection,
    )
    assign(headliner, mats["Headliner"])
    parent_keep(headliner, root)

    visor_l = create_box(
        "visor_L", (0.16, 0.06, 0.01),
        (driver_x, windshield_top[0] - 0.12, cabin_top_z - 0.07),
        collection, rotation=(0.05, 0.0, 0.0)
    )
    visor_r = create_box(
        "visor_R", (0.16, 0.06, 0.01),
        (pass_x, windshield_top[0] - 0.12, cabin_top_z - 0.07),
        collection, rotation=(0.05, 0.0, 0.0)
    )
    assign(visor_l, mats["Headliner"])
    assign(visor_r, mats["Headliner"])
    parent_keep(visor_l, root)
    parent_keep(visor_r, root)

    rearview = create_box(
        "rearview_mirror",
        (0.14, 0.03, 0.05),
        (0.0, windshield_top[0] - 0.08, cabin_top_z - 0.1),
        collection,
        rotation=(0.15, 0.0, 0.0),
    )
    assign(rearview, mats["Plastic"])
    parent_keep(rearview, root)
    rearview_glass = create_box(
        "rearview_glass",
        (0.12, 0.008, 0.04),
        (0.0, windshield_top[0] - 0.1, cabin_top_z - 0.1),
        collection,
        rotation=(0.15, 0.0, 0.0),
    )
    assign(rearview_glass, mats["Mirror"])
    parent_keep(rearview_glass, root)

    # Inner windshield pane, slightly inside the greenhouse so cockpit camera sees glass.
    wind_y = (windshield_base[0] + windshield_top[0]) * 0.5 - 0.04
    wind_z = (windshield_base[1] + windshield_top[1]) * 0.5
    wind_h = hypot(a_dy, a_dz) * 0.92
    windshield = create_quad(
        "glass_windshield",
        spec["width"] * spec["glass_width"] * 0.88,
        wind_h,
        (0.0, wind_y, wind_z),
        collection,
        rotation=(a_rot + math.pi / 2, 0.0, 0.0),
    )
    assign(windshield, mats["Windshield"])
    parent_keep(windshield, root)

    for i, side in enumerate((-0.18, 0.18)):
        wiper = create_box(
            f"wiper_{i}",
            (0.012, 0.42, 0.012),
            (side, windshield_base[0] - 0.02, belt_z + 0.02),
            collection,
            rotation=(a_rot + 0.15, 0.0, side * 0.4),
        )
        assign(wiper, mats["Dark"])
        parent_keep(wiper, root)

    for side in (-1.0, 1.0):
        sleeve = create_box(
            f"arm_sleeve_{'L' if side < 0 else 'R'}",
            (0.06, 0.18, 0.06),
            (driver_x + side * 0.16, (seat_y + wheel_hub[1]) * 0.55, floor_z + 0.38),
            collection,
            rotation=(0.85, 0.0, side * 0.28),
        )
        assign(sleeve, mats["LeatherAlt"])
        parent_keep(sleeve, root)

    # Camera sockets in Blender space: X right, Y forward, Z up.
    eye_y = seat_y + 0.08
    eye_z = min(floor_z + 0.64, cabin_top_z - 0.2)
    cockpit = empty("cam_cockpit", (driver_x * 0.78, eye_y, eye_z), collection)
    parent_keep(cockpit, root)
    cockpit_look = empty("cam_cockpit_look", (driver_x * 0.12, cabin_front_y + 6.0, belt_z - 0.08), collection)
    parent_keep(cockpit_look, root)

    dash_cam = empty("cam_dash", (0.0, dash_y - 0.08, dash_z + 0.22), collection)
    parent_keep(dash_cam, root)
    dash_look = empty("cam_dash_look", (0.0, cabin_front_y + 7.5, belt_z - 0.18), collection)
    parent_keep(dash_look, root)

    hood_cam = empty("cam_hood", (0.0, cabin_front_y + 0.32, belt_z + 0.16), collection)
    parent_keep(hood_cam, root)
    hood_look = empty("cam_hood_look", (0.0, cabin_front_y + 14.0, belt_z - 0.22), collection)
    parent_keep(hood_look, root)

    light_anchor = empty("interior_light", (0.0, seat_y + 0.1, floor_z + 0.55), collection)
    parent_keep(light_anchor, root)


def build_wheel(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    width: float,
    collection: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    root = empty(name, location, collection)

    # Default cylinder is along Z; rotate to axle along X (sideways)
    axle_rot = (0.0, math.pi / 2, 0.0)

    tire = create_cylinder(f"{name}_tire", radius, width, (0, 0, 0), collection, rotation=axle_rot, segments=32)
    assign(tire, mats["Rubber"])
    smooth(tire)
    parent_keep(tire, root)

    sidewall = create_cylinder(f"{name}_sidewall", radius * 0.88, width * 1.015, (0, 0, 0), collection, rotation=axle_rot, segments=32)
    assign(sidewall, mats["TireWall"])
    smooth(sidewall)
    parent_keep(sidewall, root)

    rim = create_cylinder(f"{name}_rim", radius * 0.62, width * 0.58, (0, 0, 0), collection, rotation=axle_rot, segments=24)
    assign(rim, mats["Rim"])
    smooth(rim)
    parent_keep(rim, root)

    hub = create_cylinder(f"{name}_hub", radius * 0.18, width * 0.62, (0, 0, 0), collection, rotation=axle_rot, segments=12)
    assign(hub, mats["Chrome"])
    parent_keep(hub, root)

    disc = create_cylinder(f"{name}_disc", radius * 0.46, width * 0.1, (0, 0, 0), collection, rotation=axle_rot, segments=20)
    assign(disc, mats["Brake"])
    parent_keep(disc, root)

    caliper = create_box(
        f"{name}_caliper", (width * 0.16, radius * 0.22, radius * 0.36),
        (width * 0.42, radius * 0.14, 0.0), collection
    )
    assign(caliper, mats["Caliper"])
    parent_keep(caliper, root)

    for i in range(7):
        angle = (i / 7.0) * math.tau
        spoke = create_box(
            f"{name}_spoke_{i}",
            (width * 0.12, radius * 0.08, radius * 0.55),
            (0.0, math.sin(angle) * radius * 0.28, math.cos(angle) * radius * 0.28),
            collection,
            rotation=(angle, 0.0, 0.0),
        )
        assign(spoke, mats["Rim"])
        parent_keep(spoke, root)

        lug = create_cylinder(
            f"{name}_lug_{i}", radius * 0.052, width * 0.68,
            (0.0, math.sin(angle) * radius * 0.18, math.cos(angle) * radius * 0.18),
            collection, rotation=axle_rot, segments=8
        )
        assign(lug, mats["Chrome"])
        parent_keep(lug, root)

    return root


def build_vehicle(vehicle_id: str, spec: dict) -> Path:
    reset_scene()
    collection = bpy.context.scene.collection
    root = empty("CarRoot", (0.0, 0.0, 0.0), collection)
    theme = INTERIOR_THEMES[spec["interior"]]

    mats = {
        "BodyPaint": make_material("BodyPaint", spec["paint"], metallic=0.64, roughness=0.2),
        "Glass": make_material("Glass", (0.035, 0.075, 0.12, 0.74), metallic=0.28, roughness=0.07, alpha=0.74),
        "Windshield": make_material("Windshield", (0.55, 0.7, 0.82, 0.14), metallic=0.05, roughness=0.04, alpha=0.14),
        "Trim": make_material("Trim", (0.06, 0.07, 0.09, 1.0), metallic=0.35, roughness=0.55),
        "Chrome": make_material("Chrome", (0.85, 0.88, 0.90, 1.0), metallic=0.95, roughness=0.16),
        "Rubber": make_material("Rubber", (0.03, 0.03, 0.035, 1.0), metallic=0.0, roughness=0.95),
        "TireWall": make_material("TireWall", (0.08, 0.085, 0.095, 1.0), metallic=0.02, roughness=0.72),
        "Rim": make_material("Rim", spec["rim"], metallic=0.85, roughness=0.28),
        "Brake": make_material("Brake", (0.35, 0.36, 0.38, 1.0), metallic=0.7, roughness=0.45),
        "Caliper": make_material("Caliper", (0.68, 0.045, 0.06, 1.0), metallic=0.58, roughness=0.24),
        "Leather": make_material("Leather", theme["leather"], metallic=0.02, roughness=0.72),
        "LeatherAlt": make_material("LeatherAlt", theme["leather_alt"], metallic=0.02, roughness=0.68),
        "Plastic": make_material("Plastic", theme["dash"], metallic=0.08, roughness=0.58),
        "Carpet": make_material("Carpet", theme["carpet"], metallic=0.0, roughness=0.95),
        "Headliner": make_material("Headliner", theme["headliner"], metallic=0.0, roughness=0.88),
        "Stitch": make_material("Stitch", theme["stitch"], metallic=0.0, roughness=0.6),
        "Accent": make_material("Accent", theme["accent"], metallic=0.35, roughness=0.35),
        "WheelLeather": make_material("WheelLeather", theme["wheel"], metallic=0.04, roughness=0.55),
        "WheelTrim": make_material("WheelTrim", theme["trim"], metallic=0.72, roughness=0.28),
        "Wood": make_material("Wood", (0.28, 0.16, 0.08, 1.0), metallic=0.05, roughness=0.45),
        "Mirror": make_material("Mirror", (0.55, 0.62, 0.7, 1.0), metallic=0.92, roughness=0.08),
        "Cluster": make_material(
            "Cluster",
            (0.02, 0.03, 0.04, 1.0),
            metallic=0.1,
            roughness=0.35,
            emission=(0.15, 0.55, 0.75, 1.0),
            emission_strength=0.8,
        ),
        "ClusterChrome": make_material("ClusterChrome", (0.78, 0.8, 0.84, 1.0), metallic=0.9, roughness=0.18),
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
    # profile (forward_y, up_z)
    body_profile = [(y, z + ride) for y, z in spec["body"]]
    cabin_profile = [(y, z + ride) for y, z in spec["cabin"]]

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
            (0.06, spec["length"] * 0.72, 0.10),
            (side * (half_w + 0.01), 0.05, ride + 0.22),
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

    cabin_top_z = max(z for _, z in cabin_profile)
    for side in (-1.0, 1.0):
        handle = create_box(
            f"door_handle_{'L' if side < 0 else 'R'}", (0.10, 0.20, 0.035),
            (side * (half_w + 0.012), -0.28, ride + 0.66), collection
        )
        assign(handle, mats["Chrome"])
        parent_keep(handle, root)

        vent = create_box(
            f"side_vent_{'L' if side < 0 else 'R'}", (0.025, 0.30, 0.12),
            (side * (half_w + 0.008), 0.95, ride + 0.44), collection
        )
        assign(vent, mats["Dark"])
        parent_keep(vent, root)

    build_interior(spec, mats, collection, root, cabin_profile, half_w)

    front_y = max(y for y, _ in body_profile) + 0.02
    rear_y = min(y for y, _ in body_profile) - 0.02
    front_bumper = create_box("front_bumper", (spec["width"] * 0.92, 0.16, 0.18), (0.0, front_y, ride + 0.28), collection)
    rear_bumper = create_box("rear_bumper", (spec["width"] * 0.92, 0.14, 0.16), (0.0, rear_y, ride + 0.28), collection)
    assign(front_bumper, mats["Trim"])
    assign(rear_bumper, mats["Trim"])
    parent_keep(front_bumper, root)
    parent_keep(rear_bumper, root)

    splitter = create_box("front_splitter", (spec["width"] * 0.9, 0.25, 0.055), (0.0, front_y + 0.1, ride + 0.13), collection)
    diffuser = create_box("rear_diffuser", (spec["width"] * 0.82, 0.22, 0.07), (0.0, rear_y - 0.08, ride + 0.15), collection)
    assign(splitter, mats["Dark"])
    assign(diffuser, mats["Dark"])
    parent_keep(splitter, root)
    parent_keep(diffuser, root)

    if spec["grille"] == "oval":
        grille = create_cylinder(
            "grille", 0.28, 0.06, (0.0, front_y + 0.02, ride + 0.48), collection,
            rotation=(math.pi / 2, 0, 0), segments=24
        )
        grille.scale = (1.6, 0.7, 1.0)
        apply_transform(grille)
        assign(grille, mats["Chrome"])
        parent_keep(grille, root)
        bar = create_box("grille_bar", (0.9, 0.04, 0.04), (0.0, front_y + 0.03, ride + 0.42), collection)
        assign(bar, mats["Chrome"])
        parent_keep(bar, root)
    elif spec["grille"] == "mesh":
        grille = create_box("grille", (0.85, 0.05, 0.22), (0.0, front_y + 0.02, ride + 0.38), collection)
        assign(grille, mats["Dark"])
        parent_keep(grille, root)
        for i, x in enumerate((-0.28, 0.0, 0.28)):
            bar = create_box(f"grille_bar_{i}", (0.04, 0.03, 0.18), (x, front_y + 0.04, ride + 0.38), collection)
            assign(bar, mats["Chrome"])
            parent_keep(bar, root)
    elif spec["grille"] == "vent":
        for i, x in enumerate((-0.45, -0.15, 0.15, 0.45)):
            vent = create_box(f"vent_{i}", (0.22, 0.05, 0.10), (x, front_y + 0.01, ride + 0.28), collection)
            assign(vent, mats["Dark"])
            parent_keep(vent, root)
    else:
        grille = create_box("grille", (0.95, 0.05, 0.12), (0.0, front_y + 0.02, ride + 0.36), collection)
        assign(grille, mats["Dark"])
        parent_keep(grille, root)

    light_z = ride + 0.55
    if spec["headlights"] == "round":
        for side, sx in ((-1.0, -0.55), (1.0, 0.55)):
            for j, ox in enumerate((-0.12, 0.12)):
                lamp = create_sphere(
                    f"headlight_{'L' if side < 0 else 'R'}_{j}", 0.09,
                    (sx + ox * side, front_y + 0.01, light_z + 0.08), collection
                )
                assign(lamp, mats["LightHead"])
                smooth(lamp)
                parent_keep(lamp, root)
            ind = create_sphere(
                f"indicator_{'L' if side < 0 else 'R'}", 0.06,
                (sx * 1.15, front_y + 0.01, light_z - 0.08), collection, segments=10, rings=6
            )
            assign(ind, mats["Indicator"])
            parent_keep(ind, root)
    elif spec["headlights"] == "quad":
        for side, sx in ((-1.0, -0.52), (1.0, 0.52)):
            lamp = create_box(
                f"headlight_{'L' if side < 0 else 'R'}", (0.42, 0.05, 0.14),
                (sx, front_y + 0.01, light_z + 0.05), collection
            )
            assign(lamp, mats["LightHead"])
            parent_keep(lamp, root)
            fog = create_sphere(f"fog_{'L' if side < 0 else 'R'}", 0.08, (sx, front_y + 0.02, light_z - 0.14), collection)
            assign(fog, mats["LightHead"])
            parent_keep(fog, root)
    elif spec["headlights"] == "pop":
        for side, sx in ((-1.0, -0.48), (1.0, 0.48)):
            housing = create_box(
                f"head_housing_{'L' if side < 0 else 'R'}",
                (0.38, 0.36, 0.10),
                (sx, front_y - 0.25, ride + 0.62),
                collection,
                rotation=(-0.18, 0.0, 0.0),
            )
            assign(housing, mats["BodyPaint"])
            parent_keep(housing, root)
            lamp = create_box(
                f"headlight_{'L' if side < 0 else 'R'}",
                (0.32, 0.04, 0.06),
                (sx, front_y - 0.08, ride + 0.64),
                collection,
                rotation=(-0.18, 0.0, 0.0),
            )
            assign(lamp, mats["LightHead"])
            parent_keep(lamp, root)
    else:
        for side, sx in ((-1.0, -0.52), (1.0, 0.52)):
            lamp = create_box(
                f"headlight_{'L' if side < 0 else 'R'}", (0.40, 0.05, 0.12),
                (sx, front_y + 0.01, light_z), collection
            )
            assign(lamp, mats["LightHead"])
            parent_keep(lamp, root)
            ind = create_box(
                f"indicator_{'L' if side < 0 else 'R'}", (0.12, 0.04, 0.08),
                (sx * 1.28, front_y + 0.01, light_z - 0.02), collection
            )
            assign(ind, mats["Indicator"])
            parent_keep(ind, root)

    if spec["class"] == "turbo_hatch":
        for side, sx in ((-1.0, -0.62), (1.0, 0.62)):
            lamp = create_box(
                f"brake_light_{'L' if side < 0 else 'R'}", (0.18, 0.05, 0.32),
                (sx, rear_y - 0.01, ride + 0.72), collection
            )
            assign(lamp, mats["LightTail"])
            parent_keep(lamp, root)
    elif spec["class"] == "grand_tourer":
        for side, sx in ((-1.0, -0.58), (1.0, 0.58)):
            lamp = create_sphere(
                f"brake_light_{'L' if side < 0 else 'R'}", 0.14,
                (sx, rear_y - 0.01, ride + 0.58), collection
            )
            lamp.scale = (1.0, 0.4, 0.7)
            apply_transform(lamp)
            assign(lamp, mats["LightTail"])
            parent_keep(lamp, root)
        chrome = create_box("rear_chrome", (0.7, 0.03, 0.04), (0.0, rear_y - 0.02, ride + 0.72), collection)
        assign(chrome, mats["Chrome"])
        parent_keep(chrome, root)
    else:
        for side, sx in ((-1.0, -0.55), (1.0, 0.55)):
            lamp = create_box(
                f"brake_light_{'L' if side < 0 else 'R'}", (0.42, 0.05, 0.12),
                (sx, rear_y - 0.01, ride + 0.58), collection
            )
            assign(lamp, mats["LightTail"])
            parent_keep(lamp, root)

    if spec["hood_scoop"]:
        scoop = create_box(
            "hood_scoop", (0.42, 0.36, 0.08), (0.0, 0.85, ride + 0.92), collection, rotation=(-0.12, 0.0, 0.0)
        )
        assign(scoop, mats["Trim"])
        parent_keep(scoop, root)

    if spec["spoiler"]:
        wing_y = rear_y + 0.35 if spec["class"] == "turbo_hatch" else rear_y + 0.55
        wing_z = cabin_top_z + 0.08 if spec["class"] == "turbo_hatch" else ride + 0.95
        wing = create_box(
            "spoiler_wing", (spec["width"] * 0.78, 0.22, 0.05), (0.0, wing_y, wing_z), collection, rotation=(-0.08, 0.0, 0.0)
        )
        assign(wing, mats["BodyPaint"])
        parent_keep(wing, root)
        for side, sx in ((-1.0, -0.45), (1.0, 0.45)):
            stand = create_box(
                f"spoiler_stand_{'L' if side < 0 else 'R'}", (0.05, 0.06, 0.18),
                (sx, wing_y + 0.02, wing_z - 0.12), collection
            )
            assign(stand, mats["Trim"])
            parent_keep(stand, root)

    for side, sx in ((-1.0, -half_w - 0.06), (1.0, half_w + 0.06)):
        mirror = create_box(
            f"mirror_{'L' if side < 0 else 'R'}", (0.14, 0.18, 0.08),
            (sx, 0.35, ride + 0.95), collection
        )
        assign(mirror, mats["BodyPaint"])
        parent_keep(mirror, root)

    for i, x in enumerate(spec["exhausts"]):
        ex = create_cylinder(
            f"exhaust_{i}", 0.055, 0.18, (x, rear_y - 0.08, ride + 0.22), collection,
            rotation=(math.pi / 2, 0, 0), segments=12
        )
        assign(ex, mats["Chrome"])
        parent_keep(ex, root)

    under = create_box(
        "undertray", (spec["width"] * 0.85, spec["length"] * 0.85, 0.06),
        (0.0, 0.0, ride + 0.12), collection
    )
    assign(under, mats["Dark"])
    parent_keep(under, root)

    wr = spec["wheel_radius"]
    wx = spec["wheel_x"]
    # Blender positions: (x, y_forward, z_up)
    for wname, loc in (
        ("wheel_fl", (-wx, spec["front_axle"], wr)),
        ("wheel_fr", (wx, spec["front_axle"], wr)),
        ("wheel_rl", (-wx, spec["rear_axle"], wr)),
        ("wheel_rr", (wx, spec["rear_axle"], wr)),
    ):
        wheel = build_wheel(wname, loc, wr, spec["wheel_width"], collection, mats)
        parent_keep(wheel, root)

    meta = empty("collision_meta", (0.0, 0.0, 0.5), collection)
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
