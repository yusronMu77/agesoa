"""Privacy guard for evidence files: runs before anything is stored.

Images (photos, screenshots) are decoded and re-encoded from pixels only, so EXIF (GPS, camera model, time),
XMP and text chunks never reach storage; the orientation is applied to the pixels first. Faces found in the
image (people caught in the picture by accident) are blurred before the image is stored. Audio is accepted only
in container formats recorded by browsers/phones and is stored unchanged. The SHA-256 is computed on the bytes
that are stored, so anyone holding the stored file can check it against the hash shown to the reporter.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from functools import cache
from typing import Literal

import cv2
import numpy as np
from agesoa_platform.hashing import sha256_hex
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError

EvidenceKind = Literal["photo", "audio", "screenshot"]
MAX_BYTES = 20 * 1024 * 1024  # below Cloud Run's 32 MiB request limit
MAX_PIXELS = 40_000_000  # decompression-bomb guard (~ 7700 x 5200)

_IMAGE_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
DETECT_MAX_SIDE = 1280  # faces are searched on a downscaled copy (speed); boxes are mapped back
FACE_MARGIN = 0.25  # blur a bit beyond the detected box (hair, chin, ears)


class EvidenceRejected(ValueError):
    """The file is not an accepted evidence format (HTTP 415) or is too large (HTTP 413)."""

    def __init__(self, message: str, status_code: int = 415):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class CleanEvidence:
    data: bytes
    media_type: str
    sha256: str
    removed_metadata: bool
    faces_blurred: int = 0


def clean_evidence(kind: EvidenceKind, data: bytes) -> CleanEvidence:
    """Detect the real format from the bytes (the client's content type is not trusted) and strip metadata."""
    if not data:
        raise EvidenceRejected("empty file", 400)
    if len(data) > MAX_BYTES:
        raise EvidenceRejected(f"file larger than {MAX_BYTES // (1024 * 1024)} MB", 413)
    if kind in ("photo", "screenshot"):
        cleaned, media_type, faces = _clean_image(data)
        return CleanEvidence(
            cleaned, media_type, sha256_hex(cleaned), removed_metadata=True, faces_blurred=faces
        )
    media_type = _audio_type(data)
    return CleanEvidence(data, media_type, sha256_hex(data), removed_metadata=False)


def _clean_image(data: bytes) -> tuple[bytes, str, int]:
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with Image.open(io.BytesIO(data)) as source:
            fmt = source.format or ""
            if fmt not in _IMAGE_FORMATS:
                raise EvidenceRejected(f"image format {fmt or 'unknown'} not accepted (JPEG, PNG, WebP)")
            image = ImageOps.exif_transpose(source)  # keep what the camera saw, then drop the tag
            image.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise EvidenceRejected("not a readable image") from exc
    image, faces = blur_faces(image)
    out = io.BytesIO()
    if fmt == "JPEG":
        image.convert("RGB").save(out, "JPEG", quality=90, optimize=True)
    elif fmt == "PNG":
        image.save(out, "PNG", optimize=True)  # no pnginfo: text chunks are dropped
    else:
        image.save(out, "WEBP", quality=90)
    return out.getvalue(), _IMAGE_FORMATS[fmt], faces


@cache
def _face_detector() -> cv2.CascadeClassifier:
    detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    if detector.empty():
        raise RuntimeError("face detector model missing")
    return detector


def find_faces(image: Image.Image) -> list[tuple[int, int, int, int]]:
    """Face boxes (left, top, right, bottom) in image coordinates."""
    scale = min(1.0, DETECT_MAX_SIDE / max(image.size))
    small = image.convert("L")
    if scale < 1.0:
        small = small.resize((round(image.width * scale), round(image.height * scale)))
    side = max(24, round(min(small.size) * 0.04))
    boxes = _face_detector().detectMultiScale(
        np.asarray(small), scaleFactor=1.1, minNeighbors=5, minSize=(side, side)
    )
    return [
        (round(x / scale), round(y / scale), round((x + w) / scale), round((y + h) / scale))
        for x, y, w, h in (boxes if len(boxes) else [])
    ]


def blur_faces(image: Image.Image) -> tuple[Image.Image, int]:
    """Blur every detected face so it cannot be recognized; returns the image and the number of faces."""
    boxes = find_faces(image)
    if not boxes:
        return image, 0
    image = image.copy()
    for left, top, right, bottom in boxes:
        mx, my = round((right - left) * FACE_MARGIN), round((bottom - top) * FACE_MARGIN)
        box = (
            max(0, left - mx),
            max(0, top - my),
            min(image.width, right + mx),
            min(image.height, bottom + my),
        )
        region = image.crop(box)
        # Pixelate, then blur: no recognizable features survive, the picture still shows "a person".
        w, h = region.size
        small = region.resize((max(1, w // 16), max(1, h // 16)), Image.Resampling.BILINEAR)
        region = small.resize((w, h), Image.Resampling.NEAREST).filter(
            ImageFilter.GaussianBlur(max(4, w // 20))
        )
        image.paste(region, box)
    return image, len(boxes)


def _audio_type(data: bytes) -> str:
    head = data[:16]
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "audio/webm"  # Matroska/WebM (MediaRecorder in Chrome/Android)
    if head.startswith(b"OggS"):
        return "audio/ogg"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "audio/wav"
    if head[4:8] == b"ftyp":
        return "audio/mp4"  # MediaRecorder in Safari/iOS, Android voice recorders
    if head.startswith(b"ID3") or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0):
        return "audio/mpeg"
    raise EvidenceRejected("audio format not accepted (WebM, Ogg, WAV, MP4/M4A, MP3)")
