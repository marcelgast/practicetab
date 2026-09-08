export type Id = string;

export type IdGenerator = () => string;

export function createId(generator?: IdGenerator): Id {
  if (generator) {
    return generator();
  }

  const globalCrypto = globalThis.crypto as Crypto | undefined;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }

  return `id_${Math.random().toString(16).slice(2, 10)}_${Date.now()}`;
}
