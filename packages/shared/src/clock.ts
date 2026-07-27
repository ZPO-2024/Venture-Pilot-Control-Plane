// An injectable clock so expiration/worker logic can be tested without
// sleeping. apps/api and apps/worker use SystemClock; tests use ManualClock.
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class ManualClock implements Clock {
  private current: Date;

  constructor(initial: Date = new Date()) {
    this.current = initial;
  }

  now(): Date {
    return this.current;
  }

  set(date: Date): void {
    this.current = date;
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export const systemClock = new SystemClock();
