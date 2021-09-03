export class Benchmark {
  public static measure(): Benchmark {
    return new Benchmark();
  }

  private constructor() {
    // noop
  }

  private start = Date.now();

  public reset() {
    this.start = Date.now();
  }

  public elapsed(rawValue = false): string | number {
    const end = Date.now();
    const result = end - this.start;
    return rawValue ? result : `${(end - this.start).toFixed(0)}ms`;
  }
}
