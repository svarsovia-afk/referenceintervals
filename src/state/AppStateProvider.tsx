"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyAction, versionChain, type Action, type ActionResult } from "@/domain/actions";
import { makeId } from "@/domain/ids";
import { hasPermission } from "@/domain/permissions";
import { createSeedState, DEFAULT_USER_ID, SCHEMA_VERSION, SEED_FILES } from "@/domain/seed";
import type { AppState, DocumentMeta, PermissionKey, Stakeholder } from "@/domain/types";
import { IndexedDbRepository, MemoryRepository } from "@/data/indexedDbRepository";
import type { Repository } from "@/data/repository";

const USER_KEY = "immunization-roadmap-demo-user";
export const MAX_FILE_MB = 15;

export interface Toast {
  id: string;
  message: string;
  kind: "success" | "error" | "info";
}

interface AppStateContextValue {
  state: AppState;
  currentUser: Stakeholder;
  setCurrentUserId: (id: string) => void;
  can: (permission: PermissionKey) => boolean;
  dispatch: (action: Action) => ActionResult;
  uploadDocument: (meta: Omit<DocumentMeta, "id" | "uploadedBy" | "uploadedAt" | "version" | "fileName" | "fileType" | "size" | "isExample">, file: File, replaceId?: string) => Promise<ActionResult>;
  deleteDocument: (id: string) => Promise<ActionResult>;
  downloadDocument: (doc: DocumentMeta) => Promise<boolean>;
  resetDemoData: () => Promise<void>;
  storageDegraded: boolean;
  toasts: Toast[];
  notify: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

async function seedFiles(repo: Repository) {
  await Promise.all(
    Object.entries(SEED_FILES).map(([id, f]) =>
      repo.putFile(id, { blob: new Blob([f.content], { type: f.type }), name: `${id}.txt`, type: f.type }),
    ),
  );
}

export function AppStateProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const repoRef = useRef<Repository | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const [userId, setUserId] = useState<string>(DEFAULT_USER_ID);
  const [storageDegraded, setStorageDegraded] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let repo: Repository = new IndexedDbRepository();
      let loaded: AppState | undefined;
      try {
        loaded = await repo.loadState();
      } catch {
        repo = new MemoryRepository();
        if (!cancelled) setStorageDegraded(true);
      }
      if (!loaded || loaded.schemaVersion !== SCHEMA_VERSION) {
        loaded = createSeedState();
        try {
          await repo.saveState(loaded);
          await seedFiles(repo);
        } catch {
          repo = new MemoryRepository();
          await seedFiles(repo);
          if (!cancelled) setStorageDegraded(true);
        }
      }
      repoRef.current = repo;
      try {
        const storedUser = window.localStorage.getItem(USER_KEY);
        if (storedUser && loaded.stakeholders.some((s) => s.id === storedUser)) setUserId(storedUser);
      } catch {
        /* ignore */
      }
      if (!cancelled) {
        stateRef.current = loaded;
        setState(loaded);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
    repoRef.current?.saveState(next).catch(() => setStorageDegraded(true));
  }, []);

  const dispatch = useCallback(
    (action: Action): ActionResult => {
      const current = stateRef.current;
      if (!current) return { ok: false, error: { code: "generic" } };
      const result = applyAction(current, action, userId);
      if (result.ok) persist(result.state);
      return result;
    },
    [persist, userId],
  );

  const notify = useCallback((message: string, kind: Toast["kind"] = "success") => {
    const id = makeId("toast");
    setToasts((ts) => [...ts.slice(-2), { id, message, kind }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 5000);
  }, []);

  const value = useMemo<AppStateContextValue | null>(() => {
    if (!state) return null;
    const currentUser = state.stakeholders.find((s) => s.id === userId) ?? state.stakeholders[0];
    return {
      state,
      currentUser,
      setCurrentUserId: (id: string) => {
        setUserId(id);
        try {
          window.localStorage.setItem(USER_KEY, id);
        } catch {
          /* ignore */
        }
      },
      can: (permission) => hasPermission(currentUser, permission, state.settings),
      dispatch,
      uploadDocument: async (meta, file, replaceId) => {
        if (file.size > MAX_FILE_MB * 1024 * 1024) return { ok: false, error: { code: "fileTooLarge" } };
        const id = makeId("doc");
        const doc: DocumentMeta = {
          ...meta,
          id,
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          size: file.size,
          uploadedBy: currentUser.id,
          uploadedAt: new Date().toISOString(),
          version: 1,
          isExample: false,
        };
        // Check permission/validation before writing the blob.
        const result = applyAction(stateRef.current!, replaceId ? { type: "document.replace", oldId: replaceId, doc } : { type: "document.add", doc }, currentUser.id);
        if (!result.ok) return result;
        try {
          await repoRef.current!.putFile(id, { blob: file, name: file.name, type: doc.fileType });
        } catch {
          return { ok: false, error: { code: "generic" } };
        }
        persist(result.state);
        return result;
      },
      deleteDocument: async (docId) => {
        const chain = versionChain(stateRef.current!.documents, docId);
        const result = dispatch({ type: "document.delete", documentId: docId });
        if (result.ok) await Promise.all(chain.map((id) => repoRef.current!.deleteFile(id).catch(() => undefined)));
        return result;
      },
      downloadDocument: async (doc) => {
        const stored = await repoRef.current?.getFile(doc.id);
        if (!stored) return false;
        const url = URL.createObjectURL(stored.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
      },
      resetDemoData: async () => {
        const repo = repoRef.current!;
        await repo.clearAll().catch(() => undefined);
        const fresh = createSeedState();
        await seedFiles(repo).catch(() => undefined);
        persist(fresh);
      },
      storageDegraded,
      toasts,
      notify,
      dismissToast: (id) => setToasts((ts) => ts.filter((t) => t.id !== id)),
    };
  }, [state, userId, dispatch, persist, storageDegraded, toasts, notify]);

  if (!value) return <>{fallback}</>;
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useApp(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useApp must be used inside AppStateProvider");
  return ctx;
}
