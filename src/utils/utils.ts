export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const deepCopy = (input: unknown) => {
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

export const asc = (a: number, b: number) => a - b;

export const desc = (a: number, b: number) => b - a;
