import { Router } from 'express';
import { getEventsSince } from '../../lib/events.ts';

const router = Router();

/**
 * Incremental event feed for client toasts. The client keeps a `since` cursor;
 * a changed bootId means the server restarted and the cursor must reset to the
 * returned lastSeq (events are in-memory only).
 */
router.get('/events', (req, res) => {
  const since = Number.parseInt((req.query.since as string) ?? '', 10);
  res.json(getEventsSince(Number.isFinite(since) ? since : Number.MAX_SAFE_INTEGER));
});

export default router;
