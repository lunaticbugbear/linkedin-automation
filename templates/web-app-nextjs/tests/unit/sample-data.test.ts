import { describe, expect, it } from "vitest";
import { getSampleMetrics } from "../../lib/sample-data";

describe("getSampleMetrics", () => {
  it("returns a populated dashboard payload", () => {
    const result = getSampleMetrics();
    expect(result.title).toBeDefined();
    expect(result.items.length).toBeGreaterThan(0);
  });
});
