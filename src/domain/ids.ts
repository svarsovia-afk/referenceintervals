let counter = 0;

export function makeId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${rand}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
