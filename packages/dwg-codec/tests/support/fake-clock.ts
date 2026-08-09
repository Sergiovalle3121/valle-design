import type { DwgClock } from "../../src/security/resource-budget.js";

export class FixedClock implements DwgClock {
  constructor(readonly timestamp: number) {}

  now(): number {
    return this.timestamp;
  }
}

export class SequenceClock implements DwgClock {
  #index = 0;

  constructor(readonly timestamps: readonly number[]) {}

  now(): number {
    const index = Math.min(
      this.#index,
      Math.max(0, this.timestamps.length - 1),
    );
    this.#index += 1;
    return this.timestamps[index] ?? 0;
  }
}

export class ManualClock implements DwgClock {
  constructor(public timestamp = 0) {}

  now(): number {
    return this.timestamp;
  }

  advance(milliseconds: number): void {
    this.timestamp += milliseconds;
  }
}
