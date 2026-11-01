/** SCR-001 Record evidence: photo, voice note or text, approximate location shown as a district. */

import { useEffect, useRef, useState } from "react";
import type { District, IngestionClient } from "../api";
import { ApiError } from "../api";
import { ConfirmDialog, Notice } from "../components";
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
  takeNativePhoto,
} from "../device";
import { isNative } from "../native";
import type { CaptureState, EvidenceItem } from "../state";
import { errorText } from "../errors";
import { newItem, withoutDenied } from "../state";

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
  /** The report form (general domain pack) could not be loaded; the reporter can try again. */
  packFailed?: boolean;
  onRetryPack?: () => void;
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
  packFailed = false,
  onRetryPack,
}: Props) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [districts, setDistricts] = useState<District[] | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  // The photo waiting for "Hapus foto dari draf?" (dialogs.json PRV-remove).
  const [removing, setRemoving] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const narrativeRef = useRef<HTMLTextAreaElement>(null);
  const districtRef = useRef<HTMLSelectElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  useEffect(() => () => stopStream(stream), [stream]);
  useEffect(() => () => recording?.cancel(), [recording]);

  const loadDistricts = async () => {
    if (districts) return;
    try {
      setDistricts(await client.districts());
    } catch (err) {
      setLocalError(errorText(err));
    }
  };
  // The district picker is always on screen (SCR-001), so its list is read once when the screen opens.
  useEffect(() => {
    void loadDistricts();
  }, []);

  const denied = state.denied;
  const markDenied = (kind: Capability) => {
    if (!denied.includes(kind)) update({ denied: [...denied, kind] });
  };
  const clearDenied = (kind: Capability) => {
    if (denied.includes(kind)) update({ denied: withoutDenied(denied, kind) });
  };
  const addItems = (items: EvidenceItem[]) => update({ items: [...state.items, ...items] });

  /** The way out of a failed location: the district picker, focused. */
  const pickDistrict = () => {
    void loadDistricts();
    requestAnimationFrame(() => districtRef.current?.focus());
  };

  const failed = (kind: Capability, err: unknown) => {
    if (err instanceof PermissionDenied) {
      markDenied(kind);
      if (kind === "microphone") narrativeRef.current?.focus();
      if (kind === "geolocation") pickDistrict();
    } else if (err instanceof LocationUnavailable) {
      // Same way out as a refused permission: say why, and let the reporter pick the district.
      setLocationNote(T[err.reason === "timeout" ? "TXT-WIT-034" : "TXT-WIT-033"]);
      pickDistrict();
    } else {
      setLocalError(errorText(err));
    }
  };

  const camera = () =>
    withPermission(
      "camera",
      () => {
        setLocalError(null);
        if (isNative()) {
          void takeNativePhoto().then(
            (blob) => {
              if (!blob) return;
              clearDenied("camera");
              addItems([newItem("photo", blob, `photo-${state.items.length + 1}.jpg`)]);
            },
            (err) => failed("camera", err),
          );
          return;
        }
        void openCamera().then(
          (opened) => {
            clearDenied("camera");
            setStream(opened);
          },
          (err) => failed("camera", err),
        );
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
        void startRecording().then(
          (started) => {
            clearDenied("microphone");
            setRecording(started);
          },
          (err) => failed("microphone", err),
        );
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

  const togglePlay = (key: string) => {
    const audio = audioRefs.current[key];
    if (!audio) return;
    if (playing === key) {
      audio.pause();
      return;
    }
    Object.values(audioRefs.current).forEach((other) => other?.pause());
    void audio.play().then(
      () => setPlaying(key),
      () => setLocalError(T["TXT-WIT-037"]),
    );
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
          clearDenied("geolocation");
          update({ district: await client.resolveDistrict(lat, lon) });
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            setLocationNote(T["TXT-WIT-028"]);
            pickDistrict();
          } else {
            failed("geolocation", err);
          }
        } finally {
          setLocating(false);
        }
      },
      () => {
        markDenied("geolocation");
        pickDistrict();
      },
    );

  const photos = state.items.filter((i) => i.kind === "photo");
  const audio = state.items.filter((i) => i.kind === "audio");
  const screenshots = state.items.filter((i) => i.kind === "screenshot");
  const removeItem = (key: string) => update({ items: state.items.filter((i) => i.key !== key) });
  // A district resolved from the position is always one of the options, even before the list has loaded.
  const options =
    state.district && !districts?.some((d) => d.district_code === state.district?.district_code)
      ? [state.district, ...(districts ?? [])]
      : (districts ?? []);
  const hasLinks = state.sharedPost !== null || screenshots.length > 0;

  return (
    <main className="screen" data-screen="SCR-001">
      <div className="intro">
        <h1>{T["TXT-WIT-010"]}</h1>
        <p className="lead">{T["TXT-WIT-003"]}</p>
      </div>

      <section aria-labelledby="photo-heading">
        <h2 id="photo-heading">{T["TXT-WIT-011"]}</h2>
        {denied.includes("camera") && (
          <Notice tone="warning" split>
            {T[DENIED_TEXT.camera]}
          </Notice>
        )}
        {photos.length > 0 && (
          <ul className="items" aria-label={T["TXT-WIT-011"]}>
            {photos.map((item, index) => (
              <li key={item.key} className="item">
                <img className="item-thumb" src={item.previewUrl} alt={`${T["TXT-WIT-011"]} ${index + 1}`} />
                <span className="item-body">
                  <span className="item-name">{item.name}</span>
                  <span className="item-meta">{T["TXT-WIT-410"]}</span>
                </span>
                <button
                  type="button"
                  className="button ghost remove"
                  aria-label={`${T["TXT-WIT-016"]} ${T["TXT-WIT-011"].toLowerCase()} ${index + 1}`}
                  onClick={() => setRemoving(item.key)}
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
              className={photos.length > 0 ? "button tile" : "button tile primary"}
              onClick={camera}
            >
              <Icon name="camera" />
              {T["TXT-WIT-012"]}
            </button>
            {/* After the first photo the camera tile stays (SCR-001 mockup); the gallery stays too when the camera
                was refused, as its replacement. */}
            {(photos.length === 0 || denied.includes("camera")) && (
            <label className="button tile">
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
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="voice-heading">
        <h2 id="voice-heading">{T["TXT-WIT-017"]}</h2>
        {denied.includes("microphone") && (
          <Notice tone="warning" split>
            {T[DENIED_TEXT.microphone]}
          </Notice>
        )}
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
                  {T["TXT-WIT-411"]}
                </span>
              </span>
            </button>
          )
        )}
        {audio.map((item) => (
          <div className="voice-note" key={item.key}>
            <button
              type="button"
              className="voice-play"
              aria-label={T[playing === item.key ? "TXT-WIT-294" : "TXT-WIT-293"]}
              onClick={() => togglePlay(item.key)}
            >
              <Icon name={playing === item.key ? "pause" : "play"} />
            </button>
            <span className="voice-body">
              <span className="item-name" data-testid="voice-note">
                {t("TXT-WIT-020", { detik: item.seconds ?? 0 })}
              </span>
              <span className="waveform" aria-hidden="true">
                {WAVE.map((h, i) => (
                  <span key={i} style={{ height: h }} />
                ))}
              </span>
              <audio
                ref={(element) => {
                  audioRefs.current[item.key] = element;
                }}
                src={item.previewUrl}
                preload="metadata"
                onPause={() => setPlaying((current) => (current === item.key ? null : current))}
                onEnded={() => setPlaying(null)}
                onError={() => setLocalError(T["TXT-WIT-037"])}
              />
            </span>
            <button
              type="button"
              className="button ghost remove"
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
          placeholder={T["TXT-WIT-427"]}
          aria-describedby="narrative-hint"
          value={state.narrative}
          onChange={(event) => update({ narrative: event.target.value })}
        />
        <p className="field-hint" id="narrative-hint">
          {T["TXT-WIT-290"]}
        </p>
      </div>

      <section aria-labelledby="location-heading">
        <h2 id="location-heading">{T["TXT-WIT-023"]}</h2>
        {denied.includes("geolocation") && (
          <Notice tone="warning" split>
            {T[DENIED_TEXT.geolocation]}
          </Notice>
        )}
        {locationNote && (
          <Notice tone="warning" split>
            {locationNote}
          </Notice>
        )}
        {!denied.includes("geolocation") && (
          <button type="button" className="button tile" onClick={locate} disabled={locating}>
            <Icon name="pin" />
            {T["TXT-WIT-024"]}
          </button>
        )}
        <div className="field" data-testid={state.district ? "region" : undefined}>
          <label className="field-label" htmlFor="district">
            {T["TXT-WIT-026"]}
          </label>
          <span className={state.district ? "select select--icon" : "select select--icon select--empty"}>
            <Icon name="pin" size={20} className="select-icon" />
            <select
              id="district"
              ref={districtRef}
              value={state.district?.district_code ?? ""}
              aria-describedby="district-hint"
              onChange={(event) =>
                update({ district: options.find((d) => d.district_code === event.target.value) ?? null })
              }
            >
              <option value="">{T["TXT-WIT-291"]}</option>
              {options.map((d) => (
                <option key={d.district_code} value={d.district_code ?? ""}>
                  {d.district_name ?? d.regency_name}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" className="select-chevron" />
          </span>
          <p className="field-hint" id="district-hint">
            {T["TXT-WIT-027"]}
          </p>
        </div>
      </section>

      {hasLinks ? (
        <section aria-labelledby="links-heading">
          <h2 id="links-heading">{T["TXT-WIT-292"]}</h2>
          <ul className="items">
            {state.sharedPost && (
              <li className="item" data-testid="shared-post-attached">
                <span className="item-thumb">
                  <Icon name="link" />
                </span>
                <span className="item-body">
                  <span className="item-name">{T["TXT-WIT-061"]}</span>
                  <span className="item-meta item-meta--url">{state.sharedPost.url}</span>
                </span>
                <button
                  type="button"
                  className="button ghost remove"
                  aria-label={`${T["TXT-WIT-016"]} ${T["TXT-WIT-061"].toLowerCase()}`}
                  onClick={() => update({ sharedPost: null })}
                >
                  {T["TXT-WIT-016"]}
                </button>
              </li>
            )}
            {screenshots.map((item, index) => (
              <li className="item" key={item.key}>
                <img className="item-thumb" src={item.previewUrl} alt={`Screenshot ${index + 1}`} />
                <span className="item-body">
                  <span className="item-name">{item.name}</span>
                  <span className="item-meta">{T["TXT-WIT-295"]}</span>
                </span>
                <button
                  type="button"
                  className="button ghost remove"
                  aria-label={`${T["TXT-WIT-016"]} screenshot ${index + 1}`}
                  onClick={() => removeItem(item.key)}
                >
                  {T["TXT-WIT-016"]}
                </button>
              </li>
            ))}
          </ul>
          {!state.sharedPost && <SocialTile onSocial={onSocial} />}
        </section>
      ) : (
        <SocialTile onSocial={onSocial} />
      )}

      <div className="actions">
        {(error || localError) && <Notice tone="error">{error ?? localError}</Notice>}
        {packFailed ? (
          <>
            <Notice tone="error" testId="pack-error">
              {T["TXT-WIT-191"]}
            </Notice>
            <button type="button" className="button wide" onClick={onRetryPack}>
              {T["TXT-WIT-192"]}
            </button>
          </>
        ) : (
          busy && <Notice tone="info">{T["TXT-WIT-032"]}</Notice>
        )}
        <button
          type="button"
          className="button primary wide"
          onClick={onContinue}
          disabled={busy || !!recording}
        >
          {T["TXT-WIT-030"]}
        </button>
      </div>
      {removing && (
        <ConfirmDialog
          title={T["TXT-WIT-433"]}
          confirm={T["TXT-WIT-435"]}
          testId="remove-photo-dialog"
          onConfirm={() => {
            removeItem(removing);
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        >
          {T["TXT-WIT-434"]}
        </ConfirmDialog>
      )}
    </main>
  );
}

/** Bar heights of the decorative waveform on a voice note (SCR-001 mockup). */
const WAVE = [8, 14, 20, 10, 24, 16, 10, 22, 28, 12, 18, 24, 10, 16, 20, 12, 18, 8];

function SocialTile({ onSocial }: { onSocial: () => void }) {
  return (
    <button type="button" className="button tile" onClick={onSocial}>
      <Icon name="link" />
      {T["TXT-WIT-029"]}
    </button>
  );
}
