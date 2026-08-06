import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "./supabase-client";
import { logger } from "./logger";
import type { PullStats } from "./pull-runner";

export type CloudClient = ReturnType<typeof createSupabaseClient>;

export interface SyncHandler {
  name: string;
  /**
   * Returns what the pass did, so the worker can tell a tick that moved data
   * from one that found nothing. Handlers that do not read rows (the heartbeat)
   * return nothing and count as zero.
   */
  pull: (client: CloudClient) => Promise<PullStats | void>;
  dependencies?: string[];
  priority?: number;
}

export class SyncEngine {
  private handlers: Map<string, SyncHandler> = new Map();

  register(handler: SyncHandler) {
    this.handlers.set(handler.name, handler);
  }

  // Resolves handlers in topological order based on dependencies.
  // Fallbacks to priority, then registration order if no dependencies exist.
  private getOrderedHandlers(): SyncHandler[] {
    const ordered: SyncHandler[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        console.warn(`[cloud] Circular dependency detected involving ${name}`);
        return;
      }

      visiting.add(name);
      const handler = this.handlers.get(name);
      if (handler) {
        if (handler.dependencies) {
          for (const dep of handler.dependencies) {
            visit(dep);
          }
        }
        ordered.push(handler);
      }
      visiting.delete(name);
      visited.add(name);
    };

    // First, sort keys by priority if specified (higher priority = earlier), then just alphabetical
    const sortedKeys = Array.from(this.handlers.keys()).sort((a, b) => {
      const ha = this.handlers.get(a)!;
      const hb = this.handlers.get(b)!;
      if (ha.priority !== undefined && hb.priority !== undefined) return hb.priority - ha.priority;
      if (ha.priority !== undefined) return -1;
      if (hb.priority !== undefined) return 1;
      return a.localeCompare(b);
    });

    for (const key of sortedKeys) {
      visit(key);
    }

    return ordered;
  }

  async loadClient(): Promise<CloudClient | null> {
    const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
    if (!s?.cloudSyncEnabled) return null;
    if (!s.supabaseUrl || !s.supabaseServiceKey || !s.supabaseAnonKey) return null;
    return createSupabaseClient({
      url: s.supabaseUrl,
      serviceKey: decryptSecret(s.supabaseServiceKey),
      anonKey: s.supabaseAnonKey,
    });
  }

  async runPulls(client: CloudClient): Promise<{ pulled: number; errors: string[] }> {
    const stats = { pulled: 0, errors: [] as string[] };
    const ordered = this.getOrderedHandlers();

    for (const handler of ordered) {
      try {
        // Rows applied, not handlers run. Counting handlers made `pulled` a
        // constant while the cloud was reachable, so the worker's idle backoff
        // never fired and the tick stayed at five seconds around the clock.
        const result = await handler.pull(client);
        stats.pulled += result?.applied ?? 0;
      } catch (e) {
        stats.errors.push(`${handler.name}: ${e instanceof Error ? e.message : String(e)}`);
        logger.error("sync-engine", `${handler.name} failed`, e);
      }
    }

    return stats;
  }
}

export const syncEngine = new SyncEngine();
