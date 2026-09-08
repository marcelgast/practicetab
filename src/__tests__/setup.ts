// Fix for Node.js 25's incomplete localStorage (requires --localstorage-file to work).
// Replace it with a proper in-memory implementation for tests.

class InMemoryStorage implements Storage {
  readonly #data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#data.set(key, String(value));
  }

  removeItem(key: string): void {
    this.#data.delete(key);
  }

  clear(): void {
    this.#data.clear();
  }

  get length(): number {
    return this.#data.size;
  }

  key(index: number): string | null {
    return Array.from(this.#data.keys())[index] ?? null;
  }
}

const inMemoryStorage = new InMemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  value: inMemoryStorage,
  configurable: true,
  writable: true,
});

// Reset storage before each test so tests are isolated
import { beforeEach } from 'vitest';
beforeEach(() => {
  inMemoryStorage.clear();
});
