import React from "react";
import type { OperatingMode } from "./types";

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType;
  component: React.LazyExoticComponent<React.ComponentType>;
  contexts: OperatingMode[];
}

const modules = new Map<string, ModuleDefinition>();

export function registerModule(definition: ModuleDefinition) {
  modules.set(definition.id, definition);
}

export function getModules(): ModuleDefinition[] {
  return Array.from(modules.values());
}

export function getModule(id: string): ModuleDefinition | undefined {
  return modules.get(id);
}

const STORAGE_KEY = "frontier-ops:enabled-modules";

export function getEnabledModuleIds(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const saved = new Set<string>(JSON.parse(stored));
      // Auto-enable newly registered modules that aren't in the saved set
      for (const id of modules.keys()) {
        if (!saved.has(id)) {
          saved.add(id);
        }
      }
      return saved;
    }
  } catch {}
  // Default: all modules enabled
  return new Set(modules.keys());
}

export function setEnabledModuleIds(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

const ORDER_KEY = "frontier-ops:module-order";

export function getModuleOrder(): string[] {
  try {
    const stored = localStorage.getItem(ORDER_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function setModuleOrder(order: string[]) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order));
}
