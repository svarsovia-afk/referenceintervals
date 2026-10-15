"use client";

import { ChevronDown, Download, FileText, History, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useStakeholderLookup } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, Pagination, usePaged } from "@/components/ui/misc";
import type { DocumentMeta } from "@/domain/types";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useApp } from "@/state/AppStateProvider";
import { UploadDialog } from "./UploadDialog";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Earlier versions of a document, newest first. */
function previousVersions(all: DocumentMeta[], doc: DocumentMeta): DocumentMeta[] {
  const out: DocumentMeta[] = [];
  let cur = doc.replacesId ? all.find((d) => d.id === doc.replacesId) : undefined;
  while (cur) {
    out.push(cur);
    const prevId: string | undefined = cur.replacesId;
    cur = prevId ? all.find((d) => d.id === prevId) : undefined;
  }
  return out;
}

export function DocumentList({ documents, showStep = true, emptyText }: { documents: DocumentMeta[]; showStep?: boolean; emptyText?: string }) {
  const { t, td, formatDate } = useI18n();
  const { state, can, deleteDocument, downloadDocument, notify } = useApp();
  const people = useStakeholderLookup();
  const current = documents.filter((d) => !d.supersededById).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const paged = usePaged(current);
  const [toDelete, setToDelete] = useState<DocumentMeta | null>(null);
  const [toReplace, setToReplace] = useState<DocumentMeta | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const download = async (doc: DocumentMeta) => {
    const ok = await downloadDocument(doc);
    if (!ok) notify(t("documents.noFile"), "info");
  };

  if (current.length === 0) return <EmptyState icon={FileText} title={emptyText ?? t("documents.noDocuments")} />;

  return (
    <div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {paged.visible.map((doc) => {
          const versions = previousVersions(state.documents, doc);
          const isOpen = expanded === doc.id;
          return (
            <li key={doc.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-navy-700" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{doc.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {showStep && (
                      <Badge tone="navy">{doc.stepNo ? t("common.step", { n: doc.stepNo }) : t("documents.implementationPhase")}</Badge>
                    )}
                    <Badge tone="outline">{td(`documents.categories.${doc.category}`)}</Badge>
                    {doc.version > 1 && <Badge tone="teal">{t("documents.version", { n: doc.version })}</Badge>}
                    {doc.isExample && <Badge tone="amber">{t("documents.exampleDoc")}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {doc.fileName} · {formatSize(doc.size)} · {t("documents.uploader")}: {people.name(doc.uploadedBy)} · {formatDate(doc.uploadedAt)}
                  </p>
                  {doc.description && <p className="mt-1 text-sm text-ink-muted">{doc.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => download(doc)} aria-label={`${t("common.download")}: ${doc.title}`} title={t("common.download")}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  {can("document.upload") && (
                    <Button variant="ghost" size="icon" onClick={() => setToReplace(doc)} aria-label={`${t("documents.replace")}: ${doc.title}`} title={t("documents.replace")}>
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  {can("document.delete") && (
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(doc)} aria-label={`${t("common.delete")}: ${doc.title}`} title={t("common.delete")}>
                      <Trash2 className="h-4 w-4 text-coral-600" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
              {versions.length > 0 && (
                <div className="ml-8 mt-2">
                  <button type="button" onClick={() => setExpanded(isOpen ? null : doc.id)} aria-expanded={isOpen} className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">
                    <History className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("documents.versionHistory")} ({versions.length})
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {isOpen && (
                    <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                      {versions.map((v) => (
                        <li key={v.id} className="flex items-center gap-2">
                          <span className="font-medium">{t("documents.version", { n: v.version })}</span>
                          <span>
                            {v.fileName} · {people.name(v.uploadedBy)} · {formatDate(v.uploadedAt)}
                          </span>
                          <button type="button" onClick={() => download(v)} className="text-teal-700 hover:underline">
                            {t("common.download")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Pagination page={paged.page} total={paged.total} count={paged.count} onChange={paged.setPage} />
      {toReplace && (
        <UploadDialog open={!!toReplace} onOpenChange={(o) => !o && setToReplace(null)} roadmapId={toReplace.roadmapId} replace={toReplace} />
      )}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        description={toDelete ? t("documents.deleteConfirm", { title: toDelete.title }) : ""}
        destructive
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteDocument(toDelete.id);
          if (!res.ok) notify(errorMessage(td, res.error), "error");
          setToDelete(null);
        }}
      />
    </div>
  );
}
