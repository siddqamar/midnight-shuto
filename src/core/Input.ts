import type { InputState } from './types';
import { damp } from '../utils/math';

export class Input {
  private keys = new Set<string>();
  private steering = 0;
  private callbacks = new Map<string, Set<() => void>>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const code = event.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) event.preventDefault();
    if (!event.repeat) this.callbacks.get(code)?.forEach((callback) => callback());
    this.keys.add(code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  on(code: string, callback: () => void): void {
    if (!this.callbacks.has(code)) this.callbacks.set(code, new Set());
    this.callbacks.get(code)?.add(callback);
  }

  update(dt: number): InputState {
    const pads = navigator.getGamepads?.();
    const pad = pads?.find((candidate) => candidate?.connected);
    const keyThrottle = this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0;
    const keyBrake = this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0;
    const keySteer = (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) -
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0);

    const padSteer = pad && Math.abs(pad.axes[0] ?? 0) > 0.12 ? -(pad.axes[0] ?? 0) : 0;
    const targetSteer = keySteer || padSteer;
    this.steering = damp(this.steering, targetSteer, targetSteer ? 12 : 8, dt);

    return {
      throttle: Math.max(keyThrottle, pad?.buttons[7]?.value ?? 0),
      brake: Math.max(keyBrake, pad?.buttons[6]?.value ?? 0),
      steering: this.steering,
      handbrake: this.keys.has('Space') || Boolean(pad?.buttons[0]?.pressed)
    };
  }
}
