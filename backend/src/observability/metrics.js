'use strict';

/* =============================================================================
   C-AUTO — Observabilité (module 65) : Registre de métriques
   -----------------------------------------------------------------------------
   Compteurs / jauges / histogrammes à étiquettes, sans dépendance externe.
   Deux sorties :
     - formatPrometheus()  → texte Prometheus (# HELP/# TYPE/…), prêt pour
                              Grafana + Prometheus / VictoriaMetrics / Mimir ;
     - percentiles()       → p50/p95/p99 calculés sur un échantillon borné des
                              dernières valeurs par étiquette (perf API, JSON).
   Le préfixe METRICS_PREFIX (défaut "cauto") namespace les noms.
   =========================================================================== */

const MAX_SAMPLES = 2000; // échantillon borné par étiquette (mémoire maîtrisée)

const path = require('path');

class MetricsRegistry {
  constructor(prefix = 'cauto') {
    this.prefix = prefix.replace(/[^a-z0-9_]/gi, '').replace(/_+$/, '') || 'cauto';
    this.counters = new Map();   // fullName -> Map(labelsKey -> value)
    this.gauges = new Map();     // fullName -> Map(labelsKey -> value)
    this.histograms = new Map(); // fullName -> { buckets[], counts[], sum, count, samples: Map }
    this.helps = new Map();
    this.version = (() => {
      try {
        return require(path.join(__dirname, '..', '..', 'package.json')).version;
      } catch { return 'unknown'; }
    })();
  }

  labelsKey(labels) {
    if (!labels || !Object.keys(labels).length) return '';
    return Object.keys(labels)
      .sort()
      .map((k) => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`)
      .join(',');
  }

  counter(name, help = '') {
    const full = `${this.prefix}_${name}`;
    if (!this.counters.has(full)) {
      this.counters.set(full, new Map());
      if (help) this.helps.set(full, help);
    }
    const m = this.counters.get(full);
    return {
      inc: (labels = {}, by = 1) => {
        if (by === 0) return;
        const k = this.labelsKey(labels);
        m.set(k, (m.get(k) || 0) + (by || 1));
      },
    };
  }

  gauge(name, help = '') {
    const full = `${this.prefix}_${name}`;
    if (!this.gauges.has(full)) {
      this.gauges.set(full, new Map());
      if (help) this.helps.set(full, help);
    }
    const m = this.gauges.get(full);
    return {
      set: (labels = {}, v) => m.set(this.labelsKey(labels), Number(v) || 0),
      inc: (labels = {}, by = 1) => m.set(this.labelsKey(labels), (m.get(this.labelsKey(labels)) || 0) + (by || 1)),
    };
  }

  // Buckets classiques Prometheus (secondes) : 0.005 → 10 s, durée 99,9 %.
  DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

  histogram(name, help = '', buckets = this.DEFAULT_BUCKETS) {
    const full = `${this.prefix}_${name}`;
    if (!this.histograms.has(full)) {
      this.histograms.set(full, {
        buckets,
        counts: new Map(),
        sum: new Map(),
        samples: new Map(),
      });
      if (help) this.helps.set(full, help);
    }
    const h = this.histograms.get(full);
    return {
      observe: (labels = {}, value) => {
        if (value == null || value < 0) return;
        const k = this.labelsKey(labels);
        const bIndexes = h.counts.get(k) || new Array(h.buckets.length).fill(0);
        for (let i = 0; i < h.buckets.length; i++) {
          if (value <= h.buckets[i]) { bIndexes[i] += 1; break; }
        }
        h.counts.set(k, bIndexes);
        h.sum.set(k, (h.sum.get(k) || 0) + value);
        // échantillon borné pour les percentiles
        const arr = h.samples.get(k) || [];
        arr.push(value);
        if (arr.length > MAX_SAMPLES) arr.shift();
        h.samples.set(k, arr);
      },
    };
  }

  // ===========================================================================
  // Sorties
  // ===========================================================================
  formatPrometheus() {
    const lines = [];
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');

    for (const [full, m] of this.counters) {
      lines.push(`# HELP ${full} ${esc(this.helps.get(full) || full)}`);
      lines.push(`# TYPE ${full} counter`);
      for (const [k, v] of m) lines.push(`${full}${k ? `{${k}}` : ''} ${v}`);
    }
    for (const [full, m] of this.gauges) {
      lines.push(`# HELP ${full} ${esc(this.helps.get(full) || full)}`);
      lines.push(`# TYPE ${full} gauge`);
      for (const [k, v] of m) lines.push(`${full}${k ? `{${k}}` : ''} ${v}`);
    }
    for (const [full, h] of this.histograms) {
      const base = `${full}_bucket`;
      lines.push(`# HELP ${base} ${esc(this.helps.get(full) || full)}`);
      lines.push(`# TYPE ${base} histogram`);
      for (const [k, counts] of h.counts) {
        let cumul = 0;
        for (let i = 0; i < h.buckets.length; i++) {
          cumul += counts[i] || 0;
          lines.push(`${base}${k ? `{${k}}` : ''}${k ? ',' : '{'}le="${h.buckets[i]}"${k ? '' : '}'} ${cumul}`);
        }
        lines.push(`${base}${k ? `{${k}}` : ''}${k ? ',' : '{'}le="+Inf"${k ? '' : '}'} ${cumul}`);
        const sum = h.sum.get(k) || 0;
        const cnt = counts.reduce((a, b) => a + b, 0);
        lines.push(`${full}_sum${k ? `{${k}}` : ''} ${sum}`);
        lines.push(`${full}_count${k ? `{${k}}` : ''} ${cnt}`);
      }
    }
    // Disponibilité / process
    lines.push(`# HELP ${this.prefix}_process_uptime_seconds Durée de service du process`);
    lines.push(`# TYPE ${this.prefix}_process_uptime_seconds gauge`);
    lines.push(`${this.prefix}_process_uptime_seconds ${Math.floor(process.uptime())}`);
    lines.push(`# HELP ${this.prefix}_build_info Informations de version`);
    lines.push(`# TYPE ${this.prefix}_build_info gauge`);
    lines.push(`${this.prefix}_build_info{version="${esc(this.version || 'unknown')}"} 1`);
    return `${lines.join('\n')}\n`;
  }

  // p50/p95/p99 par étiquette (perf API) depuis l'échantillon borné.
  percentiles(metricName, { prune = 0 } = {}) {
    const full = `${this.prefix}_${metricName}`;
    const h = this.histograms.get(full);
    if (!h) return [];
    const out = [];
    for (const [k, arr] of h.samples) {
      const sorted = [...arr].filter((x) => x >= (prune || 0)).sort((a, b) => a - b);
      if (!sorted.length) continue;
      const p = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
      out.push({ labels: k, n: sorted.length, avg: (h.sum.get(k) || 0) / sorted.length, p50: p(0.5), p95: p(0.95), p99: p(0.99) });
    }
    return out.sort((a, b) => b.n - a.n);
  }
}

module.exports = { MetricsRegistry, MAX_SAMPLES };