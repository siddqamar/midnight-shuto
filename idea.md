# prompt

## objective

Build a complete browser-based 3D open-world driving game inspired by Midtown Madness.

The game must run entirely in the browser, achieve smooth FPS on mid-range laptops, and be deployable directly to GitHub Pages as a static website.

The gameplay should feel arcade-like rather than a hardcore simulator.

Do **not** build a tech demo.

Build a complete game architecture that can be expanded with more cars, missions and maps later.

---

# technology

Use modern web technologies only.

- Three.js for rendering
- TypeScript
- Vite
- Cannon-es or Rapier for vehicle physics
- GLTF/GLB models
- post-processing only when performance allows
- WebAudio API
- LocalStorage for save data
- npm ecosystem only

No backend.

Everything must work statically so it can be deployed directly on GitHub Pages.

---

# project goals

The player spawns inside a large Japanese city.

The city is completely explorable.

There are no loading screens while driving.

The player can freely drive anywhere.

At any time they may:

- explore
- begin missions
- race AI
- practice drifting
- chase checkpoints
- simply cruise around

The game should remain enjoyable even without missions.

---

# city

Create a stylized Japanese city inspired by:

- Tokyo
- Osaka
- Yokohama

Include:

- highways
- elevated roads
- tunnels
- intersections
- alleyways
- business districts
- residential streets
- bridges
- waterfront
- parking garages
- convenience stores
- gas stations
- train crossings
- traffic lights
- neon signs
- billboards
- parks

Populate the city with:

- civilian cars
- buses
- taxis
- trucks

The city should feel alive.

---

# graphics

Prioritize FPS over ultra realism.

Use:

- baked lighting where possible
- efficient shadows
- LOD
- frustum culling
- instanced meshes
- compressed textures
- texture atlases

Target:

60 FPS on average hardware.

---

# vehicle system

Implement arcade driving.

Cars should feel responsive.

Support:

- acceleration
- reverse
- hand brake
- drifting
- powersliding
- suspension
- collision damage visualization (optional)
- speedometer
- RPM meter
- gear indicator

---

# camera modes

Player can instantly switch between:

1. Chase camera
2. Far chase camera
3. Hood camera
4. Dashboard camera
5. Cinematic orbit
6. Free camera for screenshots

Camera transitions should be smooth.

---

# controls

Keyboard

- WASD
- Arrow keys

Gamepad support

Mouse support for menus.

---

# AI traffic

Civilian traffic obeys:

- lanes
- traffic lights
- speed limits
- turns
- intersections

Avoid robotic movement.

---

# AI racers

Multiple opponents.

Each racer should:

- choose racing lines
- avoid collisions
- overtake
- recover after crashes
- react to player mistakes

Difficulty:

- Easy
- Medium
- Hard

---

# mission system

Create reusable mission architecture.

Mission categories include:

## checkpoint race

Reach checkpoints before timer expires.

---

## circuit race

Multiple laps.

---

## sprint

Point A to Point B.

---

## time attack

Beat target time.

---

## traffic challenge

Finish while avoiding collisions.

---

## drift challenge

Earn drift score.

---

## police escape

Escape pursuit before timer ends.

---

## delivery mission

Deliver vehicle before timer expires.

---

## free ride

No objectives.

Simply drive.

---

# mission selection

Player opens map.

Mission icons appear.

Drive to marker.

Press interact.

Mission begins.

After completion:

- bronze
- silver
- gold

Completion is saved locally.

Player may replay missions infinitely.

---

# timing

Every mission supports:

- countdown
- pause
- finish timer
- best record
- personal best

---

# progression

Unlock:

- cars
- paint colors
- wheels
- decals

Store everything in LocalStorage.

---

# UI

Modern minimal UI.

Include:

Main Menu

Continue

New Game

Garage

Mission Select

Settings

Controls

Credits

Pause

Mini Map

Mission Tracker

Speedometer

Tachometer

Current Gear

Timer

Checkpoint Counter

FPS Counter (developer mode)

---

# garage

Player can:

Choose car

Change color

Change rims

View statistics

Future-ready architecture for upgrades.

---

# cars

Include several starter vehicles such as:

- compact hatchback
- sports coupe
- classic sedan
- modern supercar

Each with unique:

- speed
- handling
- acceleration
- braking

---

# audio

Engine sounds

Turbo

Tire screech

Collision

Rain ambience

Traffic ambience

City ambience

Mission music

Victory music

---

# weather

Support:

Sunny

Cloudy

Rain

Night

Sunset

Changing lighting accordingly.

Architecture should allow future dynamic weather.

---

# optimization

Must support:

lazy loading

texture compression

model compression

mesh optimization

object pooling

physics optimization

GPU-friendly rendering

---

# code quality

Organize using modular architecture.

Example:

```

```

```
src/

core/

physics/

vehicles/

missions/

traffic/

ai/

camera/

audio/

ui/

world/

garage/

save/

assets/

utils/
```

Avoid large files.

Each system should remain independent.

---

# save system

Automatically save:

Unlocked missions

Best times

Settings

Chosen vehicle

Garage

Statistics

---

# statistics

Track:

Distance driven

Top speed

Wins

Losses

Drifts

Play time

Missions completed

---

# developer tools

Include optional debug mode.

Toggle using F3.

Display:

FPS

Draw calls

Physics bodies

Vehicle state

AI paths

Mission triggers

---

# deployment

The final project must:

-   
build successfully with Vite  

-   
deploy directly to GitHub Pages  

-   
use relative asset paths  

-   
have zero server dependency  

-   
work offline after initial load where possible  


---

# architecture

The project should be expandable for future additions such as:

-   
multiplayer  

-   
additional cities  

-   
new cars  

-   
custom missions  

-   
pedestrians  

-   
police AI  

-   
weather system  

-   
mod support  


Do not hardcode gameplay.

Everything should be data-driven.

---

# overall goal

The finished result should feel like an early PlayStation 2 / Xbox-era open-world arcade racing game running entirely inside a modern web browser, with smooth controls, multiple camera modes, replayable missions, AI traffic, AI racers, a lively Japanese city, and an architecture that can grow into a much larger game over time.