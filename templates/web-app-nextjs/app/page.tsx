import { getSampleMetrics } from "../lib/sample-data";

export default function Page() {
  const data = getSampleMetrics();
  return (
    <main>
      <h1>{data.title}</h1>
      {data.items.map((item) => (
        <div key={item.label}>
          <strong>{item.label}</strong>: {item.value}
        </div>
      ))}
    </main>
  );
}
