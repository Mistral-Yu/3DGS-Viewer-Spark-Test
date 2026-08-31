import {
  bakeAllSplatsDirectLightAsync,
  createStaticBakeJobToken,
  STATIC_BAKE_MODE,
} from "./viewer-static-lighting.mjs";
import { computeAllSplatLightTransmissionAsync } from "./viewer-light-occlusion.mjs";

export function createMainThreadTaskYield({
  MessageChannelClass = globalThis.MessageChannel,
  setTimeoutFn = globalThis.setTimeout,
} = {}) {
  try {
    if (typeof MessageChannelClass !== "function") throw new Error("MessageChannel unavailable");
    const channel = new MessageChannelClass();
    const pending = [];
    channel.port1.onmessage = () => pending.shift()?.();
    const yieldTask = () => new Promise((resolve) => {
      pending.push(resolve);
      channel.port2.postMessage(0);
    });
    yieldTask.dispose = () => {
      channel.port1.close?.();
      channel.port2.close?.();
      pending.splice(0).forEach((resolve) => resolve());
    };
    return yieldTask;
  } catch {
    const yieldTask = () => new Promise((resolve) => setTimeoutFn(resolve, 0));
    yieldTask.dispose = () => {};
    return yieldTask;
  }
}

export function createThrottledProgressReporter(onProgress, {
  intervalMs = 50,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
} = {}) {
  if (typeof onProgress !== "function") return undefined;
  let lastAt = Number.NEGATIVE_INFINITY;
  let lastPhase = "";
  let lastStage = "";
  return (progress) => {
    const phase = progress?.phase ?? "";
    const stage = progress?.stage ?? "";
    const time = now();
    if (phase === lastPhase && stage === lastStage && time - lastAt < intervalMs) return;
    lastAt = time;
    lastPhase = phase;
    lastStage = stage;
    onProgress(progress);
  };
}

// Keep restore-only identity/quaternion data on the main thread.  Structured
// clone still owns the typed data in the Worker, but this explicitly limits
// Worker payloads to fields used by the bake kernel.
export function createStaticBakeWorkerSnapshot(snapshot) {
  return {
    authoredDiffuseAlbedo: snapshot.authoredDiffuseAlbedo,
    authoredSurfaceArea: snapshot.authoredSurfaceArea,
    center: snapshot.center,
    count: snapshot.count,
    hasAuthoredBounceMaterial: snapshot.hasAuthoredBounceMaterial,
    hasAuthoredNormal: snapshot.hasAuthoredNormal,
    itemIndex: snapshot.itemIndex,
    linearRgb: snapshot.linearRgb,
    normal: snapshot.normal,
    opacity: snapshot.opacity,
    scale: snapshot.scale,
    sourceIndex: snapshot.sourceIndex,
    unsupportedStaticBakeTransformCount: snapshot.unsupportedStaticBakeTransformCount,
  };
}

export function createLightOcclusionWorkerSnapshot(snapshot) {
  return {
    center: snapshot.center,
    count: snapshot.count,
    itemIndex: snapshot.itemIndex,
    opacity: snapshot.opacity,
    scale: snapshot.scale,
    sourceIndex: snapshot.sourceIndex,
    unsupportedStaticBakeTransformCount: snapshot.unsupportedStaticBakeTransformCount,
  };
}

/** Retain only the stable lookup needed to restore RGB after a successful bake. */
export function createStaticBakeRestoreHandle(snapshot) {
  const count = Math.max(0, Math.floor(Number(snapshot?.count) || 0));
  if (snapshot?.itemIndex?.length < count || snapshot?.sourceIndex?.length < count) {
    throw new Error("Static bake restore mapping is incomplete");
  }
  return Object.freeze({
    count,
    itemIds: Object.freeze(Array.from(snapshot?.itemIds ?? [])),
    itemIndex: snapshot.itemIndex,
    sourceIndex: snapshot.sourceIndex,
  });
}

/**
 * Small ownership controller around the module Worker. A job result is never
 * applied here: callers compare the immutable scene revision before applying.
 */
export class StaticLightingBakeController {
  constructor({
    protocol = globalThis.location?.protocol,
    workerUrl = new URL("./viewer-static-lighting-worker.mjs", globalThis.location?.href ?? "http://localhost/"),
    WorkerClass = globalThis.Worker,
  } = {}) {
    this.protocol = protocol;
    this.workerUrl = workerUrl;
    this.WorkerClass = WorkerClass;
    this.active = null;
    this.nextJobId = 0;
  }

  cancel() {
    const active = this.active;
    if (!active) return false;
    active.cancelled = true;
    active.token?.cancel();
    active.worker?.postMessage({ jobId: active.jobId, type: "cancel" });
    return true;
  }

  start({ light, mode = STATIC_BAKE_MODE.DIRECT, onProgress, snapshot }) {
    return this.startTask({
      createWorkerMessage: () => ({
        light,
        mode,
        snapshot: createStaticBakeWorkerSnapshot(snapshot),
        type: "bake",
      }),
      onProgress,
      runFallback: ({ onProgress: reportProgress, shouldCancel, yieldToEventLoop }) => bakeAllSplatsDirectLightAsync({
        light,
        mode,
        onProgress: reportProgress,
        shouldCancel,
        snapshot,
        yieldToEventLoop,
      }),
    });
  }

  /** Start bounded, visibility-only multi-light occlusion without touching RGB. */
  startOcclusion({ lights, onProgress, snapshot } = {}) {
    return this.startTask({
      createWorkerMessage: () => ({
        lights,
        snapshot: createLightOcclusionWorkerSnapshot(snapshot),
        type: "occlusion",
      }),
      onProgress,
      runFallback: ({ onProgress: reportProgress, shouldCancel, yieldToEventLoop }) => computeAllSplatLightTransmissionAsync({
        lights,
        onProgress: reportProgress,
        shouldCancel,
        snapshot,
        yieldToEventLoop,
      }),
    });
  }

  startTask({ createWorkerMessage, onProgress, runFallback }) {
    this.cancel();
    const jobId = ++this.nextJobId;
    const active = { cancelled: false, jobId, token: null, worker: null };
    const reportProgress = createThrottledProgressReporter(onProgress);
    this.active = active;
    const finish = (result) => {
      if (this.active === active) this.active = null;
      active.worker?.terminate?.();
      return result;
    };
    const fail = (error) => {
      if (this.active === active) this.active = null;
      active.worker?.terminate?.();
      throw error;
    };
    const fallback = async (reason) => {
      const yieldToEventLoop = createMainThreadTaskYield();
      try {
        active.token = createStaticBakeJobToken();
        const result = await runFallback({
          onProgress: reportProgress,
          shouldCancel: () => active.cancelled || !active.token.isActive(),
          yieldToEventLoop,
        });
        return finish({ ...result, execution: "main-thread-fallback", workerFailure: reason });
      } catch (error) {
        return fail(error);
      } finally {
        yieldToEventLoop.dispose?.();
      }
    };
    // Browsers intentionally reject module Workers from a null file:// origin.
    // The async kernel yields cooperatively, so local-file mode can use the
    // same exact all-splat path without freezing the UI or imposing a size cap.
    if (this.protocol === "file:") {
      return fallback("Local file mode");
    }
    if (typeof this.WorkerClass !== "function") {
      return fallback("Module Worker is unavailable");
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        if (this.active === active) this.active = null;
        active.worker?.terminate?.();
        reject(error);
      };
      const resolveOnce = (result) => {
        if (settled) return;
        settled = true;
        resolve(finish(result));
      };
      const useFallback = (reason) => {
        if (settled) return;
        settled = true;
        active.worker?.terminate?.();
        fallback(reason).then(resolve, reject);
      };
      try {
        active.worker = new this.WorkerClass(this.workerUrl, { type: "module" });
        active.worker.addEventListener("message", (event) => {
          const message = event.data ?? {};
          if (message.jobId !== jobId) return;
          if (message.type === "progress") {
            const { jobId: ignoredJobId, type: ignoredType, ...progress } = message;
            reportProgress?.(progress);
          } else if (message.type === "canceled") {
            const { jobId: ignoredJobId, type: ignoredType, ...result } = message;
            resolveOnce({ ...result, canceled: true, execution: "worker", phase: result.phase ?? "canceled" });
          } else if (message.type === "complete") {
            resolveOnce({ ...message.result, execution: "worker" });
          } else if (message.type === "error") {
            rejectOnce(new Error(message.error || "Static bake Worker failed"));
          }
        });
        active.worker.addEventListener("error", () => {
          useFallback("Module Worker could not load");
        }, { once: true });
        active.worker.postMessage({ jobId, ...createWorkerMessage() });
      } catch (error) {
        useFallback(error instanceof Error ? error.message : "Module Worker could not start");
      }
    });
  }
}
