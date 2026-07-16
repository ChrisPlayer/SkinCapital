import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// Errors linger longer: they carry actionable text the user has to read.
const TOAST_TTL_MS: Record<ToastKind, number> = { success: 4000, error: 8000, info: 5000 };
const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++nextIdRef.current;
    setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, kind, message }]);
    setTimeout(() => dismiss(id), TOAST_TTL_MS[kind]);
  }, [dismiss]);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
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
              onClick={() => dismiss(toast.id)}
              className={`sf-card toast-anim pointer-events-auto cursor-pointer flex items-start gap-2.5 px-4 py-3 max-w-sm text-sm ${
                toast.kind === 'success' ? 'border-sf-green/40' : toast.kind === 'error' ? 'border-sf-pink/40' : 'border-white/[0.15]'
              }`}
            >
              {toast.kind === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-sf-green shrink-0 mt-0.5" />
              ) : toast.kind === 'error' ? (
                <AlertCircle className="w-4 h-4 text-sf-pink shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
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
