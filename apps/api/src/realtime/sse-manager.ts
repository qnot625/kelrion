import { IDomainEvent } from "@klerion/queue";

export interface SSEClient {
  id: string;
  tenantId: string;
  queueId: string;
  userId: string;
  send: (data: string) => void;
  close?: () => void;
}

export interface BroadcastEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  aggregateId?: string;
  occurredAt?: Date;
  payload?: unknown;
}

export interface SSEManagerOptions {
  maxReplaySize?: number;
  heartbeatIntervalMs?: number;
}

function extractString(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object" && val !== null && "value" in val && typeof (val as { value: unknown }).value === "string") {
    return (val as { value: string }).value;
  }
  return String(val);
}

export class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private tenantQueuePools: Map<string, Set<string>> = new Map();
  private replayBuffer: BroadcastEvent[] = [];
  private maxReplaySize: number;
  private heartbeatIntervalMs: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(options: SSEManagerOptions = {}) {
    this.maxReplaySize = options.maxReplaySize ?? 100;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15000;
  }

  private getPoolKey(tenantId: string, queueId: string): string {
    return `${extractString(tenantId)}:${extractString(queueId)}`;
  }

  public addClient(client: SSEClient, lastEventId?: string): void {
    const tenantIdStr = extractString(client.tenantId);
    const queueIdStr = extractString(client.queueId);
    client.tenantId = tenantIdStr;
    client.queueId = queueIdStr;

    this.clients.set(client.id, client);

    const poolKey = this.getPoolKey(tenantIdStr, queueIdStr);
    if (!this.tenantQueuePools.has(poolKey)) {
      this.tenantQueuePools.set(poolKey, new Set());
    }
    this.tenantQueuePools.get(poolKey)!.add(client.id);

    // Auto-start heartbeat timer on first connection
    if (this.clients.size === 1 && !this.heartbeatTimer) {
      this.startHeartbeat();
    }

    // Process event replay if Last-Event-ID is provided
    if (lastEventId) {
      this.replayMissedEvents(client, lastEventId);
    }
  }

  public removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clients.delete(clientId);

    const poolKey = this.getPoolKey(client.tenantId, client.queueId);
    const pool = this.tenantQueuePools.get(poolKey);
    if (pool) {
      pool.delete(clientId);
      if (pool.size === 0) {
        this.tenantQueuePools.delete(poolKey);
      }
    }

    try {
      client.close?.();
    } catch {
      // Ignore cleanup error
    }

    // Auto-stop heartbeat timer when all clients disconnect to prevent timer leaks
    if (this.clients.size === 0) {
      this.stopHeartbeat();
    }
  }

  public broadcast(event: BroadcastEvent | IDomainEvent): void {
    const tenantIdStr = extractString(event.tenantId);

    const broadcastEvent: BroadcastEvent = {
      eventId: extractString(event.eventId),
      eventType: extractString(event.eventType),
      tenantId: tenantIdStr,
      aggregateId: extractString(event.aggregateId),
      occurredAt: event.occurredAt,
      payload: event.payload,
    };

    // Store in replay buffer & handle overflow
    this.replayBuffer.push(broadcastEvent);
    while (this.replayBuffer.length > this.maxReplaySize) {
      this.replayBuffer.shift();
    }

    // Extract target queueId from payload or aggregateId
    const payload = (broadcastEvent.payload as Record<string, unknown>) || {};
    const targetQueueId = extractString(
      payload.queueId || payload.targetQueueId || broadcastEvent.aggregateId
    );

    const poolKey = this.getPoolKey(tenantIdStr, targetQueueId);
    const pool = this.tenantQueuePools.get(poolKey);

    if (!pool || pool.size === 0) return;

    const formattedMessage = this.formatSSEMessage(broadcastEvent);

    for (const clientId of Array.from(pool)) {
      const client = this.clients.get(clientId);
      if (client) {
        try {
          client.send(formattedMessage);
        } catch {
          this.removeClient(clientId);
        }
      }
    }
  }


  public replayMissedEvents(client: SSEClient, lastEventId: string): void {
    const missed = this.getReplayEvents(client.tenantId, client.queueId, lastEventId);
    for (const event of missed) {
      const formatted = this.formatSSEMessage(event);
      try {
        client.send(formatted);
      } catch {
        this.removeClient(client.id);
        break;
      }
    }
  }

  public getReplayEvents(
    tenantId: string,
    queueId: string,
    lastEventId?: string
  ): BroadcastEvent[] {
    if (!lastEventId) return [];

    const lastEventIndex = this.replayBuffer.findIndex((e) => e.eventId === lastEventId);
    if (lastEventIndex === -1) {
      // If Last-Event-ID is invalid or expired from replay buffer, ignore
      return [];
    }

    const missed = this.replayBuffer.slice(lastEventIndex + 1);
    return missed.filter((e) => {
      const payload = (e.payload as Record<string, unknown>) || {};
      const eQueueId =
        (payload.queueId as string) || (payload.targetQueueId as string) || e.aggregateId;
      return e.tenantId === tenantId && eQueueId === queueId;
    });
  }

  public startHeartbeat(intervalMs?: number): void {
    if (intervalMs) {
      this.heartbeatIntervalMs = intervalMs;
    }
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  public stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  public isHeartbeatActive(): boolean {
    return this.heartbeatTimer !== null;
  }

  private sendHeartbeat(): void {
    if (this.clients.size === 0) return;

    const pingMessage = `event: heartbeat\ndata: ${JSON.stringify({
      timestamp: new Date().toISOString(),
    })}\n\n`;

    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.send(pingMessage);
      } catch {
        this.removeClient(clientId);
      }
    }
  }

  public getClientCount(tenantId?: string, queueId?: string): number {
    if (!tenantId || !queueId) {
      return this.clients.size;
    }
    const poolKey = this.getPoolKey(tenantId, queueId);
    return this.tenantQueuePools.get(poolKey)?.size ?? 0;
  }

  public formatSSEMessage(event: BroadcastEvent): string {
    const eventId = event.eventId;
    const eventType = event.eventType;
    const data = JSON.stringify(event.payload ?? event);
    return `id: ${eventId}\nevent: ${eventType}\ndata: ${data}\n\n`;
  }

  public destroy(): void {
    this.stopHeartbeat();
    for (const clientId of Array.from(this.clients.keys())) {
      this.removeClient(clientId);
    }
    this.replayBuffer = [];
  }
}
