export class ProviderCircuitOpenError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Provider circuit is open; retry after ${retryAfterMs}ms`);
    this.name = 'ProviderCircuitOpenError';
  }
}

export class ProviderQuotaExceededError extends Error {
  constructor(
    readonly quotaName: string,
    readonly limit: number,
    readonly requested: number,
  ) {
    super(`${quotaName} quota exceeded (${requested}/${limit})`);
    this.name = 'ProviderQuotaExceededError';
  }
}

type CircuitState = 'closed' | 'open' | 'half-open';

export class ProviderCircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private state: CircuitState = 'closed';
  private halfOpenRequestInFlight = false;

  constructor(
    private readonly failureThreshold: number,
    private readonly resetAfterMs: number,
    private readonly now: () => number = Date.now,
  ) {
    if (failureThreshold < 1) throw new RangeError('failureThreshold must be at least 1');
    if (resetAfterMs < 1) throw new RangeError('resetAfterMs must be positive');
  }

  async execute<T>(operation: () => Promise<T>, countsAsFailure: (error: unknown) => boolean) {
    this.prepareAttempt();

    try {
      const result = await operation();
      this.reset();
      return result;
    } catch (error) {
      if (countsAsFailure(error)) this.recordFailure();
      else if (this.state === 'half-open') this.reset();
      throw error;
    } finally {
      this.halfOpenRequestInFlight = false;
    }
  }

  private prepareAttempt(): void {
    if (this.state === 'half-open') {
      if (this.halfOpenRequestInFlight) {
        throw new ProviderCircuitOpenError(this.resetAfterMs);
      }
      this.halfOpenRequestInFlight = true;
      return;
    }
    if (this.state !== 'open') return;

    const elapsed = this.now() - this.openedAt;
    if (elapsed < this.resetAfterMs) {
      throw new ProviderCircuitOpenError(this.resetAfterMs - elapsed);
    }
    if (this.halfOpenRequestInFlight) throw new ProviderCircuitOpenError(this.resetAfterMs);

    this.state = 'half-open';
    this.halfOpenRequestInFlight = true;
  }

  private recordFailure(): void {
    this.failures += 1;
    if (this.state === 'half-open' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.openedAt = 0;
  }
}

export class DailyProviderQuota {
  private day = '';
  private used = 0;

  constructor(
    private readonly name: string,
    private readonly limit: number,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (limit < 1) throw new RangeError('quota limit must be at least 1');
  }

  consume(units: number): void {
    if (!Number.isInteger(units) || units < 1) {
      throw new RangeError('quota units must be a positive integer');
    }

    const currentDay = this.now().toISOString().slice(0, 10);
    if (currentDay !== this.day) {
      this.day = currentDay;
      this.used = 0;
    }

    if (this.used + units > this.limit) {
      throw new ProviderQuotaExceededError(this.name, this.limit, this.used + units);
    }
    this.used += units;
  }
}
