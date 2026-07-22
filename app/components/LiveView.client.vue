<script setup lang="ts">
import { buildCodecString, detectCodec, groupAccessUnits, splitNalUnits } from "~/utils/annexB";
import type { NalCodec } from "~/utils/annexB";

const { active, starting, transport, streamUrl, error, diagnostics, note, start, stop } = useLiveView();

const canvas = ref<HTMLCanvasElement | null>(null);
let decoder: VideoDecoder | null = null;
let abort: AbortController | null = null;

/** Bytes that arrived mid-NAL and must be prepended to the next chunk. */
let carry = new Uint8Array(0);
let codec: NalCodec | null = null;
let configured = false;
let timestamp = 0;

function paint(frame: VideoFrame) {
  const element = canvas.value;
  if (!element) {
    frame.close();
    return;
  }
  if (element.width !== frame.displayWidth) element.width = frame.displayWidth;
  if (element.height !== frame.displayHeight) element.height = frame.displayHeight;
  element.getContext("2d")?.drawImage(frame, 0, 0);
  frame.close();
}

async function consumeAnnexB(url: string) {
  abort = new AbortController();
  const response = await fetch(url, { signal: abort.signal });
  const reader = response.body?.getReader();
  if (!reader) throw new Error("the local stream returned no body");

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    const merged = new Uint8Array(carry.length + value.length);
    merged.set(carry);
    merged.set(value, carry.length);

    const units = splitNalUnits(merged);
    if (units.length === 0) {
      carry = merged;
      continue;
    }
    // The last unit may be incomplete; hold it back for the next chunk.
    const complete = units.slice(0, -1);
    const tail = units.at(-1)!;
    carry = new Uint8Array(4 + tail.length);
    carry.set([0, 0, 0, 1]);
    carry.set(tail, 4);
    if (complete.length === 0) continue;

    codec ??= detectCodec(complete);
    if (!codec) continue;

    if (!configured) {
      const codecString = buildCodecString(complete, codec);
      if (!codecString) continue;
      note(`Detected ${codec}, codec string ${codecString}.`);
      decoder = new VideoDecoder({
        output: paint,
        error: (cause) => {
          error.value = `Decoder error: ${cause.message}`;
          note(error.value);
        },
      });
      try {
        decoder.configure({ codec: codecString, optimizeForLatency: true });
      } catch (cause) {
        error.value = `VideoDecoder rejected "${codecString}": ${
          cause instanceof Error ? cause.message : String(cause)
        }`;
        note(error.value);
        return;
      }
      configured = true;
    }

    for (const unit of groupAccessUnits(complete, codec)) {
      // Wait for a keyframe before feeding the decoder anything
      if (!unit.key && timestamp === 0) continue;
      decoder?.decode(
        new EncodedVideoChunk({
          type: unit.key ? "key" : "delta",
          timestamp: timestamp,
          data: unit.data,
        }),
      );
      timestamp += 33333; // ~30fps in microseconds
    }
  }
}

function reset() {
  abort?.abort();
  abort = null;
  try {
    decoder?.close();
  } catch {
    // Already closed; nothing to do
  }
  decoder = null;
  carry = new Uint8Array(0);
  codec = null;
  configured = false;
  timestamp = 0;
}

watch([active, transport, streamUrl], async ([on, kind, url]) => {
  if (!on || kind !== "annexb" || !url) {
    reset();
    return;
  }
  try {
    await consumeAnnexB(url);
  } catch (cause) {
    if ((cause as Error)?.name === "AbortError") return;
    error.value = cause instanceof Error ? cause.message : String(cause);
    note(`Stream read failed: ${error.value}`);
  }
});

onBeforeUnmount(() => {
  reset();
  void stop();
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <UButton
        :label="active ? 'Stop live view' : 'Start live view'"
        :loading="starting"
        :icon="active ? 'i-lucide-square' : 'i-lucide-video'"
        color="primary"
        @click="active ? stop() : start()"
      />
      <span v-if="transport" class="text-sm text-muted">
        transport: {{ transport }}
      </span>
    </div>

    <UAlert
      v-if="error"
      icon="i-lucide-triangle-alert"
      color="warning"
      variant="subtle"
      :title="error"
    />

    <div class="overflow-hidden rounded-lg bg-elevated">
      <img v-if="active && transport === 'mjpeg' && streamUrl" :src="streamUrl" class="w-full" >
      <canvas v-show="active && transport === 'annexb'" ref="canvas" class="w-full" />
      <p v-if="!active" class="p-8 text-center text-sm text-muted">
        Live view is stopped.
      </p>
    </div>

    <details v-if="diagnostics.length > 0" class="text-sm">
      <summary class="cursor-pointer text-muted">Diagnostics</summary>
      <pre class="mt-2 overflow-x-auto rounded bg-elevated p-3 text-xs">{{ diagnostics.join("\n") }}</pre>
    </details>
  </div>
</template>
