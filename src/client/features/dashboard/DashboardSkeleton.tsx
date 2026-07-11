// App shell rendered immediately while the dashboard data loads: real sidebar
// frame + shimmer blocks where the hero and asset rows will appear.
export function DashboardSkeleton() {
  return (
    <div className="h-screen h-dvh grid grid-cols-1 md:grid-cols-[260px_1fr] overflow-hidden">
      <aside className="sf-sidebar hidden md:flex flex-col py-8 px-6">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-1 h-6 rounded-full bg-[color:var(--accent)] shadow-[0_0_10px_var(--accent)]" />
          <span className="font-display text-xl font-bold">SkinCapital</span>
        </div>
        <div className="space-y-2">
          <div className="skeleton h-10" />
          <div className="skeleton h-10" />
          <div className="skeleton h-10" />
        </div>
        <div className="mt-auto skeleton h-24" />
      </aside>
      <main className="overflow-y-auto px-5 py-8 xl:px-10">
        <div className="skeleton h-8 w-56 mb-8" />
        <div className="skeleton h-40 mb-8" />
        <div className="space-y-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-[88px]" />
          ))}
        </div>
      </main>
    </div>
  );
}
