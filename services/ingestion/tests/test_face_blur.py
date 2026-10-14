"""Faces in evidence photos are blurred before storage (#52). The test face is drawn (no real person)."""

import io

from agesoa_ingestion.privacy import clean_evidence, find_faces
from PIL import Image, ImageDraw, ImageFilter


def drawn_face(size: int = 300, background=(120, 160, 120)) -> Image.Image:
    """A simple cartoon face: skin oval, hair, eyes with pupils, brows, nose, mouth."""
    img = Image.new("RGB", (size * 2, size), background)
    d = ImageDraw.Draw(img)
    cx, cy, s = size // 2, size // 2, size / 400
    d.ellipse([cx - 110 * s, cy - 150 * s, cx + 110 * s, cy + 150 * s], fill=(224, 182, 150))
    d.ellipse([cx - 120 * s, cy - 170 * s, cx + 120 * s, cy - 80 * s], fill=(50, 35, 25))
    for ex in (-48, 48):
        d.ellipse([cx + (ex - 26) * s, cy - 40 * s, cx + (ex + 26) * s, cy - 14 * s], fill=(250, 250, 250))
        d.ellipse([cx + (ex - 12) * s, cy - 38 * s, cx + (ex + 12) * s, cy - 16 * s], fill=(40, 25, 20))
        d.rectangle([cx + (ex - 32) * s, cy - 62 * s, cx + (ex + 32) * s, cy - 52 * s], fill=(60, 40, 30))
    d.polygon(
        [(cx, cy - 10 * s), (cx - 18 * s, cy + 45 * s), (cx + 18 * s, cy + 45 * s)], fill=(205, 160, 130)
    )
    d.ellipse([cx - 45 * s, cy + 75 * s, cx + 45 * s, cy + 100 * s], fill=(150, 70, 70))
    return img.filter(ImageFilter.GaussianBlur(3))


def jpeg(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, "JPEG", quality=92)
    return out.getvalue()


def test_a_face_in_a_photo_is_blurred_before_storage():
    original = drawn_face()
    assert len(find_faces(original)) == 1
    clean = clean_evidence("photo", jpeg(original))
    assert clean.faces_blurred == 1
    stored = Image.open(io.BytesIO(clean.data))
    assert find_faces(stored) == []  # no longer detectable as a face
    # the face area changed a lot, the background (right half) did not
    face_box, background_box = (60, 60, 240, 240), (420, 60, 580, 240)

    def diff(box):
        a = original.crop(box).getdata()
        b = stored.convert("RGB").crop(box).getdata()
        total = sum(abs(x - y) for pa, pb in zip(a, b, strict=True) for x, y in zip(pa, pb, strict=True))
        return total / ((box[2] - box[0]) * (box[3] - box[1]))

    assert diff(face_box) > 20
    assert diff(background_box) < 5


def test_large_photos_are_searched_downscaled_and_boxes_map_back():
    # A phone-sized photo (3200 x 1600): detection runs on a 1280-wide copy.
    big = drawn_face(size=400).resize((3200, 1600), Image.Resampling.LANCZOS)
    ((left, top, right, bottom),) = find_faces(big)
    assert 0 <= left < 800 < right <= 1600 and 0 <= top < 800 < bottom <= 1600
    assert clean_evidence("photo", jpeg(big)).faces_blurred == 1


def test_screenshots_are_covered_and_images_without_faces_are_unchanged_in_count():
    assert clean_evidence("screenshot", jpeg(drawn_face(200))).faces_blurred == 1
    assert clean_evidence("photo", jpeg(Image.new("RGB", (640, 480), (90, 120, 200)))).faces_blurred == 0
