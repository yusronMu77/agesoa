"""Generate the fictional role documents of the demo (issue #59): images a validator candidate uploads so the Role
agent can read them. Every document is a SPECIMEN of a fictional organization in the fictional Kabupaten Sukamaju,
carries a large "SIMULASI" watermark, and names a made-up person. Two documents are deliberately wrong (expired,
letterhead of another organization) for the rejection path; the agency staff card is refused when its agency
is named (an agency never confirms validators); the certificate of an unregistered university is read with low
confidence (self-declared below the threshold).

Each PNG also carries the intended reading in a text chunk (`agesoa-demo`): the rule-based fallback of the Role
agent (local runs and demo_mode only, when no Gemini model is configured) reads that instead of the pixels.

    uv run --package agesoa-trust python services/trust/demo/make_documents.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo

OUT = Path(__file__).resolve().parent / "documents"
FONT = "DejaVuSans.ttf"

DOCUMENTS = [
    {
        "file": "press-id-card.png",
        "title": "KARTU PERS",
        "issuer": "Redaksi Sukamaju (fictional)",
        "lines": ["Nama: Dewi Lestari (fiktif)", "Jabatan: Reporter Kesehatan", "No. 027/RS/2026"],
        "reading": {
            "document_type": "press_id",
            "name": "Dewi Lestari",
            "position": "Health reporter",
            "issuer": "Redaksi Sukamaju (fictional)",
            "number": "027/RS/2026",
            "valid_until": "2027-06-30",
            "confidence": 0.93,
        },
        "size": (860, 540),
    },
    {
        "file": "assignment-letter.png",
        "title": "SURAT TUGAS",
        "issuer": "Redaksi Sukamaju (fictional)",
        "lines": [
            "Nomor: 114/ST/RS/X/2026",
            "Menugaskan: Dewi Lestari (fiktif), Reporter",
            "Untuk meliput layanan makan sekolah",
            "Berlaku s.d. 31 Desember 2026",
        ],
        "reading": {
            "document_type": "assignment_letter",
            "name": "Dewi Lestari",
            "position": "Reporter",
            "issuer": "Redaksi Sukamaju (fictional)",
            "number": "114/ST/RS/X/2026",
            "valid_until": "2026-12-31",
            "confidence": 0.9,
        },
        "size": (820, 1060),
    },
    {
        "file": "nutritionist-certificate.png",
        "title": "SURAT KETERANGAN",
        "issuer": "Persatuan Ahli Gizi Sukamaju (fictional)",
        "lines": [
            "Nomor: 88/PAG-SKM/2026",
            "Menerangkan: Rina Hapsari (fiktif)",
            "adalah ahli gizi terdaftar",
            "Berlaku s.d. 30 September 2027",
        ],
        "reading": {
            "document_type": "certificate",
            "name": "Rina Hapsari",
            "position": "Registered nutritionist",
            "issuer": "Persatuan Ahli Gizi Sukamaju (fictional)",
            "number": "88/PAG-SKM/2026",
            "valid_until": "2027-09-30",
            "confidence": 0.88,
        },
        "size": (820, 1060),
    },
    {
        "file": "agency-staff-id.png",
        "title": "KARTU PEGAWAI",
        "issuer": "Badan Gizi Kabupaten Sukamaju (fictional)",
        "lines": ["Nama: Sari Wulandari (fiktif)", "Jabatan: Pengawas Gizi", "NIP 19900101 000000 0 000"],
        "reading": {
            "document_type": "other",
            "name": "Sari Wulandari",
            "position": "Nutrition supervisor",
            "issuer": "Badan Gizi Kabupaten Sukamaju (fictional)",
            "number": "19900101 000000 0 000",
            "valid_until": None,
            "confidence": 0.9,
        },
        "size": (860, 540),
    },
    {
        "file": "unregistered-university-certificate.png",
        "title": "SURAT KETERANGAN",
        "issuer": "Universitas Sukamaju Raya (fictional, tidak terdaftar)",
        "lines": [
            "Nomor: 12/USR/2026",
            "Menerangkan: Yoga Saputra (fiktif)",
            "adalah peneliti pangan",
            "Universitas belum terdaftar di AGESOA",
        ],
        "reading": {
            "document_type": "certificate",
            "name": "Yoga Saputra",
            "position": "Food researcher",
            "issuer": "Universitas Sukamaju Raya (fictional)",
            "number": "12/USR/2026",
            "valid_until": None,
            "confidence": 0.55,
        },
        "size": (820, 1060),
    },
    {
        "file": "odd-expired-press-id.png",
        "title": "KARTU PERS",
        "issuer": "Redaksi Sukamaju (fictional)",
        "lines": ["Nama: Budi Santoso (fiktif)", "Jabatan: Fotografer", "Berlaku s.d. 31 Desember 2024"],
        "reading": {
            "document_type": "press_id",
            "name": "Budi Santoso",
            "position": "Photographer",
            "issuer": "Redaksi Sukamaju (fictional)",
            "number": "003/RS/2023",
            "valid_until": "2024-12-31",
            "confidence": 0.91,
        },
        "size": (860, 540),
    },
    {
        "file": "odd-letterhead-mismatch.png",
        "title": "SURAT TUGAS",
        "issuer": "Warta Sukamaju (fictional)",
        "lines": [
            "Nomor: 9/ST/WS/2026",
            "Menugaskan: Andi Pratama (fiktif), Reporter",
            "(diunggah dengan organisasi Redaksi Sukamaju)",
        ],
        "reading": {
            "document_type": "assignment_letter",
            "name": "Andi Pratama",
            "position": "Reporter",
            "issuer": "Warta Sukamaju (fictional)",
            "number": "9/ST/WS/2026",
            "valid_until": "2026-12-31",
            "confidence": 0.87,
        },
        "size": (820, 1060),
    },
]


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default(size)


def render(doc: dict) -> Image.Image:
    width, height = doc["size"]
    image = Image.new("RGB", (width, height), (250, 248, 240))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 0, width, 90], fill=(30, 64, 120))
    draw.text((28, 22), doc["issuer"], fill="white", font=font(34))
    draw.text((28, 130), doc["title"], fill=(20, 20, 20), font=font(44))
    y = 210
    for line in doc["lines"]:
        draw.text((28, y), line, fill=(30, 30, 30), font=font(28))
        y += 52
    draw.text(
        (28, height - 60), "SPESIMEN - dokumen fiktif untuk demo AGESOA", fill=(120, 40, 40), font=font(22)
    )
    # Large diagonal SIMULASI watermark, impossible to miss or crop away.
    mark = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(mark).text(
        (width * 0.08, height * 0.38), "SIMULASI", fill=(200, 30, 30, 110), font=font(width // 6)
    )
    image = Image.alpha_composite(image.convert("RGBA"), mark.rotate(20, center=(width / 2, height / 2)))
    return image.convert("RGB")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for doc in DOCUMENTS:
        info = PngInfo()
        info.add_text("agesoa-demo", json.dumps(doc["reading"], ensure_ascii=False))
        render(doc).save(OUT / doc["file"], "PNG", pnginfo=info, optimize=True)
        print("wrote", OUT / doc["file"])


if __name__ == "__main__":
    main()
