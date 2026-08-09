<h1 align="center">Midnight Shuto</h1>

![GPT-5.6 Sol](https://img.shields.io/badge/GPT--5.6_SOL-101010?style=for-the-badge&logo=openai&logoColor=white)
![Vibe coding](https://img.shields.io/badge/VIBE_CODING-7c3aed?style=for-the-badge&logoColor=white)
![Three.js](https://img.shields.io/badge/THREE.JS-101010?style=for-the-badge&logo=threedotjs&logoColor=white)
![Browser game](https://img.shields.io/badge/BROWSER_GAME-0284c7?style=for-the-badge&logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TYPESCRIPT-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/VITE-646cff?style=for-the-badge&logo=vite&logoColor=white)

![Midnight Shuto gameplay](demo.gif)

Some memories really never fade.

I am a 90s kid, and part of me still misses the simple joy of Midtown Madness: choosing a car, finding an open road, and driving just to see where it goes.
That memory stayed with me, so I created Midnight Shuto as my own little browser game with the feeling I carried from those days.

I made it with GPT-5.6 Sol, one idea at a time, and kept it focused on the part that still feels magical: getting behind the wheel and going for a drive.

You start with an open road, a car, and a world that is yours to explore.
Drive wherever you want, pass the traffic, and enjoy a relaxed cruise without needing a mission waiting for you.

When you want a challenge, take on a street event and race the clock through checkpoints, sprints, and drift runs.
Some missions put bot cars on the route, so a clean line is not enough - you also have to beat the drivers sharing the road with you.
Earn medals, build your driver record, and come back to improve your best runs.

## Make the drive yours

The same road can feel different depending on how you set it up.

- Pick your car and change its paint color before you head out.
- Change the atmosphere between daylight, sunset, night, and rain.
- Cruise freely when you want a relaxed drive.
- Start a timed mission when you want pressure, checkpoints, opponents, and a reason to push harder.
- Switch camera views, check the map, recover your car, and pause whenever you need to reset the run.

Midnight Shuto is intentionally compact, replayable, and easy to understand: drive, explore, race, and try again.
It is built with Three.js, TypeScript, Vite, and cannon-es.

## Controls

| Key | Action |
| --- | --- |
| `WASD` or arrow keys | Drive, brake, reverse, and steer |
| `Space` | Handbrake |
| `E` | Start a nearby mission |
| `C` | Change camera |
| `M` | Expand the map |
| `R` | Recover the car |
| `Esc` or `P` | Pause |
| `F3` | Show developer telemetry |

Gamepads are supported after the first button press.

## Run locally

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite and start driving.

## Build

```bash
npm run build
```

The production output is written to `dist/` with relative paths, so it can be deployed to any static host.
