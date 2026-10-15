/**
 * Data-access boundary. The UI only talks to this interface, so the local
 * IndexedDB implementation can later be replaced by a shared backend
 * (e.g. PostgreSQL/Supabase with server-side authorization and object storage).
 */
import type { AppState } from "@/domain/types";

export interface StoredFile {
  blob: Blob;
  name: string;
  type: string;
}

export interface Repository {
  loadState(): Promise<AppState | undefined>;
  saveState(state: AppState): Promise<void>;
  putFile(id: string, file: StoredFile): Promise<void>;
  getFile(id: string): Promise<StoredFile | undefined>;
  deleteFile(id: string): Promise<void>;
  clearAll(): Promise<void>;
}
