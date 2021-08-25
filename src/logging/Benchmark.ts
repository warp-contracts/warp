import { performance } from 'perf_hooks';

export class Benchmark {
  public static measure(): Benchmark {
    return new Benchmark();
  }

  private start = performance.now();

  public reset() {
    this.start = performance.now();
  }

  public elapsed(): string {
    const end = performance.now();
    return `${(end - this.start).toFixed(0)}ms`;
  }
}
