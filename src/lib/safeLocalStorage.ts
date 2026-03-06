let _localStorageAvailable: boolean | null = null;
const isLocalStorageAvailable = (): boolean => {
  if (_localStorageAvailable !== null) return _localStorageAvailable;
  try {
    if (typeof window === 'undefined') return (_localStorageAvailable = false);
    if (typeof window.localStorage === 'undefined') return (_localStorageAvailable = false);
    if (typeof window.localStorage.getItem !== 'function') return (_localStorageAvailable = false);
    if (typeof window.localStorage.setItem !== 'function') return (_localStorageAvailable = false);
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return (_localStorageAvailable = true);
  } catch {
    return (_localStorageAvailable = false);
  }
};

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    if (!isLocalStorageAvailable()) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (!isLocalStorageAvailable()) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage errors
    }
  },
  removeItem: (key: string): void => {
    if (!isLocalStorageAvailable()) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  }
};

export default safeLocalStorage;
