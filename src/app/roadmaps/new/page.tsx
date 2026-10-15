"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BilingualField } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { Notice, PageHeader } from "@/components/ui/misc";
import type { LocalizedText } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useApp } from "@/state/AppStateProvider";

export default function NewRoadmapPage() {
  const { t, td } = useI18n();
  const { state, can, dispatch, notify, currentUser } = useApp();
  const router = useRouter();
  const [disease, setDisease] = useState<LocalizedText>({ nl: "", en: "" });
  const [population, setPopulation] = useState<LocalizedText>({ nl: "", en: "" });
  const [scope, setScope] = useState<LocalizedText>({ nl: "Curaçao", en: "Curaçao" });
  const [ownerId, setOwnerId] = useState(state.stakeholders.find((s) => s.isPrimaryContact)?.id ?? currentUser.id);
  const [error, setError] = useState<string>();

  if (!can("roadmap.create")) {
    return (
      <>
        <PageHeader title={t("roadmaps.create")} />
        <Notice tone="warning">{t("common.noPermission")}</Notice>
      </>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = dispatch({ type: "roadmap.create", input: { disease, targetPopulation: population, geographicScope: scope, ownerId } });
    if (!res.ok) {
      setError(errorMessage(td, res.error));
      return;
    }
    notify(t("roadmaps.created"));
    router.push(`/roadmaps/${res.createdId}`);
  };

  return (
    <>
      <PageHeader title={t("roadmaps.create")} description={t("roadmaps.createIntro")} />
      <Card className="max-w-3xl">
        <CardBody>
          <form onSubmit={submit} className="space-y-5" noValidate>
            <BilingualField label={t("roadmaps.disease")} value={disease} onChange={setDisease} multiline={false} required />
            <BilingualField label={t("dashboard.targetPopulation")} value={population} onChange={setPopulation} multiline={false} required />
            <BilingualField label={t("dashboard.scope")} value={scope} onChange={setScope} multiline={false} />
            <Field label={t("roadmaps.owner")}>
              {(p) => (
                <Select {...p} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                  {state.stakeholders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} — {td(`positions.${s.position}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => router.back()}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("roadmaps.create")}</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
