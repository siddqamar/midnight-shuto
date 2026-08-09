# Vehicle model export (Blender)

Generates original low-poly GLB cars for Midnight Shuto:

| File | Class | Default paint |
|------|--------|---------------|
| `kaze.glb` | Sport Compact | Red |
| `michi.glb` | Turbo Hatch | Blue |
| `raiden.glb` | Grand Tourer | Green |
| `shogun.glb` | Supercar | Yellow |

Geometry is original and class-inspired — not licensed game assets.

## Requirements

- Blender 4.2+ (or 5.x) on `PATH`, or set `BLENDER_PATH`
- Install (Windows): `winget install BlenderFoundation.Blender`

## Export

From the repo root:

```bash
npm run models:export
```

Or directly:

```bash
blender --background --python tools/blender/build_cars.py
```

Output: `public/models/{kaze,michi,raiden,shogun}.glb`

Optional: `OUTPUT_DIR=path/to/dir` overrides the output folder.

## Node / material contract (runtime)

| Name | Role |
|------|------|
| `BodyPaint` | Recolorable body material |
| `Glass` | Cabin glass |
| `LightTail` / meshes `brake_light_*` | Brake lights |
| `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` | Wheel pivots (empties) |
| `LightHead`, `Chrome`, `Rubber`, `Rim`, `Trim` | Detail materials |

Axes: **+Y up**, **+Z forward**, ground at **y = 0**, origin near chassis center.
