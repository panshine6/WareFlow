/**
 * Mock implementation of AsyncStorage for testing
 */
const storage: Record<string, string> = {};

export default {
  setItem: async (key: string, value: string): Promise<void> => {
    storage[key] = value;
  },
  getItem: async (key: string): Promise<string | null> => {
    return storage[key] || null;
  },
  removeItem: async (key: string): Promise<void> => {
    delete storage[key];
  },
  clear: async (): Promise<void> => {
    Object.keys(storage).forEach((key) => delete storage[key]);
  },
  getAllKeys: async (): Promise<string[]> => {
    return Object.keys(storage);
  },
  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    return keys.map((key) => [key, storage[key] || null]);
  },
  multiSet: async (keyValuePairs: [string, string][]): Promise<void> => {
    keyValuePairs.forEach(([key, value]) => {
      storage[key] = value;
    });
  },
  multiRemove: async (keys: string[]): Promise<void> => {
    keys.forEach((key) => delete storage[key]);
  },
};
