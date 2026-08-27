export class DomainValidationError extends Error {
  readonly code: string;
  readonly field: string;

  constructor(code: string, field: string, message: string) {
    super(message);
    this.name = "DomainValidationError";
    this.code = code;
    this.field = field;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function requireUuid(value: string, field: string, label: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new DomainValidationError("invalid_uuid", field, `${label} deve ser um UUID válido.`);
  }

  return value.toLowerCase();
}

export function requireText(value: string, field: string, label: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new DomainValidationError("required", field, `${label} é obrigatório.`);
  }

  return normalized;
}

export function optionalText(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function requireNonNegativeInteger(
  value: number,
  field: string,
  label: string,
): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(
      "invalid_non_negative_integer",
      field,
      `${label} deve ser um número inteiro maior ou igual a zero.`,
    );
  }

  return value;
}

export function requireDateOnly(value: string, field: string, label: string): string {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new DomainValidationError(
      "invalid_date_only",
      field,
      `${label} deve usar o formato AAAA-MM-DD.`,
    );
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new DomainValidationError("invalid_date_only", field, `${label} não é uma data válida.`);
  }

  return value;
}

export function requireIsoTimestamp(value: string, field: string): string {
  if (!value.endsWith("Z") || Number.isNaN(Date.parse(value))) {
    throw new DomainValidationError(
      "invalid_timestamp",
      field,
      "O registro deve usar um timestamp UTC válido.",
    );
  }

  return value;
}

