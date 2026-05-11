export function DashboardCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <strong>{label}</strong>: {value}
    </div>
  );
}
