import { describe, expect, it } from "vitest";
import { DEMO_STAKEHOLDERS } from "@/domain/seed";
import { buildMailto, responsibleRecipients } from "./mailto";

describe("mailto", () => {
  it("addresses the primary contact and CCs JGZ/EPI contacts", () => {
    const r = responsibleRecipients(DEMO_STAKEHOLDERS);
    expect(r.to).toEqual(["mila.voorbeeld@example.org"]);
    expect(r.cc).toEqual(["sara.voorbeeld@example.org", "ruben.voorbeeld@example.org", "nadia.voorbeeld@example.org"]);
    const link = buildMailto({ ...r, subject: "RSV roadmap", body: "Hi" });
    expect(link).toBe(
      "mailto:mila.voorbeeld%40example.org?cc=sara.voorbeeld%40example.org,ruben.voorbeeld%40example.org,nadia.voorbeeld%40example.org&subject=RSV%20roadmap&body=Hi",
    );
  });
  it("drops empty and duplicate addresses", () => {
    expect(buildMailto({ to: ["a@x.org", ""], cc: ["a@x.org", " "], subject: "s" })).toBe("mailto:a%40x.org?subject=s");
  });
});
