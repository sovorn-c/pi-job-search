export interface SalaryRecord {
  role: string;
  location?: string;
  currency: string;
  min: number;
  max: number;
  source: string;
  updatedAt: string;
}

export interface SalaryValidation {
  valid: boolean;
  records: SalaryRecord[];
  errors: string[];
}

function string(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateSalaryData(value: unknown): SalaryValidation {
  if (!Array.isArray(value)) return { valid: false, records: [], errors: ["salary data must be an array"] };
  const records: SalaryRecord[] = [];
  const errors: string[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push(`record ${index} is not an object`);
      return;
    }
    const record = item as Record<string, unknown>;
    if (!string(record.role) || !string(record.currency) || !string(record.source) || !string(record.updatedAt) ||
      typeof record.min !== "number" || typeof record.max !== "number" || !Number.isFinite(record.min) || !Number.isFinite(record.max) || record.min < 0 || record.max < record.min) {
      errors.push(`record ${index} is malformed`);
      return;
    }
    records.push({ role: record.role, location: string(record.location) ? record.location : undefined, currency: record.currency, min: record.min, max: record.max, source: record.source, updatedAt: record.updatedAt });
  });
  return { valid: errors.length === 0, records, errors };
}

function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type SalaryBenchmark =
  | { status: "available"; currency: string; min: number; max: number; midpoint: number; source: string; updatedAt: string }
  | { status: "skipped"; reason: "missing" | "no-match" };

export function lookupSalaryBenchmark(records: SalaryRecord[], role: string, location?: string): SalaryBenchmark {
  const match = records.find((record) => key(record.role) === key(role) && (!location || !record.location || key(record.location) === key(location)));
  if (!match) return { status: "skipped", reason: records.length ? "no-match" : "missing" };
  return { status: "available", currency: match.currency, min: match.min, max: match.max, midpoint: (match.min + match.max) / 2, source: match.source, updatedAt: match.updatedAt };
}
