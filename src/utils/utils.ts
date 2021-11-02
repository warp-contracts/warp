/* eslint-disable */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const deepCopy = (input: unknown): any => {
  return JSON.parse(JSON.stringify(input));
};

export const mapReplacer = (key: unknown, value: unknown) => {
  if (value instanceof Map) {
    return {
      dataType: 'Map',
      value: Array.from(value.entries())
    };
  } else {
    return value;
  }
};

export const asc = (a: number, b: number): number => a - b;

export const desc = (a: number, b: number): number => b - a;

export function timeout(s: number): { timeoutId: number; timeoutPromise: Promise<any> } {
  let timeoutId = null;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);
      reject('timeout');
    }, s * 1000);
  });
  return {
    timeoutId,
    timeoutPromise
  };
}
