import { randomUUID } from 'node:crypto';
import type { AppEvent, AppEventType, EventsResponse } from '../../shared/types/api.ts';

/**
 * In-memory event journal for client toasts. Deliberately NOT persisted: these
 * are ephemeral notifications, losing them on restart is fine. bootId lets the
 * client detect a restart and reset its cursor instead of replaying ghosts.
 */
const BOOT_ID = randomUUID();
const MAX_EVENTS = 200;

const events: AppEvent[] = [];
let lastSeq = 0;

export function pushEvent(type: AppEventType, payload: Record<string, unknown> = {}): void {
  lastSeq += 1;
  events.push({ seq: lastSeq, type, at: new Date().toISOString(), payload });
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

export function getEventsSince(since: number): EventsResponse {
  // A cursor beyond lastSeq means the client is talking to a previous boot —
  // return nothing; the changed bootId tells it to restart from lastSeq.
  const fresh = since >= lastSeq ? [] : events.filter((e) => e.seq > since);
  return { bootId: BOOT_ID, lastSeq, events: fresh };
}
