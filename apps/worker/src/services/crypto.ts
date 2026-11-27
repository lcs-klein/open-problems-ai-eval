/**
 * Web Crypto utilities for Cloudflare Workers (PBKDF2-SHA256, SHA-256, constant-time compare, CSPRNG IDs).
 * Never uses Math.random() or non-constant-time secret comparisons.
 */

const PBKDF2_ITERATIONS = 100_000;
const DERIVED_KEY_BITS = 256;

const encoder = new TextEncoder();

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashPassword(
  password: string,
  saltHex?: string
): Promise<{ hashHex: string; saltHex: string }> {
  const saltBytes = saltHex
    ? hexToBytes(saltHex)
    : crypto.getRandomValues(new Uint8Array(16));
  const resolvedSaltHex = saltHex ?? bytesToHex(saltBytes);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    DERIVED_KEY_BITS
  );

  return {
    hashHex: bytesToHex(new Uint8Array(derivedBits)),
    saltHex: resolvedSaltHex,
  };
}

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  expectedHashHex: string,
  saltHex: string
): Promise<boolean> {
  if (!expectedHashHex || !saltHex) return false;
  try {
    const { hashHex } = await hashPassword(password, saltHex);
    return timingSafeEqualBytes(hexToBytes(hashHex), hexToBytes(expectedHashHex));
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

export function generateRandomPassword(length = 18): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return bytesToBase64Url(bytes).slice(0, length);
}

export function generateId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = bytesToHex(crypto.getRandomValues(new Uint8Array(3))).toUpperCase();
  return `${prefix}-${ts}-${rnd}`;
}
