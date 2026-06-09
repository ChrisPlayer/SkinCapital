import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';

type ToastKind = 'success' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TOAST_TTL_MS = 4000;
const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++nextIdRef.current;
    setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, TOAST_TTL_MS);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className={`sf-card toast-anim pointer-events-auto flex items-start gap-2.5 px-4 py-3 max-w-sm text-sm ${
                toast.kind === 'success' ? 'border-sf-green/40' : 'border-sf-pink/40'
              }`}
            >
              {toast.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-sf-green shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-sf-pink shrink-0 mt-0.5" />
              )}
              <span className="min-w-0 break-words text-gray-200">{toast.message}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
