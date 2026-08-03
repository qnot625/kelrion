import { useEffect, useState, useRef, useCallback } from "react";
import { ConnectionStatus, RealtimeEvent, UserContext } from "../types/queue";

export interface UseQueueRealtimeStreamOptions {
  queueId: string | null;
  userContext: UserContext;
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
}

export interface UseQueueRealtimeStreamResult {
  status: ConnectionStatus;
  lastEvent: RealtimeEvent | null;
  error: Error | null;
  reconnect: () => void;
}

export function useQueueRealtimeStream(
  options: UseQueueRealtimeStreamOptions
): UseQueueRealtimeStreamResult {
  const { queueId, userContext, enabled = true, onEvent } = options;

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const lastEventIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    if (!queueId || !enabled || !userContext.tenantId) {
      setStatus("disconnected");
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setStatus("connecting");
    setError(null);

    const queryParams = new URLSearchParams({
      tenantId: userContext.tenantId,
      userId: userContext.userId,
      role: userContext.role,
    });

    if (lastEventIdRef.current) {
      queryParams.set("lastEventId", lastEventIdRef.current);
    }

    const streamUrl = `/api/realtime/queues/${queueId}/stream?${queryParams.toString()}`;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus("connected");
      setError(null);
    };

    es.onmessage = (messageEvent) => {
      try {
        const data = JSON.parse(messageEvent.data);
        if (!data || typeof data !== "object") return;

        const event = data as RealtimeEvent;

        // Skip heartbeat events from triggering onEvent
        if (event.eventType === "heartbeat") {
          return;
        }

        // Deduplicate events by eventId
        if (event.eventId) {
          if (processedEventIdsRef.current.has(event.eventId)) {
            return;
          }
          processedEventIdsRef.current.add(event.eventId);
          if (processedEventIdsRef.current.size > 200) {
            // Keep memory bounded
            const firstId = Array.from(processedEventIdsRef.current)[0];
            processedEventIdsRef.current.delete(firstId);
          }
          lastEventIdRef.current = event.eventId;
        }

        setLastEvent(event);
        if (onEventRef.current) {
          onEventRef.current(event);
        }
      } catch (err) {
        // Ignore parse error
      }
    };

    es.onerror = (err) => {
      setStatus("error");
      setError(new Error("EventSource connection error"));
      es.close();

      // Schedule reconnect if enabled and active
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        if (enabled && queueId) {
          connect();
        }
      }, 3000);
    };
  }, [queueId, userContext.tenantId, userContext.userId, userContext.role, enabled]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setStatus("disconnected");
    };
  }, [connect]);

  const reconnect = useCallback(() => {
    connect();
  }, [connect]);

  return {
    status,
    lastEvent,
    error,
    reconnect,
  };
}
