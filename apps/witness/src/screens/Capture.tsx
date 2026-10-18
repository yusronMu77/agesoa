import { AttachmentRow } from "@agesoa/ui/components/attachment-row";
import { NativeSelect } from "@agesoa/ui/components/native-select";
import { Textarea } from "@agesoa/ui/components/textarea";
import { CameraIcon, ImageIcon, LinkIcon, MapPinIcon, MicIcon, PauseIcon, PlayIcon } from "lucide-react";
import { button } from "../ui";
/** SCR-001 Record evidence: photo, voice note or text, approximate location shown as a district. */

import { useEffect, useRef, useState } from "react";
import type { District, IngestionClient } from "../api";
import { ApiError } from "../api";
import { Notice, splitSentence } from "../components";
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
import { cn } from "@agesoa/ui/lib/utils";
import type { CaptureState, EvidenceItem } from "../state";
import { errorText } from "../errors";
import { newItem } from "../state";

const DENIED_TEXT = {
  camera: T["TXT-WIT-048"],
  microphone: T["TXT-WIT-049"],
  geolocation: T["TXT-WIT-050"],
} as const;

/** The "Hapus" action of an attachment row: the ghost button in the primary colour. */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={cn(button("link"), "min-h-12 px-3 no-underline")} aria-label={label} onClick={onClick}>
      {T["TXT-WIT-016"]}
    </button>
  );
}

/** Decorative waveform of a recorded voice note (the file is played with the button next to it). */
function Waveform() {
  const heights = [10, 18, 28, 14, 22, 34, 20, 12, 26, 32, 16, 24, 10];
  return (
    <span className="flex h-9 items-center gap-1" aria-hidden="true">
      {heights.map((h, index) => (
        <span key={index} className="w-1 rounded-full bg-[var(--ag-color-text-secondary)]" style={{ height: h }} />
      ))}
    </span>
  );
}

function VoiceNote({ item, onRemove, onBroken }: { item: EvidenceItem; onRemove: () => void; onBroken: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const Icon = playing ? PauseIcon : PlayIcon;
  return (
    <AttachmentRow
      className="rounded-2xl p-4 [&_[data-slot=attachment-tile]]:bg-transparent"
      tile={
        <button
          type="button"
          className="flex size-12 items-center justify-center rounded-full bg-[var(--ag-color-brand-primary-subtle)] text-primary"
          aria-label={playing ? T["TXT-WIT-249"] : T["TXT-WIT-248"]}
          onClick={() => {
            const element = audio.current;
            if (!element) return;
            if (element.paused) void element.play().catch(onBroken);
            else element.pause();
          }}
        >
          <Icon className="size-6" aria-hidden="true" />
        </button>
      }
      title={<span data-testid="voice-note">{t("TXT-WIT-020", { detik: item.seconds ?? 0 })}</span>}
      action={<RemoveButton label={`${T["TXT-WIT-016"]} ${T["TXT-WIT-017"].toLowerCase()}`} onClick={onRemove} />}
    >
      <Waveform />
      <audio
        ref={audio}
        src={item.previewUrl}
        preload="metadata"
        className="visually-hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={onBroken}
      />
    </AttachmentRow>
  );
}

interface Props {
  client: IngestionClient;
  state: CaptureState;
  update: (change: Partial<CaptureState>) => void;
  /** Runs `action` after the permission explainer when the capability is not granted yet. */
  withPermission: (kind: Capability, action: () => void, onSkip: () => void) => void;
  onSocial: () => void;
  onContinue: () => void;
  /** Set while the report form failed to load: asks for another try. */
  onRetry?: () => void;
  busy: boolean;
  error: string | null;
}

export function Capture({ client, state, update, withPermission, onSocial, onContinue, onRetry, busy, error }: Props) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [denied, setDenied] = useState<Capability[]>([]);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [districts, setDistricts] = useState<District[] | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const narrativeRef = useRef<HTMLTextAreaElement>(null);
  const regionSelect = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  useEffect(() => () => stopStream(stream), [stream]);
  useEffect(() => {
    let live = true;
    client.districts().then(
      (list) => live && setDistricts(list),
      (err) => live && setLocalError(errorText(err)),
    );
    return () => {
      live = false;
    };
  }, [client]);
  useEffect(() => () => recording?.cancel(), [recording]);

  const markDenied = (kind: Capability) => setDenied((list) => (list.includes(kind) ? list : [...list, kind]));
  const addItems = (items: EvidenceItem[]) => update({ items: [...state.items, ...items] });

  const failed = (kind: Capability, err: unknown) => {
    if (err instanceof PermissionDenied) {
      markDenied(kind);
      if (kind === "microphone") narrativeRef.current?.focus();
      if (kind === "geolocation") showPicker();
    } else if (err instanceof LocationUnavailable) {
      // Same way out as a refused permission: say why, and let the reporter pick the district.
      setLocationNote(T[err.reason === "timeout" ? "TXT-WIT-034" : "TXT-WIT-033"]);
      showPicker();
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

  // The district list is always on screen; a failed position only says why and points at it.
  const showPicker = () => regionSelect.current?.focus();

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
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            setLocationNote(T["TXT-WIT-028"]);
            showPicker();
          } else {
            failed("geolocation", err);
          }
        } finally {
          setLocating(false);
        }
      },
      () => {
        markDenied("geolocation");
        showPicker();
      },
    );

  const photos = state.items.filter((i) => i.kind === "photo");
  const audio = state.items.filter((i) => i.kind === "audio");
  const shots = state.items.filter((i) => i.kind === "screenshot");
  const removeItem = (key: string) => update({ items: state.items.filter((i) => i.key !== key) });
  const regionOptions =
    state.district && !districts?.some((d) => d.district_code === state.district?.district_code)
      ? [state.district, ...(districts ?? [])]
      : (districts ?? []);
  const note = (text: string, tone: "info" | "warning") => {
    const { title, rest } = splitSentence(text);
    return (
      <Notice tone={tone} title={title}>
        {rest}
      </Notice>
    );
  };

  return (
    <main className="screen" data-screen="SCR-001">
      <div className="intro">
        <h1>{T["TXT-WIT-010"]}</h1>
        <p className="lead">{T["TXT-WIT-003"]}</p>
      </div>

      <section aria-labelledby="photo-heading">
        <h2 id="photo-heading">{T["TXT-WIT-011"]}</h2>
        {denied.includes("camera") && note(DENIED_TEXT.camera, "info")}
        {photos.length > 0 && (
          <ul className="stack" aria-label={T["TXT-WIT-011"]}>
            {photos.map((item, index) => (
              <li key={item.key}>
                <AttachmentRow
                  tile={<img src={item.previewUrl} alt={`${T["TXT-WIT-011"]} ${index + 1}`} className="size-full object-cover" />}
                  title={item.name}
                  hint={T["TXT-WIT-213"]}
                  action={
                    <RemoveButton
                      label={`${T["TXT-WIT-016"]} ${T["TXT-WIT-011"].toLowerCase()} ${index + 1}`}
                      onClick={() => removeItem(item.key)}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {stream ? (
          <div className="camera">
            <video ref={videoRef} autoPlay playsInline muted data-testid="camera-preview" />
            <div className="stack">
              <button type="button" className={button("primary", { wide: true })} onClick={snap}>
                {T["TXT-WIT-014"]}
              </button>
              <button
                type="button"
                className={button("neutral", { wide: true })}
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
            <button type="button" className={button(photos.length ? "neutral" : "primary", { wide: true, start: true })} onClick={camera}>
              <CameraIcon aria-hidden="true" data-icon="inline-start" />
              {T["TXT-WIT-012"]}
            </button>
            <label className={button("neutral", { wide: true, start: true })}>
              <ImageIcon aria-hidden="true" data-icon="inline-start" />
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
        {denied.includes("microphone") && note(DENIED_TEXT.microphone, "info")}
        {recording ? (
          <button type="button" className={button("danger", { wide: true })} onClick={stopRecord}>
            <span className="rec-dot" aria-hidden="true" />
            {T["TXT-WIT-019"]}
          </button>
        ) : (
          audio.length === 0 && (
            <button type="button" className="voice-card" onClick={record}>
              <span className="voice-mic" aria-hidden="true">
                <MicIcon />
              </span>
              <span className="voice-text">
                <span className="voice-title">{T["TXT-WIT-018"]}</span>
                <span className="voice-hint">{T["TXT-WIT-210"]}</span>
              </span>
            </button>
          )
        )}
        {audio.map((item) => (
          <VoiceNote
            key={item.key}
            item={item}
            onRemove={() => removeItem(item.key)}
            onBroken={() => setLocalError(T["TXT-WIT-037"])}
          />
        ))}
        <div className="field">
          <label className="field-label" htmlFor="narrative">
            {T["TXT-WIT-021"]}
          </label>
          <Textarea
            id="narrative"
            ref={narrativeRef}
            rows={4}
            maxLength={5000}
            placeholder={T["TXT-WIT-211"]}
            aria-describedby="narrative-hint"
            value={state.narrative}
            onChange={(event) => update({ narrative: event.target.value })}
          />
          <p className="field-hint" id="narrative-hint">
            {T["TXT-WIT-022"]}
          </p>
        </div>
      </section>

      <section aria-labelledby="location-heading">
        <h2 id="location-heading">{T["TXT-WIT-023"]}</h2>
        {denied.includes("geolocation") && note(DENIED_TEXT.geolocation, "warning")}
        {locationNote && note(locationNote, "warning")}
        <button type="button" className={button("neutral", { wide: true, start: true })} onClick={locate} disabled={locating}>
          <MapPinIcon aria-hidden="true" data-icon="inline-start" />
          {T["TXT-WIT-024"]}
        </button>
        <div className="field">
          <label className="field-label" htmlFor="district">
            {T["TXT-WIT-026"]}
          </label>
          <div className="select-with-icon" data-testid="region">
            <MapPinIcon aria-hidden="true" />
            <NativeSelect
              id="district"
              ref={regionSelect}
              className="w-full [&_select]:h-12 [&_select]:pl-10"
              aria-describedby="district-hint"
              value={state.district?.district_code ?? ""}
              onChange={(event) =>
                update({ district: districts?.find((d) => d.district_code === event.target.value) ?? null })
              }
            >
              <option value="">{T["TXT-WIT-212"]}</option>
              {regionOptions.map((d) => (
                <option key={d.district_code ?? d.regency_code} value={d.district_code ?? ""}>
                  {d.district_name}, {d.regency_name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <p className="field-hint" id="district-hint">
            {T["TXT-WIT-027"]}
          </p>
        </div>
      </section>

      <section aria-labelledby="link-heading">
        <h2 id="link-heading">{T["TXT-WIT-215"]}</h2>
        {(state.sharedPost || shots.length > 0) && (
          <ul className="stack" aria-label={T["TXT-WIT-215"]}>
            {state.sharedPost && (
              <li>
                <AttachmentRow
                  data-testid="shared-post-attached"
                  tile={<LinkIcon aria-hidden="true" />}
                  title={T["TXT-WIT-069"]}
                  hint={<span className="mono">{state.sharedPost.url}</span>}
                  action={
                    <RemoveButton
                      label={`${T["TXT-WIT-016"]} ${T["TXT-WIT-061"].toLowerCase()}`}
                      onClick={() => update({ sharedPost: null })}
                    />
                  }
                />
              </li>
            )}
            {shots.map((item, index) => (
              <li key={item.key}>
                <AttachmentRow
                  tile={<ImageIcon aria-hidden="true" />}
                  title={item.name || `Screenshot ${index + 1}`}
                  hint={T["TXT-WIT-214"]}
                  action={
                    <RemoveButton
                      label={`${T["TXT-WIT-016"]} screenshot ${index + 1}`}
                      onClick={() => removeItem(item.key)}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <button type="button" className={button("neutral", { wide: true, start: true })} onClick={onSocial}>
          <LinkIcon aria-hidden="true" data-icon="inline-start" />
          {T["TXT-WIT-029"]}
        </button>
      </section>

      <div className="actions">
        {(error || localError) && <Notice tone="error">{error ?? localError}</Notice>}
        {busy && !onRetry && <Notice tone="info">{T["TXT-WIT-032"]}</Notice>}
        {onRetry && (
          <button type="button" className={button("neutral", { wide: true })} onClick={onRetry}>
            {T["TXT-WIT-192"]}
          </button>
        )}
        <button type="button" className={button("primary", { wide: true })} onClick={onContinue} disabled={busy || !!recording}>
          {T["TXT-WIT-030"]}
        </button>
      </div>
    </main>
  );
}
