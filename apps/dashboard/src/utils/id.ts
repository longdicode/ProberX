let counter = 0;

export function uuidv7(): string {
  const ms = BigInt(Date.now());
  counter = (counter + 1) % 4096;
  const rand = BigInt(Math.floor(Math.random() * 2**62));
  const value = (ms << 74n) | (BigInt(counter) << 62n) | (rand & 0x3fffffffffffffffn);
  const hex = value.toString(16).padStart(32, "0");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-7" + hex.slice(13, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}