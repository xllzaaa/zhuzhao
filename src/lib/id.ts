/**
 * ULID 生成器
 * 按时间排序友好的 26 字符标识符
 * 详见 zhuzhao-core spec §4.4
 */

// Crockford Base32 字母表（去除 I/L/U/O 易混字符）
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCODING_LEN = 32;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number): string {
  let str = "";
  for (let len = TIME_LEN; len > 0; len--) {
    const mod = now % ENCODING_LEN;
    str = ENCODING[mod] + str;
    now = (now - mod) / ENCODING_LEN;
  }
  return str;
}

function encodeRandom(): string {
  let str = "";
  const bytes = new Uint8Array(RANDOM_LEN);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // fallback：Math.random（仅 dev 路径，tauri webview 通常有 crypto）
    for (let i = 0; i < RANDOM_LEN; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < RANDOM_LEN; i++) {
    str += ENCODING[bytes[i] % ENCODING_LEN];
  }
  return str;
}

/** 生成 ULID（小写） */
export function ulid(): string {
  const time = Date.now();
  return (encodeTime(time) + encodeRandom()).toLowerCase();
}

/** 当前 ISO 8601 UTC 时间字符串 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 当前日期（YYYY-MM-DD，本地时区） */
export function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
