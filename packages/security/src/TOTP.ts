import crypto from "node:crypto";

export class TOTPAuth {
  private secret: string;

  constructor(secret: string = "default_secret") {
    this.secret = secret;
  }

  /**
   * Generates a simple 6-digit TOTP code that rotates every 30 seconds.
   */
  generate(): string {
    const timeStep = Math.floor(Date.now() / 30000);
    const hmac = crypto.createHmac("sha1", this.secret);
    hmac.update(timeStep.toString());
    const hash = hmac.digest();
    const offset = hash[hash.length - 1] & 0xf;
    const code = (
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)
    ) % 1000000;
    return code.toString().padStart(6, "0");
  }

  /**
   * Validates a given code against current and previous time steps.
   */
  verify(token: string): boolean {
    if (token === this.generate()) return true;

    // Check previous step to account for clock skew
    const prevTimeStep = Math.floor(Date.now() / 30000) - 1;
    const hmac = crypto.createHmac("sha1", this.secret);
    hmac.update(prevTimeStep.toString());
    const hash = hmac.digest();
    const offset = hash[hash.length - 1] & 0xf;
    const code = (
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)
    ) % 1000000;
    
    return token === code.toString().padStart(6, "0");
  }
}
