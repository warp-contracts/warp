export const sleep = (ms: number): Promise<never> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deepCopy = (input: unknown): any => {
  return JSON.parse(JSON.stringify(input));
};

export const initLocalStorage = (): Storage => {
  try {
    let storage;
    const uid = Date.now().toString();
    (storage = window.localStorage).setItem(uid, uid);
    const fail = storage.getItem(uid) != uid;
    if (fail) throw new Error('Local storage is not supported by current environment');
    storage.removeItem(uid);
    return storage;
  } catch (exception) {
    throw new Error('Local storage is not supported by current environment');
  }
};
