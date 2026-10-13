/**
 * Device capabilities: permission state, camera stream, voice recording, approximate position.
 * Permissions are requested only when the reporter presses the button, after the explainer (SCR-002).
 */

export type Capability = "camera" | "microphone" | "geolocation";

export type PermissionStatus = "granted" | "denied" | "prompt";

export async function permissionStatus(kind: Capability): Promise<PermissionStatus> {
  try {
    const status = await navigator.permissions.query({ name: kind as PermissionName });
    return status.state;
  } catch {
    return "prompt"; // the browser cannot query this permission: treat as not asked yet
  }
}

export class PermissionDenied extends Error {
  constructor(readonly capability: Capability) {
    super(`${capability} permission denied`);
    this.name = "PermissionDenied";
  }
}

function denied(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
}

export async function openCamera(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
      audio: false,
    });
  } catch (error) {
    if (denied(error)) throw new PermissionDenied("camera");
    throw error;
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** One frame of a playing <video> as a JPEG. */
export function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("capture failed"))), "image/jpeg", 0.9),
  );
}

const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

export interface Recording {
  stop(): Promise<{ blob: Blob; seconds: number }>;
  cancel(): void;
}

export async function startRecording(): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (error) {
    if (denied(error)) throw new PermissionDenied("microphone");
    throw error;
  }
  const mimeType = AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const started = performance.now();
  recorder.start(250);
  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          stopStream(stream);
          const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
          resolve({ blob: new Blob(chunks, { type }), seconds: Math.round((performance.now() - started) / 1000) });
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      stopStream(stream);
    },
  };
}

/** Approximate position, used once to find the district and then dropped. */
export function approximatePosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new PermissionDenied("geolocation"));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      (error) => reject(error.code === error.PERMISSION_DENIED ? new PermissionDenied("geolocation") : error),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  });
}
