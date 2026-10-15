import { en } from "./en";
import { nl, type Dictionary } from "./nl";
import type { Lang, LocalizedText } from "@/domain/types";

export const DICTIONARIES: Record<Lang, Dictionary> = { nl, en };
export const DEFAULT_LANG: Lang = "nl";

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
/** Dot-separated paths to every string leaf of the dictionary. */
export type Leaves<T, D extends number = 4> = [D] extends [never]
  ? never
  : T extends string
    ? ""
    : { [K in keyof T & string]: T[K] extends string ? K : Join<K, Leaves<T[K], Prev[D]>> }[keyof T & string];
type Prev = [never, 0, 1, 2, 3, 4];

export type TKey = Leaves<Dictionary>;
export type TVars = Record<string, string | number>;

export function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of splitKey(key)) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

/** Splits "taskTemplates.s1.inventory.title" correctly although template keys contain dots. */
function splitKey(key: string): string[] {
  const m = key.match(/^(taskTemplates)\.(.+)\.(title|description)$/);
  if (m) return [m[1], m[2], m[3]];
  const a = key.match(/^(audit)\.(.+)$/);
  if (a) return [a[1], a[2]];
  return key.split(".");
}

export function interpolate(text: string, vars?: TVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export function translate(lang: Lang, key: TKey | string, vars?: TVars): string {
  const text = lookup(DICTIONARIES[lang], key) ?? lookup(DICTIONARIES[DEFAULT_LANG], key) ?? key;
  return interpolate(text, vars);
}

/** Picks the user's language from bilingual content, falling back to the other language. */
export function localized(text: LocalizedText | undefined, lang: Lang): string {
  if (!text) return "";
  const primary = text[lang]?.trim();
  if (primary) return text[lang];
  return lang === "nl" ? text.en : text.nl;
}

export function bothLanguages(path: (d: Dictionary) => string): LocalizedText {
  return { nl: path(nl), en: path(en) };
}
