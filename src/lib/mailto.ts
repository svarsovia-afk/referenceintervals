import type { Stakeholder } from "@/domain/types";

export interface MailtoInput {
  to: string[];
  cc?: string[];
  subject: string;
  body?: string;
}

/** Builds a mailto: link with the stored addresses; empty addresses are dropped. */
export function buildMailto({ to, cc = [], subject, body }: MailtoInput): string {
  const clean = (list: string[]) => [...new Set(list.map((e) => e.trim()).filter(Boolean))];
  const toList = clean(to);
  const ccList = clean(cc).filter((e) => !toList.includes(e));
  const params: string[] = [];
  if (ccList.length) params.push(`cc=${ccList.map(encodeURIComponent).join(",")}`);
  params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${toList.map(encodeURIComponent).join(",")}?${params.join("&")}`;
}

/** Primary responsible contact as recipient, JGZ/EPI contacts flagged for CC copied in. */
export function responsibleRecipients(stakeholders: Stakeholder[]): { to: string[]; cc: string[]; primary?: Stakeholder } {
  const primary = stakeholders.find((s) => s.isPrimaryContact);
  const cc = stakeholders.filter((s) => s.ccOnCommunications && s.id !== primary?.id).map((s) => s.email);
  return { to: primary ? [primary.email] : [], cc, primary };
}
