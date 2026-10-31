"use client";

import { LocateFixed } from "lucide-react";
import { useRef, useState } from "react";
import { ROUTES } from "@/lib/routes";

/**
 * "Gunakan lokasi saya" (SCR-040 "Di sekitar Anda"): asks for the location only when pressed (UIUX-STANDARD
 * principle 2), sends the point once to /lokasi, which turns it into the published district that contains it and
 * keeps only the district code. Refused or unavailable: the reader chooses the district in the list instead.
 */
export function LocateButton({
  back,
  label,
  busyLabel,
  deniedText,
}: {
  back: string;
  label: string;
  busyLabel: string;
  deniedText: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const lat = useRef<HTMLInputElement>(null);
  const lon = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  function locate() {
    if (!("geolocation" in navigator)) {
      setDenied(true);
      return;
    }
    setBusy(true);
    setDenied(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // About 100 m precision is enough to find the district; the point is not stored anywhere.
        lat.current!.value = position.coords.latitude.toFixed(3);
        lon.current!.value = position.coords.longitude.toFixed(3);
        form.current?.requestSubmit();
      },
      () => {
        setBusy(false);
        setDenied(true);
      },
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 15_000 },
    );
  }

  return (
    <form ref={form} action={ROUTES.location} method="post" className="pub-locate">
      <input type="hidden" name="back" value={back} />
      <input ref={lat} type="hidden" name="lat" />
      <input ref={lon} type="hidden" name="lon" />
      <button type="button" className="button button--secondary" onClick={locate} disabled={busy} aria-busy={busy || undefined}>
        <LocateFixed aria-hidden size={16} strokeWidth={2} />
        {busy ? busyLabel : label}
      </button>
      {denied ? (
        <p role="status" className="pub-locate__denied">
          {deniedText}
        </p>
      ) : null}
    </form>
  );
}
