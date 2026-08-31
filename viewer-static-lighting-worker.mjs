import { bakeAllSplatsDirectLightAsync } from "./viewer-static-lighting.mjs";
import { computeAllSplatLightTransmissionAsync } from "./viewer-light-occlusion.mjs";

const cancelledJobs = new Set();
const workerScope = globalThis.self;

/**
 * Yield to the Worker task queue without the timer clamp that makes a large
 * bake spend most of its time between cooperative chunks. The factory keeps
 * one channel for every bake so all of its indexing, tracing, and bounce
 * yields share the same queue while still allowing cancel messages through.
 */
export const createWorkerTaskYield = ({
  MessageChannelClass = globalThis.MessageChannel,
  setTimeoutFn = globalThis.setTimeout,
} = {}) => {
  if (typeof MessageChannelClass === "function") {
    try {
      const channel = new MessageChannelClass();
      const pending = [];
      channel.port1.onmessage = () => pending.shift()?.();
      return () => new Promise((resolve) => {
        pending.push(resolve);
        channel.port2.postMessage(null);
      });
    } catch {
      // Some Worker-like runtimes expose MessageChannel without allowing it.
    }
  }
  return () => new Promise((resolve) => setTimeoutFn(resolve, 0));
};

workerScope?.addEventListener?.("message", async (event) => {
  const message = event.data ?? {};
  if (message.type === "cancel") {
    cancelledJobs.add(message.jobId);
    return;
  }
  if (message.type !== "bake" && message.type !== "occlusion") return;
  const { jobId, light, lights, mode, snapshot } = message;
  const operation = message.type;
  try {
    let lastPhase = null;
    let lastProgressAt = 0;
    let lastStage = null;
    const postProgress = (progress) => {
      const now = Date.now();
      const phaseChanged = progress.phase !== lastPhase;
      const stageChanged = progress.stage !== lastStage;
      const complete = progress.total !== undefined && progress.processed >= progress.total;
      if (!phaseChanged && !stageChanged && !complete && now - lastProgressAt < 50) return;
      lastPhase = progress.phase;
      lastStage = progress.stage;
      lastProgressAt = now;
      self.postMessage({ ...progress, jobId, type: "progress" });
    };
    const result = operation === "occlusion"
      ? await computeAllSplatLightTransmissionAsync({
        lights,
        snapshot,
        shouldCancel: () => cancelledJobs.has(jobId),
        onProgress: postProgress,
        yieldToEventLoop: createWorkerTaskYield(),
      })
      : await bakeAllSplatsDirectLightAsync({
        light,
        mode,
        snapshot,
        shouldCancel: () => cancelledJobs.has(jobId),
        onProgress: postProgress,
        yieldToEventLoop: createWorkerTaskYield(),
      });
    if (result.canceled) {
      const canceled = { jobId, phase: result.phase ?? "canceled", processed: result.processed, total: result.total, type: "canceled" };
      if (operation === "occlusion") {
        canceled.diagnostics = result.diagnostics;
        canceled.lightCount = result.lightCount;
        canceled.lightIds = result.lightIds;
        canceled.transmission = result.transmission;
      }
      self.postMessage(canceled);
      return;
    }
    const transfer = operation === "occlusion"
      ? [result.transmission.buffer]
      : [
        result.bakedLinearRgb.buffer,
        result.transmission.buffer,
        result.opticalDepth.buffer,
      ];
    if (operation === "bake" && result.selectedSourceIndices instanceof Uint32Array) transfer.push(result.selectedSourceIndices.buffer);
    self.postMessage({ jobId, result, type: "complete" }, transfer);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : (operation === "occlusion" ? "Light occlusion failed" : "Static bake failed"),
      jobId,
      type: "error",
    });
  } finally {
    cancelledJobs.delete(jobId);
  }
});
