export class MetricsCollector {
    counters = new Map();
    gauges = new Map();
    histograms = new Map();
    points = [];
    counter(name, labels = {}, delta = 1) {
        const key = metricKey(name, labels);
        this.counters.set(key, (this.counters.get(key) ?? 0) + delta);
        this.points.push({ name, value: this.counters.get(key), ts: Date.now(), labels });
    }
    gauge(name, value, labels = {}) {
        const key = metricKey(name, labels);
        this.gauges.set(key, value);
        this.points.push({ name, value, ts: Date.now(), labels });
    }
    histogram(name, value, labels = {}) {
        const key = metricKey(name, labels);
        const values = this.histograms.get(key) ?? [];
        values.push(value);
        this.histograms.set(key, values);
        this.points.push({ name, value, ts: Date.now(), labels });
    }
    summary() {
        const result = {};
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
    recentPoints(limit = 100) {
        return this.points.slice(-limit);
    }
    reset() {
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
        this.points = [];
    }
}
function metricKey(name, labels) {
    const l = Object.entries(labels)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join(",");
    return l ? `${name}{${l}}` : name;
}
//# sourceMappingURL=MetricsCollector.js.map