import type { ReactNode } from 'react';

interface SettingsSectionProps {
  id: string;
  title: string;
  description?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}

/** One settings card: anchor target + title + optional description/header slot. */
export function SettingsSection({ id, title, description, headerRight, children }: SettingsSectionProps) {
  return (
    <section id={id} className="sf-card p-6 scroll-mt-24">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {headerRight}
      </div>
      {description ? (
        <p className="text-xs text-gray-500 mb-4">{description}</p>
      ) : (
        <div className="mb-3" />
      )}
      {children}
    </section>
  );
}
