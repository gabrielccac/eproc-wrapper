export function normalizeProcessNumber(processNumber: string): string {
  return (processNumber || "").replace(/\D/g, "");
}

export function parseClientPhone(value: string): string | null {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    return `55${ddd}9${rest}`;
  }

  if (digits.length === 11) {
    return `55${digits}`;
  }

  if (digits.length >= 12) {
    return digits.startsWith("55") ? digits : `55${digits}`;
  }

  return null;
}
