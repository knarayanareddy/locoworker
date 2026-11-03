/**
 * RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits by default).
 *
 * The secret is a base32 string, as produced by authenticator apps. Unlike
 * the previous implementation this uses the 8-byte big-endian counter, so
 * codes interoperate with Google Authenticator / 1Password / Authy.
 *
 * There is deliberately NO default secret: a missing secret is an error.
 *
 * NOTE: this is a standalone utility for CLI/authenticator enrolment. It is
 * NOT used to authenticate the HTTP gateways; those use HttpGuard Bearer
 * tokens plus HMAC-verified webhook signatures (see network/HttpGuard.ts).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export interface TOTPOptions {
  /** Time step in seconds. Default 30. */
  period?: number;
  /** Number of digits. Default 6. */
  digits?: number;
  /** Accepted steps before/after the current one (clock skew). Default 1. */
  window?: number;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/\s|-/g, "");
  if (!/^[A-Z2-7]+$/.test(cleaned)) {
    throw new Error("Invalid base32 TOTP secret");
  }
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error("Invalid base32 TOTP secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export class TOTPAuth {
  private readonly key: Buffer;
  private readonly period: number;
  private readonly digits: number;
  private readonly window: number;

  constructor(secret?: string, options: TOTPOptions = {}) {
    if (!secret || secret.trim().length === 0) {
      throw new Error("TOTP secret is required; refusing to use a default secret");
    }
    this.key = base32Decode(secret);
    if (this.key.length === 0) throw new Error("TOTP secret is empty");
    this.period = options.period ?? 30;
    this.digits = options.digits ?? 6;
    this.window = options.window ?? 1;
    if (this.period <= 0 || this.digits <= 0 || this.window < 0) {
      throw new Error("Invalid TOTP options");
    }
  }

  /** Generate a fresh random base32 secret (20 bytes = 160 bits). */
  static generateSecret(): string {
    return base32Encode(randomBytes(20));
  }

  private codeAt(step: number): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step), 0);
    const digest = createHmac("sha1", this.key).update(counter).digest();
    const offset = digest[digest.length - 1]! & 0x0f;
    const binary =
      ((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff);
    const code = binary % 10 ** this.digits;
    return code.toString().padStart(this.digits, "0");
  }

  generate(at: number = Date.now()): string {
    return this.codeAt(Math.floor(at / (this.period * 1000)));
  }

  verify(token: string, at: number = Date.now()): boolean {
    if (!/^\d+$/.test(token) || token.length !== this.digits) return false;
    const step = Math.floor(at / (this.period * 1000));
    let matched = false;
    for (let delta = -this.window; delta <= this.window; delta++) {
      const candidate = this.codeAt(step + delta);
      // Constant-time across all candidate steps; do not early-return.
      const a = Buffer.from(token, "utf8");
      const b = Buffer.from(candidate, "utf8");
      if (a.length === b.length && timingSafeEqual(a, b)) matched = true;
    }
    return matched;
  }

  /** otpauth:// URI for enrolment in an authenticator app. */
  provisioningUri(account: string, issuer = "locoworker"): string {
    const secret = base32Encode(this.key);
    const params = new URLSearchParams({
      secret,
      issuer,
      algorithm: "SHA1",
      digits: String(this.digits),
      period: String(this.period),
    });
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params}`;
  }
}
