import type { ActionError } from "@/domain/actions";

/** Turns a domain error into a translated message (with listed prerequisites/approvals). */
export function errorMessage(td: (key: string, vars?: Record<string, string | number>) => string, error: ActionError): string {
  const base = td(`errors.${error.code}`, { mb: 15 });
  if (!error.details?.length) return base;
  const items = error.details.map((d) => {
    const pre = td(`prerequisites.${d}`);
    return pre.startsWith("prerequisites.") ? td(`approvals.items.${d}`) : pre;
  });
  return `${base} ${items.join("; ")}`;
}
