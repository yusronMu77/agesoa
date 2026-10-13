/** SCR-001 Record evidence: photo, voice note or text, approximate location shown as a district. */

import { useEffect, useRef, useState } from "react";
import type { District, IngestionClient } from "../api";
import { ApiError } from "../api";
import { Notice, RegionName } from "../components";
import { T, t } from "../copy";
import type { Capability, Recording } from "../device";
import {
  approximatePosition,
  captureFrame,
  openCamera,
  PermissionDenied,
  startRecording,
  stopStream,
} from "../device";
import type { CaptureState, EvidenceItem } from "../state";
import { newItem } from "../state";

const DENIED_TEXT = {
  camera: T["TXT-WIT-048"],
  microphone: T["TXT-WIT-049"],
  geolocation: T["TXT-WIT-050"],
} as const;

interface Props {
  client: IngestionClient;
  state: CaptureState;
  update: (change: Partial<CaptureState>) => void;
  /** Runs `action` after the permission explainer when the capability is not granted yet. */
  withPermission: (kind: Capability, action: () => void, onSkip: () => void) => void;
  onSocial: () => void;
  onContinue: () => void;
  busy: boolean;
  error: string | null;
}

export function Capture({ client, state, update, withPermission, onSocial, onContinue, busy, error }: Props) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [denied, setDenied] = useState<Capability[]>([]);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [districts, setDistricts] = useState<District[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const narrativeRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  useEffect(() => () => stopStream(stream), [stream]);
  useEffect(() => () => recording?.cancel(), [recording]);

  const markDenied = (kind: Capability) => setDenied((list) => (list.includes(kind) ? list : [...list, kind]));
  const addItems = (items: EvidenceItem[]) => update({ items: [...state.items, ...items] });

  const failed = (kind: Capability, err: unknown) => {
    if (err instanceof PermissionDenied) {
      markDenied(kind);
      if (kind === "microphone") narrativeRef.current?.focus();
      if (kind === "geolocation") void showPicker();
    } else {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  const camera = () =>
    withPermission(
      "camera",
      () => openCamera().then(setStream, (err) => failed("camera", err)),
      () => markDenied("camera"),
    );

  const snap = async () => {
    if (!videoRef.current) return;
    const blob = await captureFrame(videoRef.current);
    addItems([newItem("photo", blob, `photo-${state.items.length + 1}.jpg`)]);
    stopStream(stream);
    setStream(null);
  };

  const record = () =>
    withPermission(
      "microphone",
      () => startRecording().then(setRecording, (err) => failed("microphone", err)),
      () => {
        markDenied("microphone");
        narrativeRef.current?.focus();
      },
    );

  const stopRecord = async () => {
    if (!recording) return;
    const { blob, seconds } = await recording.stop();
    setRecording(null);
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    addItems([{ ...newItem("audio", blob, `voice.${ext}`), seconds }]);
  };

  const showPicker = async () => {
    setPicking(true);
    if (districts) return;
    try {
      setDistricts(await client.districts());
    } catch (err) {
      setLocalError(err instanceof ApiError && err.status === null ? T["TXT-WIT-130"] : String(err));
    }
  };

  const locate = () =>
    withPermission(
      "geolocation",
      async () => {
        setLocating(true);
        setLocationNote(null);
        try {
          const { lat, lon } = await approximatePosition();
          update({ district: await client.resolveDistrict(lat, lon) });
          setPicking(false);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            setLocationNote(T["TXT-WIT-028"]);
            void showPicker();
          } else {
            failed("geolocation", err);
          }
        } finally {
          setLocating(false);
        }
      },
      () => {
        markDenied("geolocation");
        void showPicker();
      },
    );

  const photos = state.items.filter((i) => i.kind === "photo");
  const audio = state.items.filter((i) => i.kind === "audio");
  const removeItem = (key: string) => update({ items: state.items.filter((i) => i.key !== key) });

  return (
    <main className="screen" data-screen="SCR-001">
      <h1>{T["TXT-WIT-010"]}</h1>
      <p className="lead">{T["TXT-WIT-003"]}</p>

      <section aria-labelledby="photo-heading">
        <h2 id="photo-heading">{T["TXT-WIT-011"]}</h2>
        {denied.includes("camera") && <Notice tone="info">{DENIED_TEXT.camera}</Notice>}
        {stream ? (
          <div className="camera">
            <video ref={videoRef} autoPlay playsInline muted data-testid="camera-preview" />
            <div className="row">
              <button type="button" className="button primary" onClick={snap}>
                {T["TXT-WIT-014"]}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  stopStream(stream);
                  setStream(null);
                }}
              >
                {T["TXT-WIT-015"]}
              </button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="button" onClick={camera}>
              {T["TXT-WIT-012"]}
            </button>
            <label className="button">
              {T["TXT-WIT-013"]}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="visually-hidden"
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  addItems(files.map((f) => newItem("photo", f, f.name)));
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        )}
        {photos.length > 0 && (
          <ul className="thumbs" aria-label={T["TXT-WIT-011"]}>
            {photos.map((item, index) => (
              <li key={item.key}>
                <img src={item.previewUrl} alt={`${T["TXT-WIT-011"]} ${index + 1}`} />
                <button
                  type="button"
                  className="button small"
                  aria-label={`${T["TXT-WIT-016"]} ${T["TXT-WIT-011"].toLowerCase()} ${index + 1}`}
                  onClick={() => removeItem(item.key)}
                >
                  {T["TXT-WIT-016"]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="voice-heading">
        <h2 id="voice-heading">{T["TXT-WIT-017"]}</h2>
        {denied.includes("microphone") && <Notice tone="info">{DENIED_TEXT.microphone}</Notice>}
        {recording ? (
          <button type="button" className="button danger" onClick={stopRecord}>
            <span className="rec-dot" aria-hidden="true" />
            {T["TXT-WIT-019"]}
          </button>
        ) : (
          audio.length === 0 && (
            <button type="button" className="button" onClick={record}>
              {T["TXT-WIT-018"]}
            </button>
          )
        )}
        {audio.map((item) => (
          <div className="row audio" key={item.key}>
            <span data-testid="voice-note">{t("TXT-WIT-020", { detik: item.seconds ?? 0 })}</span>
            <audio controls src={item.previewUrl} />
            <button
              type="button"
              className="button small"
              aria-label={`${T["TXT-WIT-016"]} ${T["TXT-WIT-017"].toLowerCase()}`}
              onClick={() => removeItem(item.key)}
            >
              {T["TXT-WIT-016"]}
            </button>
          </div>
        ))}
        <label className="field">
          <span className="field-label">{T["TXT-WIT-021"]}</span>
          <span className="field-hint">{T["TXT-WIT-022"]}</span>
          <textarea
            ref={narrativeRef}
            rows={4}
            maxLength={5000}
            value={state.narrative}
            onChange={(event) => update({ narrative: event.target.value })}
          />
        </label>
      </section>

      <section aria-labelledby="location-heading">
        <h2 id="location-heading">{T["TXT-WIT-023"]}</h2>
        {denied.includes("geolocation") && <Notice tone="info">{DENIED_TEXT.geolocation}</Notice>}
        {locationNote && <Notice tone="info">{locationNote}</Notice>}
        {state.district && <RegionName region={state.district} synthetic={!!state.district.synthetic} />}
        <div className="row">
          <button type="button" className="button" onClick={locate} disabled={locating}>
            {T["TXT-WIT-024"]}
          </button>
          {!picking && (
            <button type="button" className="button" onClick={showPicker}>
              {T["TXT-WIT-025"]}
            </button>
          )}
        </div>
        {picking && (
          <label className="field">
            <span className="field-label">{T["TXT-WIT-026"]}</span>
            <select
              value={state.district?.district_code ?? ""}
              onChange={(event) =>
                update({ district: districts?.find((d) => d.district_code === event.target.value) ?? null })
              }
            >
              <option value="" />
              {districts?.map((d) => (
                <option key={d.district_code} value={d.district_code ?? ""}>
                  {d.district_name}, {d.regency_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="field-hint">{T["TXT-WIT-027"]}</p>
      </section>

      <section>
        {state.sharedPost && (
          <p className="attached" data-testid="shared-post-attached">
            {T["TXT-WIT-069"]}: <span className="mono">{state.sharedPost.url}</span>
          </p>
        )}
        <button type="button" className="button link" onClick={onSocial}>
          {T["TXT-WIT-029"]}
          {state.items.some((i) => i.kind === "screenshot") &&
            ` (${state.items.filter((i) => i.kind === "screenshot").length})`}
        </button>
      </section>

      <div className="actions">
        {(error || localError) && <Notice tone="error">{error ?? localError}</Notice>}
        {busy && <Notice tone="info">{T["TXT-WIT-032"]}</Notice>}
        <button type="button" className="button primary wide" onClick={onContinue} disabled={busy || !!recording}>
          {T["TXT-WIT-030"]}
        </button>
      </div>
    </main>
  );
}
