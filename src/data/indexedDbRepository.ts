"use client";

import { clear, createStore, del, get, set, type UseStore } from "idb-keyval";
import type { AppState } from "@/domain/types";
import type { Repository, StoredFile } from "./repository";

const STATE_KEY = "app-state";

/** Local, single-browser persistence for the prototype (IndexedDB via idb-keyval). */
export class IndexedDbRepository implements Repository {
  private stateStore: UseStore;
  private fileStore: UseStore;

  constructor() {
    this.stateStore = createStore("immunization-roadmap-state", "state");
    this.fileStore = createStore("immunization-roadmap-files", "files");
  }

  loadState(): Promise<AppState | undefined> {
    return get<AppState>(STATE_KEY, this.stateStore);
  }

  saveState(state: AppState): Promise<void> {
    return set(STATE_KEY, state, this.stateStore);
  }

  putFile(id: string, file: StoredFile): Promise<void> {
    return set(id, file, this.fileStore);
  }

  getFile(id: string): Promise<StoredFile | undefined> {
    return get<StoredFile>(id, this.fileStore);
  }

  deleteFile(id: string): Promise<void> {
    return del(id, this.fileStore);
  }

  async clearAll(): Promise<void> {
    await clear(this.stateStore);
    await clear(this.fileStore);
  }
}

/** In-memory fallback used when IndexedDB is unavailable (e.g. some private modes). */
export class MemoryRepository implements Repository {
  private state?: AppState;
  private files = new Map<string, StoredFile>();
  async loadState() {
    return this.state;
  }
  async saveState(state: AppState) {
    this.state = state;
  }
  async putFile(id: string, file: StoredFile) {
    this.files.set(id, file);
  }
  async getFile(id: string) {
    return this.files.get(id);
  }
  async deleteFile(id: string) {
    this.files.delete(id);
  }
  async clearAll() {
    this.state = undefined;
    this.files.clear();
  }
}
