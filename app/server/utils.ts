import { createHash } from "node:crypto";
import { ulid } from "ulid";

export function createId(prefix: string): string {
  return `${prefix}_${ulid().toLowerCase()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function stableSummary(title: string | null | undefined, body: string | null | undefined): string {
  const content = [title, body].filter(Boolean).join(". ").replace(/\s+/g, " ").trim();
  if (!content) {
    return "No summary yet.";
  }

  return content.slice(0, 220);
}

export function countTokensApprox(text: string | null | undefined): number {
  if (!text) {
    return 0;
  }

  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function checksumText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

