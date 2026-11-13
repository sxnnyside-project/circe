/**
 * Supported interaction categories for telemetry and observability.
 *
 * @public
 */
export type InteractionMetricKind =
  | 'command'
  | 'subcommand'
  | 'component'
  | 'modal'
  | 'user-context-menu'
  | 'message-context-menu'
  | 'autocomplete';

/**
 * Outcome status of an interaction lifecycle.
 *
 * @remarks
 * Follows Google Golden Signals observability standards:
 * - `'success'`: Interaction completed successfully without throwing.
 * - `'denied'`: Interaction was blocked by one or more access control guards.
 * - `'error'`: An unhandled exception was thrown and caught by Circe's error boundary.
 * - `'unknown'`: Interaction targeted an unregistered command, component, modal, or context menu.
 *
 * @public
 */
export type InteractionMetricStatus = 'success' | 'denied' | 'error' | 'unknown';

/**
 * Telemetry payload emitted upon completion of any Discord interaction lifecycle.
 *
 * @remarks
 * Enables bot authors to export Golden Signals (latency percentiles, traffic rate, errors)
 * directly into APM tools (Prometheus, OpenTelemetry, Datadog, CloudWatch, Grafana).
 *
 * @public
 */
export interface InteractionMetric {
  /** The kind of interaction handled. */
  readonly kind: InteractionMetricKind;
  /** The public command name, component prefix, or modal prefix. */
  readonly name: string;
  /** Execution outcome status. */
  readonly status: InteractionMetricStatus;
  /** Total wall-clock execution duration in milliseconds. */
  readonly durationMs: number;
  /** Correlation ID attached to this interaction lifecycle, if available. */
  readonly correlationId?: string | undefined;
  /** Discord Guild snowflake ID if executed within a server, or `null` for DMs. */
  readonly guildId: string | null;
  /** Snowflake ID of the user who initiated the interaction. */
  readonly userId: string;
  /** The caught error instance if status is `'error'`. */
  readonly error?: unknown;
}

/**
 * Callback signature for receiving interaction completion metrics.
 *
 * @public
 */
export type InteractionTelemetryHandler = (metric: InteractionMetric) => void | Promise<void>;

/**
 * Statistical summary of interaction latencies and volumes.
 *
 * @public
 */
export interface LatencySnapshot {
  /** Total count of recorded interactions. */
  readonly total: number;
  /** Total count of interactions ending in unhandled error. */
  readonly errors: number;
  /** Total count of interactions rejected by guards. */
  readonly denied: number;
  /** Minimum execution duration in milliseconds. */
  readonly minMs: number;
  /** Maximum execution duration in milliseconds. */
  readonly maxMs: number;
  /** Mean execution duration in milliseconds. */
  readonly avgMs: number;
  /** 50th percentile (median) execution latency in milliseconds. */
  readonly p50Ms: number;
  /** 95th percentile execution latency in milliseconds. */
  readonly p95Ms: number;
  /** 99th percentile execution latency in milliseconds. */
  readonly p99Ms: number;
}

/**
 * In-memory accumulator for tracking interaction duration percentiles and traffic volume.
 *
 * @public
 */
export interface LatencyAccumulator {
  /** Records an interaction metric into the sample pool. */
  record(metric: InteractionMetric): void;
  /** Computes the current statistical snapshot (p50, p95, p99, min, max, error rate). */
  snapshot(): LatencySnapshot;
  /** Resets all accumulated samples and counters. */
  reset(): void;
}

/**
 * Creates an in-memory latency and volume accumulator.
 *
 * @remarks
 * Uses an efficient sorted reservoir to compute p50, p95, and p99 percentiles without
 * external dependencies. Suitable for `/health` metrics endpoints, integration tests,
 * and lightweight in-process monitoring.
 *
 * @param maxSamples - Maximum sample window size (default: 10,000).
 * @returns A stateful {@link LatencyAccumulator}.
 *
 * @example
 * ```typescript
 * const tracker = createLatencyAccumulator();
 * app.onInteractionComplete(metric => tracker.record(metric));
 * console.log(tracker.snapshot().p95Ms);
 * ```
 *
 * @public
 */
export function createLatencyAccumulator(maxSamples = 10_000): LatencyAccumulator {
  let samples: number[] = [];
  let total = 0;
  let errors = 0;
  let denied = 0;

  return {
    record(metric: InteractionMetric): void {
      total += 1;
      if (metric.status === 'error') errors += 1;
      if (metric.status === 'denied') denied += 1;

      if (samples.length >= maxSamples) {
        // Discard oldest sample to maintain sliding window
        samples.shift();
      }
      samples.push(metric.durationMs);
    },

    snapshot(): LatencySnapshot {
      if (samples.length === 0) {
        return {
          total,
          errors,
          denied,
          minMs: 0,
          maxMs: 0,
          avgMs: 0,
          p50Ms: 0,
          p95Ms: 0,
          p99Ms: 0,
        };
      }

      const sorted = [...samples].sort((a, b) => a - b);
      const sum = sorted.reduce((acc, val) => acc + val, 0);
      const minMs = sorted[0] ?? 0;
      const maxMs = sorted[sorted.length - 1] ?? 0;
      const avgMs = Number((sum / sorted.length).toFixed(2));

      const percentile = (p: number): number => {
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return Number((sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0).toFixed(2));
      };

      return {
        total,
        errors,
        denied,
        minMs: Number(minMs.toFixed(2)),
        maxMs: Number(maxMs.toFixed(2)),
        avgMs,
        p50Ms: percentile(50),
        p95Ms: percentile(95),
        p99Ms: percentile(99),
      };
    },

    reset(): void {
      samples = [];
      total = 0;
      errors = 0;
      denied = 0;
    },
  };
}

/**
 * Safely invokes the interaction telemetry callback without ever disrupting the interaction lifecycle.
 *
 * @param handler - Configured telemetry callback.
 * @param metric - Interaction metrics payload.
 * @param logger - Logger to record any telemetry handler failure.
 *
 * @internal
 */
export async function emitInteractionMetric(
  handler: InteractionTelemetryHandler | undefined,
  metric: InteractionMetric,
  logger?: { warn(message: string, context?: Record<string, unknown>): void },
): Promise<void> {
  if (!handler) return;
  try {
    await handler(metric);
  } catch (err) {
    logger?.warn('Interaction telemetry handler threw an unhandled error', { error: err });
  }
}
