/** SCR-001 Record evidence: photo, voice note or text, approximate location shown as a district. */

import { useEffect, useRef, useState } from "react";
import type { District, IngestionClient } from "../api";
import { ApiError } from "../api";
import { Notice, RegionName } from "../components";
import { Icon } from "../icons";
import { T, t } from "../copy";
import type { Capability, Recording } from "../device";
import {
  approximatePosition,
  captureFrame,
  EmptyRecording,
  LocationUnavailable,
  openCamera,
  PermissionDenied,
  startRecording,
  stopStream,
} from "../device";
import type { CaptureState, EvidenceItem } from "../state";
import { errorText } from "../errors";
import { newItem } from "../state";

const DENIED_TEXT = {
  camera: "TXT-WIT-048",
  microphone: "TXT-WIT-049",
  geolocation: "TXT-WIT-050",
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

export function Capture({
  client,
  state,
  update,
  withPermission,
  onSocial,
  onContinue,
  busy,
  error,
}: Props) {
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
    } else if (err instanceof LocationUnavailable) {
      // Same way out as a refused permission: say why, and let the reporter pick the district.
      setLocationNote(T[err.reason === "timeout" ? "TXT-WIT-034" : "TXT-WIT-033"]);
      void showPicker();
    } else {
      setLocalError(errorText(err));
    }
  };

  const camera = () =>
    withPermission(
      "camera",
      () => {
        setLocalError(null);
        void openCamera().then(setStream, (err) => failed("camera", err));
      },
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
      () => {
        setLocalError(null);
        void startRecording().then(setRecording, (err) => failed("microphone", err));
      },
      () => {
        markDenied("microphone");
        narrativeRef.current?.focus();
      },
    );

  const stopRecord = async () => {
    if (!recording) return;
    let result: { blob: Blob; seconds: number };
    try {
      result = await recording.stop();
    } catch (err) {
      setRecording(null);
      // Nothing was recorded: not added as evidence; the reporter can record again or type the story.
      setLocalError(err instanceof EmptyRecording ? T["TXT-WIT-036"] : errorText(err));
      return;
    }
    setRecording(null);
    const { blob, seconds } = result;
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    addItems([{ ...newItem("audio", blob, `voice.${ext}`), seconds }]);
  };

  const showPicker = async () => {
    setPicking(true);
    if (districts) return;
    try {
      setDistricts(await client.districts());
    } catch (err) {
      setLocalError(errorText(err));
    }
  };

  const locate = () =>
    withPermission(
      "geolocation",
      async () => {
        setLocating(true);
        setLocationNote(null);
        setLocalError(null);
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
  const screenshots = state.items.filter((i) => i.kind === "screenshot").length;
  const removeItem = (key: string) => update({ items: state.items.filter((i) => i.key !== key) });

  return (
    <main className="screen" data-screen="SCR-001">
      <div className="intro">
        <h1>{T["TXT-WIT-010"]}</h1>
        <p className="lead">{T["TXT-WIT-003"]}</p>
      </div>


      <section aria-labelledby="photo-heading">
        <h2 id="photo-heading">{T["TXT-WIT-011"]}</h2>
        {denied.includes("camera") && <Notice tone="warning">{T[DENIED_TEXT.camera]}</Notice>}
        {photos.length > 0 && (
          <ul className="items" aria-label={T["TXT-WIT-011"]}>
            {photos.map((item, index) => (
              <li key={item.key} className="item">
                <img className="item-thumb" src={item.previewUrl} alt={`${T["TXT-WIT-011"]} ${index + 1}`} />
                <span className="item-body">
                  <span className="item-name">{item.name}</span>
                  <span className="item-meta">{T["TXT-WIT-210"]}</span>
                </span>
                <button
                  type="button"
                  className="button ghost small"
                  aria-label={`${T["TXT-WIT-016"]} ${T["TXT-WIT-011"].toLowerCase()} ${index + 1}`}
                  onClick={() => removeItem(item.key)}
                >
                  {T["TXT-WIT-016"]}
                </button>
              </li>
            ))}
          </ul>
        )}
        {stream ? (
          <div className="camera">
            <video ref={videoRef} autoPlay playsInline muted data-testid="camera-preview" />
            <div className="row">
              <button type="button" className="button primary grow" onClick={snap}>
                <Icon name="camera" />
                {T["TXT-WIT-014"]}
              </button>
              <button
                type="button"
                className="button grow"
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
          <div className="stack">
            <button
              type="button"
              className={photos.length > 0 ? "button start" : "button start primary"}
              onClick={camera}
            >
              <Icon name="camera" />
              {T["TXT-WIT-012"]}
            </button>
            <label className="button start">
              <Icon name="image" />
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
      </section>

      <section aria-labelledby="voice-heading">
        <h2 id="voice-heading">{T["TXT-WIT-017"]}</h2>
        {denied.includes("microphone") && <Notice tone="warning">{T[DENIED_TEXT.microphone]}</Notice>}
        {recording ? (
          <button type="button" className="recorder recorder--live" onClick={stopRecord}>
            <span className="recorder-icon">
              <Icon name="stop" />
            </span>
            <span className="recorder-text">
              <span className="recorder-title">
                <span className="rec-dot" aria-hidden="true" />
                {T["TXT-WIT-019"]}
              </span>
            </span>
          </button>
        ) : (
          audio.length === 0 && (
            <button type="button" className="recorder" onClick={record} aria-describedby="record-hint">
              <span className="recorder-icon">
                <Icon name="mic" />
              </span>
              <span className="recorder-text">
                <span className="recorder-title">{T["TXT-WIT-018"]}</span>
                <span className="recorder-hint" id="record-hint" aria-hidden="true">
                  {T["TXT-WIT-211"]}
                </span>
              </span>
            </button>
          )
        )}
        {audio.map((item) => (
          <div className="item item--audio" key={item.key}>
            <span className="item-thumb item-thumb--round">
              <Icon name="mic" />
            </span>
            <span className="item-body">
              <span className="item-name" data-testid="voice-note">
                {t("TXT-WIT-020", { detik: item.seconds ?? 0 })}
              </span>
              <audio controls src={item.previewUrl} onError={() => setLocalError(T["TXT-WIT-037"])} />
            </span>
            <button
              type="button"
              className="button ghost small"
              aria-label={`${T["TXT-WIT-016"]} ${T["TXT-WIT-017"].toLowerCase()}`}
              onClick={() => removeItem(item.key)}
            >
              {T["TXT-WIT-016"]}
            </button>
          </div>
        ))}
      </section>

      <div className="field">
        <label className="field-label" htmlFor="narrative">
          {T["TXT-WIT-021"]}
        </label>
        <textarea
          id="narrative"
          ref={narrativeRef}
          rows={4}
          maxLength={5000}
          placeholder={T["TXT-WIT-227"]}
          aria-describedby="narrative-hint"
          value={state.narrative}
          onChange={(event) => update({ narrative: event.target.value })}
        />
        <p className="field-hint" id="narrative-hint">
          {T["TXT-WIT-022"]}
        </p>
      </div>

      <section aria-labelledby="location-heading">
        <h2 id="location-heading">{T["TXT-WIT-023"]}</h2>
        {denied.includes("geolocation") && <Notice tone="warning">{T[DENIED_TEXT.geolocation]}</Notice>}
        {locationNote && <Notice tone="warning">{locationNote}</Notice>}
        {state.district && <RegionName region={state.district} synthetic={!!state.district.synthetic} />}
        <button type="button" className="button start" onClick={locate} disabled={locating}>
          <Icon name="pin" />
          {T["TXT-WIT-024"]}
        </button>
        {!picking && (
          <button type="button" className="button link" onClick={showPicker}>
            {T["TXT-WIT-025"]}
          </button>
        )}
        {picking && (
          <div className="field">
            <label className="field-label" htmlFor="district">
              {T["TXT-WIT-026"]}
            </label>
            <select
              id="district"
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
          </div>
        )}
        <p className="field-hint">{T["TXT-WIT-027"]}</p>
      </section>

      <section>
        {state.sharedPost && (
          <div className="item">
            <span className="item-thumb">
              <Icon name="link" />
            </span>
            <p className="item-body" data-testid="shared-post-attached">
              <span className="item-name">{T["TXT-WIT-069"]}:</span>{" "}
              <span className="item-meta mono">{state.sharedPost.url}</span>
            </p>
          </div>
        )}
        <button type="button" className="button start" onClick={onSocial}>
          <Icon name="link" />
          {T["TXT-WIT-029"]}
          {screenshots > 0 && ` (${screenshots})`}
        </button>
      </section>

      <div className="actions">
        {(error || localError) && <Notice tone="error">{error ?? localError}</Notice>}
        {busy && <Notice tone="info">{T["TXT-WIT-032"]}</Notice>}
        <button
          type="button"
          className="button primary lg wide"
          onClick={onContinue}
          disabled={busy || !!recording}
        >
          {T["TXT-WIT-030"]}
        </button>
      </div>
    </main>
  );
}
