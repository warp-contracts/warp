export class Benchmark {
  public static measure(): Benchmark {
    return new Benchmark();
  }

  private start = Date.now();

  public reset() {
    this.start = Date.now();
  }

  public elapsed(): string {
    const end = Date.now();
    return `${(end - this.start).toFixed(0)}ms`;
  }
}
