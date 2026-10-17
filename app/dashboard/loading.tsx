export default function DashboardLoading() {
  return (
    <div className="dash-stack" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="space-y-2">
        <div className="skeleton h-9 w-48" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="stat-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-48" />
        <div className="skeleton h-48" />
      </div>
    </div>
  );
}
