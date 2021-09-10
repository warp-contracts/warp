export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const deepCopy = (input: unknown) => {
  return JSON.parse(JSON.stringify(input));
};
