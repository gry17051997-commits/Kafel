const mem: Record<string, string> = {};

function ls(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    const store = ls();
    if (store) return store.getItem(key);
    return key in mem ? mem[key] : null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const store = ls();
    if (store) store.setItem(key, value);
    else mem[key] = value;
  },
  removeItem: async (key: string): Promise<void> => {
    const store = ls();
    if (store) store.removeItem(key);
    else delete mem[key];
  },
};

export default storage;
