import type { MetricPoint } from "./types";

export class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private points: MetricPoint[] = [];

  counter(name: string, labels: Record<string, string> = {}, delta = 1): void {
    const key = metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + delta);
    this.points.push({ name, value: this.counters.get(key)!, ts: Date.now(), labels });
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = metricKey(name, labels);
    this.gauges.set(key, value);
    this.points.push({ name, value, ts: Date.now(), labels });
  }

  histogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = metricKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
    this.points.push({ name, value, ts: Date.now(), labels });
  }

  summary(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of this.counters.entries()) {
      result[`counter.${key}`] = value;
    }
    for (const [key, value] of this.gauges.entries()) {
      result[`gauge.${key}`] = value;
    }
    for (const [key, values] of this.histograms.entries()) {
      const sorted = [...values].sort((a, b) => a - b);
      result[`hist.${key}`] = {
        count: values.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
      };
    }

    return result;
  }

  recentPoints(limit = 100): MetricPoint[] {
    return this.points.slice(-limit);
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.points = [];
  }
}

function metricKey(name: string, labels: Record<string, string>): string {
  const l = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return l ? `${name}{${l}}` : name;
}
