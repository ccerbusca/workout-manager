import * as Crypto from 'expo-crypto';

/** Client-generated UUID v4 — safe to sync to a server later without id clashes. */
export function newId(): string {
  return Crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}
