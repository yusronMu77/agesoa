/**
 * UI text. Source of truth: agesoa-uiux/copy/microcopy.md (Indonesian); the E2E tests expect the same text, so
 * change the microcopy first, then here. Keys are the microcopy text ids.
 *
 * Indonesian (`ID`) is the base language and the default on every device; English lives in `copy.en.ts` and falls
 * back to Indonesian for any missing key. `T` always holds the active language: screens read `T[...]` while they
 * render, and the app re-renders after `setLanguage`.
 *
 * Microcopy texts keep their TXT-WIT id. Ids this app does not show are named at their place: SCR-007 (native share
 * target, TXT-WIT-150..153) and rows the 18 Oct 2026 mockups replaced. Texts the screens need that have no microcopy id use free ids: 033-037/133 (device errors), 174-176
 * (dictation), 230-247 (SCR-008, Bantuan), 290-316 (mockup texts) and 400-437 (shell, tabs, mockup texts, dialogs).
 * Where a mockup of 18 Oct 2026 and an older microcopy row disagree, the mockup text is used (noted at the key).
 */

import type { Label } from "./api";
import { EN } from "./copy.en";

export const ID = {
  "TXT-EVD-001": "Dugaan",
  "TXT-EVD-002": "Didukung bukti",
  "TXT-EVD-003": "Terbukti",

  "TXT-WIT-001": "AGESOA Witness",
  "TXT-WIT-002": "SIMULASI – wilayah dan data fiktif",
  "TXT-WIT-003": "Laporan Anda anonim. Kami tidak meminta nama, nomor HP, atau email.",
  "TXT-WIT-010": "Laporkan kejadian",
  "TXT-WIT-011": "Foto",
  "TXT-WIT-012": "Ambil foto",
  "TXT-WIT-013": "Pilih dari galeri",
  "TXT-WIT-014": "Potret",
  "TXT-WIT-015": "Tutup kamera",
  "TXT-WIT-016": "Hapus",
  "TXT-WIT-017": "Suara",
  "TXT-WIT-018": "Rekam suara",
  "TXT-WIT-019": "Berhenti merekam",
  "TXT-WIT-020": "Rekaman suara ({detik} detik)",
  "TXT-WIT-021": "Ceritakan kejadiannya",
  "TXT-WIT-022": "Apa yang terjadi, di mana, jam berapa, dan berapa orang yang terdampak.",
  "TXT-WIT-023": "Lokasi",
  "TXT-WIT-024": "Pakai lokasi saya",
  // TXT-WIT-025 (choose the district yourself) is not a separate control: the SCR-001 mockup shows the district
  // picker itself (TXT-WIT-291).
  "TXT-WIT-026": "Kecamatan",
  "TXT-WIT-027": "Yang disimpan hanya nama kecamatan, bukan titik lokasi Anda.",
  "TXT-WIT-028": "Lokasi Anda di luar wilayah yang kami kenal. Pilih kecamatan sendiri.",
  "TXT-WIT-029": "Tambah link atau screenshot medsos",
  "TXT-WIT-030": "Lanjut ke draf",
  "TXT-WIT-031": "Tambahkan cerita, foto, suara, atau link dulu.",
  "TXT-WIT-032": "Menyiapkan draf…",
  "TXT-WIT-033": "Lokasi Anda tidak bisa ditentukan sekarang. Pilih kecamatan sendiri.",
  "TXT-WIT-034": "Mencari lokasi terlalu lama. Pilih kecamatan sendiri.",
  "TXT-WIT-036": "Rekaman suara kosong, tidak ada suara yang terekam. Rekam ulang atau ketik cerita Anda.",
  "TXT-WIT-037": "Rekaman ini tidak bisa diputar di HP ini. Rekam ulang atau ketik cerita Anda.",
  "TXT-WIT-040": "Izinkan kamera?",
  "TXT-WIT-041":
    "Kamera dipakai untuk memotret bukti di lokasi. Info lokasi dan merek HP di dalam foto dihapus sebelum disimpan.",
  "TXT-WIT-042": "Izinkan mikrofon?",
  "TXT-WIT-043": "Mikrofon dipakai untuk merekam cerita Anda. Kalau tidak mau, Anda bisa mengetik ceritanya.",
  "TXT-WIT-044": "Izinkan lokasi?",
  "TXT-WIT-045":
    "Lokasi dipakai untuk mengetahui kecamatan kejadian. Yang disimpan hanya nama kecamatan, bukan titik lokasi Anda.",
  "TXT-WIT-046": "Lanjutkan",
  "TXT-WIT-047": "Tidak sekarang",
  "TXT-WIT-048": "Izin kamera tidak diberikan. Anda tetap bisa memilih foto dari galeri.",
  "TXT-WIT-049": "Izin mikrofon tidak diberikan. Ketik ceritanya di kolom cerita.",
  "TXT-WIT-050": "Izin lokasi tidak diberikan. Pilih kecamatan sendiri.",
  "TXT-WIT-060": "Link atau screenshot medsos",
  "TXT-WIT-061": "Link postingan",
  "TXT-WIT-062": "Tempel link postingan, misalnya dari Instagram, TikTok, X, atau Facebook.",
  "TXT-WIT-063": "Kutipan singkat (opsional)",
  "TXT-WIT-064": "Nama akun pengunggah tidak disimpan. Nama akun di dalam kutipan disamarkan.",
  "TXT-WIT-065": "Link belum lengkap. Tambahkan https:// lalu coba lagi.",
  "TXT-WIT-066": "Unggah screenshot",
  "TXT-WIT-067": "Simpan",
  "TXT-WIT-068": "Kembali",
  // TXT-WIT-069 (link attached status): the SCR-001 mockup lists the attached link as TXT-WIT-061 + URL instead.
  "TXT-WIT-080": "Periksa draf laporan",
  "TXT-WIT-081": "Hasil AI (Agen Intake). Periksa isinya. Perbaiki bagian yang belum tepat.",
  // Mockup SCR-004 "Agen Intake gagal" and REVIEW UX-013/014; the shorter microcopy row is older.
  "TXT-WIT-082": "Draf AI belum tersedia. Anda tetap bisa melanjutkan. Isi draf dari keterangan yang Anda miliki.",
  "TXT-WIT-083": "Jenis masalah",
  "TXT-WIT-084": "Pilih jenis masalah",
  "TXT-WIT-085": "wajib",
  "TXT-WIT-086": "Pisahkan dengan koma",
  "TXT-WIT-087": "Cek aturan",
  "TXT-WIT-088": "Dihitung oleh sistem dari isian di atas, bukan oleh AI.",
  "TXT-WIT-089": "Tidak sesuai aturan",
  "TXT-WIT-090": "Sesuai aturan",
  "TXT-WIT-091": "Belum bisa dicek, isi kolom yang dibutuhkan dulu",
  "TXT-WIT-092": "Bukti terlampir",
  "TXT-WIT-093": "Simpan dan cek ulang",
  "TXT-WIT-094": "Kirim laporan",
  "TXT-WIT-095": "Pilih jenis masalah sebelum mengirim.",
  // TXT-WIT-096 (voice transcript): the 18 Oct SCR-004 mockups removed the transcript section.
  "TXT-WIT-097": "Diubah dari usulan AI",
  "TXT-WIT-098": "Isian {kolom} belum benar. Periksa lagi formatnya.",
  "TXT-WIT-099": "Detail untuk audit yang belum terisi: {kolom}",
  "TXT-WIT-110": "Laporan terkirim",
  "TXT-WIT-111": "Kode laporan",
  "TXT-WIT-112": "Sidik jari bukti (SHA-256)",
  "TXT-WIT-113": "Gunakan sidik jari ini untuk memeriksa perubahan file. Simpan kode laporan untuk melihat statusnya.",
  "TXT-WIT-114": "Amankan bukti sebelum {tenggat}",
  "TXT-WIT-115": "Tenggat bukti fisik sudah lewat. Laporan tetap diproses dengan bukti yang ada.",
  "TXT-WIT-116": "Status bukti",
  "TXT-WIT-117": "Buat laporan baru",
  "TXT-WIT-118": "Wilayah fiktif (simulasi)",
  "TXT-WIT-119": "Foto",
  "TXT-WIT-120": "Rekaman suara",
  "TXT-WIT-121": "Screenshot medsos",
  "TXT-WIT-140": "Pertanyaan dari audit",
  "TXT-WIT-141":
    "Pertanyaan ini muncul dari kasus laporan Anda. Anda tetap anonim. Jawaban dicatat sebagai dugaan dan tidak menaikkan status bukti.",
  "TXT-WIT-142": "Jawaban Anda",
  "TXT-WIT-143": "Kirim jawaban",
  "TXT-WIT-144": "Tulis jawaban sebelum mengirim.",
  "TXT-WIT-145": "Jawaban terkirim. Terima kasih sudah membantu.",
  "TXT-WIT-146": "Tidak ada pertanyaan untuk Anda saat ini.",
  "TXT-WIT-147": "Ada {jumlah} pertanyaan audit untuk Anda",
  "TXT-WIT-148": "Jawab pertanyaan",
  "TXT-WIT-149": "Pertanyaan ini sudah dijawab.",
  "TXT-WIT-160": "Laporan saya",
  "TXT-WIT-161": "Tersimpan di perangkat ini. Anda tetap anonim.",
  "TXT-WIT-174": "Selesai bicara",
  "TXT-WIT-175": "Suara Anda diubah jadi teks oleh fitur dikte di browser. Yang dikirim ke AGESOA hanya teks, bukan suara.",
  "TXT-WIT-176": "Dikte suara tidak berhasil. Ketik jawaban Anda.",
  "TXT-WIT-130": "Tidak tersambung ke server. Periksa koneksi lalu coba lagi.",
  "TXT-WIT-131": "File ini tidak bisa dipakai. Gunakan foto JPG, PNG, atau WebP, atau rekaman suara.",
  "TXT-WIT-132": "File terlalu besar (maksimal 20 MB).",
  "TXT-WIT-133": "Terjadi kesalahan. Coba lagi.",

  // Shell and tabs (13B).
  "TXT-WIT-400": "Anonim",
  "TXT-WIT-401": "Langkah laporan",
  "TXT-WIT-402": "Bukti",
  "TXT-WIT-403": "Periksa",
  "TXT-WIT-404": "Terkirim",
  "TXT-WIT-405": "Navigasi utama",
  "TXT-WIT-406": "Lapor",
  "TXT-WIT-407": "Pertanyaan",
  "TXT-WIT-408": "Bantuan",
  // SCR-001 to SCR-006 additions.
  "TXT-WIT-410": "Info lokasi dan merek HP dihapus",
  "TXT-WIT-411": "Ketuk lalu ceritakan kejadiannya",
  "TXT-WIT-412": "Anda tetap bisa lanjut",
  "TXT-WIT-413": "Tanpa izin kamera, Anda tetap bisa memilih foto dari galeri.",
  "TXT-WIT-414": "Tanpa izin mikrofon, Anda tetap bisa mengetik ceritanya.",
  "TXT-WIT-415": "Tanpa izin lokasi, Anda tetap bisa memilih kecamatan sendiri.",
  "TXT-WIT-416": "Yang kami simpan",
  "TXT-WIT-418": "Salin bagian postingan yang relevan",
  "TXT-WIT-419": "Lihat laporan saya",
  "TXT-WIT-420": "Anda tetap anonim",
  "TXT-WIT-421": "Pertanyaan ini muncul dari kasus laporan Anda. Jawaban dicatat sebagai dugaan dan tidak menaikkan status bukti.",
  "TXT-WIT-422": "Pertanyaan {n} dari {total}",
  "TXT-WIT-423": "Hasil AI",
  "TXT-WIT-424": "Tulis jawaban Anda di sini",
  "TXT-WIT-425": "Jika ada pertanyaan lanjutan, Anda dapat membacanya di sini.",
  "TXT-WIT-426": "Boleh singkat. Tidak perlu menyebut nama.",
  "TXT-WIT-427": "Apa yang terjadi, di mana, jam berapa?",
  // SCR-008 Laporan saya.
  "TXT-WIT-230": "Belum ada laporan",
  "TXT-WIT-231":
    "Laporan yang Anda kirim dari perangkat ini muncul di sini, lengkap dengan status bukti dan pertanyaan dari audit.",
  "TXT-WIT-232": "{kategori} di {wilayah}",
  "TXT-WIT-233": "Laporan",
  "TXT-WIT-235": "Memuat laporan…",
  "TXT-WIT-236": "Laporan ini belum bisa dimuat. Coba lagi nanti.",
  "TXT-WIT-237": "Coba lagi",
  "TXT-WIT-238": "Tenggat bukti lewat",
  "TXT-WIT-239": "Draf",
  // Bantuan.
  "TXT-WIT-240": "Cara melapor",
  "TXT-WIT-241": "Rekam bukti: foto, suara, atau cerita, lalu pilih kecamatannya.",
  "TXT-WIT-242": "Periksa draf dari Agen Intake dan perbaiki kalau ada yang salah.",
  "TXT-WIT-243": "Kirim, lalu simpan kode laporan dan sidik jari buktinya.",
  "TXT-WIT-244": "Anonim dan aman",
  "TXT-WIT-245":
    "Witness tidak punya akun. Perangkat ini menyimpan kode acak supaya status laporan dan pertanyaan audit sampai ke Anda tanpa data diri.",
  "TXT-WIT-246":
    "Dugaan: baru dilaporkan. Didukung bukti: ada foto atau dokumen pendukung. Terbukti: disetujui kuorum validator.",
  "TXT-WIT-247": "Pengaturan",
  // SCR-004 general report (microcopy "Isian laporan umum"). TXT-WIT-186 is not shown: the 18 Oct SCR-004 mockups
  // (witness-general.penpot.js) have no hint under "Detail kejadian".
  "TXT-WIT-185": "Detail kejadian",
  "TXT-WIT-188": "Cerita kejadian",
  "TXT-WIT-189": "Lengkapi draf sesuai kejadian yang Anda ketahui.",
  "TXT-WIT-190": "Perubahan tersimpan. Pemeriksaan diperbarui.",
  "TXT-WIT-191": "Formulir laporan belum bisa dimuat. Coba lagi.",
  "TXT-WIT-192": "Coba lagi",
  "TXT-WIT-193": "Perlu dilengkapi untuk audit",
  // SCR-004 reporter-defined extra fields. TXT-WIT-195 follows the mockup wording; the microcopy row words its second
  // sentence differently.
  "TXT-WIT-194": "Informasi tambahan (opsional)",
  "TXT-WIT-195": "Tambahkan informasi yang belum ada di formulir. Nama kolom dan isinya berupa teks.",
  "TXT-WIT-196": "Belum ada kolom tambahan.",
  "TXT-WIT-197": "Kolom tambahan {nomor}",
  "TXT-WIT-198": "Nama kolom",
  "TXT-WIT-199": "Contoh: Kondisi sekitar",
  "TXT-WIT-200": "Isi",
  "TXT-WIT-201": "Tulis informasi yang Anda ketahui",
  "TXT-WIT-202": "Hapus kolom tambahan {nomor}",
  "TXT-WIT-203": "Lengkapi nama dan isi kolom tambahan, atau hapus kolom yang tidak dipakai.",
  "TXT-WIT-204": "Nama kolom tambahan sudah dipakai. Gunakan nama yang berbeda.",
  "TXT-WIT-205": "Tambah kolom",
  "TXT-WIT-206": "Hapus kolom",
  "TXT-WIT-207": "kolom tambahan",
  // SCR-008 status per report. Only the waiting questions variant can be derived on the device; the other two
  // variants (checked by the audit, validated by n validators) need the case of each report, which no service
  // exposes to the reporter yet.
  "TXT-WIT-162": "{n} pertanyaan menunggu",
  // SCR-009 Bahasa dan wilayah. Where the microcopy table and the 18 Oct mockup differ, the mockup wins:
  // TXT-WIT-171 (intro), TXT-WIT-173 (callout, with its own title) and TXT-WIT-214 (button). TXT-WIT-172 is replaced
  // by TXT-WIT-211 on the mockup; TXT-WIT-210 needs the region resolver (next phase).
  "TXT-WIT-170": "Bahasa dan wilayah",
  "TXT-WIT-171": "Cari bahasa yang nyaman untuk Anda. Pilihan dapat diubah kapan saja.",
  "TXT-WIT-173": "Bahasa dan nama wilayah disimpan di perangkat ini. Titik lokasi tidak disimpan.",
  "TXT-WIT-208": "Cari bahasa",
  "TXT-WIT-209": "Bahasa pilihan",
  "TXT-WIT-211": "Sesuai bahasa perangkat",
  "TXT-WIT-212": "Terjemahan belum tersedia",
  "TXT-WIT-213": "Bahasa tidak ditemukan. Coba nama atau kode lain.",
  "TXT-WIT-214": "Simpan",
  "TXT-WIT-257": "Batal",
  // Texts shown on the mockups (agesoa-uiux mockups/witness, prototypes/source-screens.json) without a microcopy id.
  "TXT-WIT-290": "Ceritakan dengan kata-kata Anda sendiri.",
  "TXT-WIT-291": "Pilih kecamatan",
  "TXT-WIT-292": "Link atau screenshot",
  "TXT-WIT-293": "Putar rekaman suara",
  "TXT-WIT-294": "Jeda rekaman suara",
  "TXT-WIT-295": "Nama akun disamarkan",
  "TXT-WIT-296": "{detik} detik",
  "TXT-WIT-297": "Teks kutipan dan link. Nama akun pengunggah tidak disimpan.",
  "TXT-WIT-299": "Ceritakan kejadian yang Anda ketahui",
  "TXT-WIT-304": "Wilayah: {wilayah}. Dari Agen Audit, berdasarkan laporan Anda.",
  "TXT-WIT-305": "Dari Agen Audit, berdasarkan laporan Anda.",
  "TXT-WIT-307": "Nama bahasa atau kode",
  "TXT-WIT-308": "{n} bahasa dalam katalog",
  "TXT-WIT-309": "Gulir atau cari untuk melihat bahasa lainnya.",
  "TXT-WIT-312": "Tersedia",
  "TXT-WIT-314": "Wilayah (opsional)",
  "TXT-WIT-315": "Pilih wilayah",
  "TXT-WIT-316": "Pilihan Anda tetap di tangan Anda",
  "TXT-WIT-430": "Isi nama kolom atau hapus kolom ini.",
  "TXT-WIT-432": "Kasus {id}",
  // Dialog PRV-remove (agesoa-uiux prototypes/dialogs.json), SCR-001 before a photo leaves the draft.
  "TXT-WIT-433": "Hapus foto dari draf?",
  "TXT-WIT-434": "Foto yang belum dikirim akan dihapus dari draf ini. Keterangan dan lampiran lainnya tetap ada.",
  "TXT-WIT-435": "Hapus foto",
  // Dialog PRV-draft-saved, as the SCR-004 save status (the preview's "sesi preview" wording does not apply).
  "TXT-WIT-436": "Draf diperiksa ulang",
  "TXT-WIT-437": "Periksa kategori dan isian sebelum mengirim. Hasil AI dapat dikoreksi.",
} as const;

export type TextId = keyof typeof ID;

export const LANGUAGES = ["id", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Names of the languages in their own language (not translated). */
export const LANGUAGE_NAME: Record<Language, string> = { id: "Bahasa Indonesia", en: "English" };

const TRANSLATIONS: Record<Language, Partial<Record<TextId, string>>> = { id: {}, en: EN };

/** The texts of the active language; every key is present (missing translations fall back to Indonesian). */
export const T: Record<TextId, string> = { ...ID };

let active: Language = "id";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** Switches the texts in `T`. The caller re-renders the screens. */
export function setLanguage(lang: Language): void {
  active = lang;
  Object.assign(T, ID, TRANSLATIONS[lang]);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export function language(): Language {
  return active;
}

/** A label from a domain pack or service in the active language, falling back to the other one. */
export function pick(label: Label | undefined | null): string {
  if (!label) return "";
  return active === "en" ? label.en || label.id : label.id || label.en;
}

/** Label of an evidence kind as stored by the service. */
export function evidenceKind(kind: "photo" | "audio" | "screenshot"): string {
  return T[kind === "photo" ? "TXT-WIT-119" : kind === "audio" ? "TXT-WIT-120" : "TXT-WIT-121"];
}

/** Text with `{name}` placeholders filled in. */
export function t(id: TextId, values: Record<string, string | number> = {}): string {
  return T[id].replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
