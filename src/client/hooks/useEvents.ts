import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client.ts';
import { useToast } from '../components/toast.tsx';
import { useI18n } from '../lib/i18n.tsx';
import { getDisplayItemName } from '../lib/item-display.ts';
import type { AppEvent } from '../../shared/types/api.ts';

const POLL_MS = 5000;

/**
 * Polls the server event journal and surfaces live activity as toasts.
 * Mounted once at app level. The first poll (and any server restart, detected
 * by a changed bootId) only positions the cursor — no backlog replay.
 */
export function useEventToasts() {
  const toast = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const cursorRef = useRef<number | null>(null);
  const bootIdRef = useRef<string | null>(null);
  // Stable refs so the polling interval never has to be re-created.
  const toastRef = useRef(toast);
  const tRef = useRef(t);
  toastRef.current = toast;
  tRef.current = t;

  useEffect(() => {
    let stopped = false;

    const handleEvent = (event: AppEvent) => {
      const tr = tRef.current;
      const tst = toastRef.current;
      switch (event.type) {
        case 'refresh_completed': {
          const count = event.payload.itemCount;
          tst.success(`${tr('toast.refreshDone')}${typeof count === 'number' ? ` (${count} items)` : ''}`);
          break;
        }
        case 'refresh_failed':
          tst.error(tr('toast.refreshError'));
          break;
        case 'price_refresh_completed': {
          const found = event.payload.foundCount;
          tst.success(`${tr('toast.pricesRefreshDone')}${typeof found === 'number' ? ` (${found})` : ''}`);
          break;
        }
        case 'alert_triggered': {
          const name = typeof event.payload.marketHashName === 'string' ? event.payload.marketHashName : '';
          tst.info(`${tr('toast.alertTriggered')}${getDisplayItemName(name)}`);
          queryClient.invalidateQueries({ queryKey: ['alerts'] });
          break;
        }
        case 'inventory_changed': {
          const added = typeof event.payload.added === 'number' ? event.payload.added : 0;
          const removed = typeof event.payload.removed === 'number' ? event.payload.removed : 0;
          const parts: string[] = [];
          if (added > 0) parts.push(`+${added}`);
          if (removed > 0) parts.push(`−${removed}`);
          if (parts.length > 0) tst.info(`${tr('toast.inventoryChanged')} (${parts.join(' / ')})`);
          queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
          break;
        }
        case 'phase_changed':
          // A refresh kicking off (manually, at login, or from the scheduler)
          // is worth one toast; the finer phases live in the account widget.
          if (event.payload.phase === 'fetching_inventory') {
            tst.info(tr('toast.refreshStarted'));
          }
          break;
        default:
          // logged_in / logged_out: handled by the auth mutations.
          break;
      }
    };

    const tick = async () => {
      try {
        const res = await api.events.since(cursorRef.current);
        if (stopped) return;
        if (bootIdRef.current !== res.bootId) {
          // First poll or server restart: position the cursor, replay nothing.
          bootIdRef.current = res.bootId;
          cursorRef.current = res.lastSeq;
          return;
        }
        for (const event of res.events) handleEvent(event);
        cursorRef.current = res.lastSeq;
      } catch {
        // Network hiccup: next tick retries with the same cursor.
      }
    };

    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [queryClient]);
}
