/**
 * UI text. Source of truth: agesoa-uiux/copy/microcopy.md (Indonesian); the E2E tests expect the same text, so
 * change the microcopy first, then here. Keys are the microcopy text ids.
 *
 * Indonesian (`ID`) is the base language and the default on every device; English lives in `copy.en.ts` and falls
 * back to Indonesian for any missing key. `T` always holds the active language: screens read `T[...]` while they
 * render, and the app re-renders after `setLanguage`.
 *
 * TXT-WIT-2xx are ids added with the 13B redesign (shell, tabs, SCR-008, SCR-009, Bantuan). They are not in the
 * microcopy table yet; SCR-009 there reuses TXT-WIT-170..173, which this app already uses for SCR-006, so the
 * SCR-009 texts are kept under 2xx ids here.
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
  "TXT-WIT-025": "Pilih kecamatan sendiri",
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
  "TXT-WIT-065": "Ini bukan link. Tempel link yang diawali https://",
  "TXT-WIT-066": "Unggah screenshot",
  "TXT-WIT-067": "Simpan",
  "TXT-WIT-068": "Kembali",
  "TXT-WIT-069": "Link terlampir",
  "TXT-WIT-080": "Periksa draf laporan",
  "TXT-WIT-081": "Hasil AI (Agen Intake). Periksa dan perbaiki kalau ada yang salah.",
  "TXT-WIT-082": "Agen Intake sedang tidak bisa dipakai. Isi draf sendiri.",
  "TXT-WIT-083": "Kategori",
  "TXT-WIT-084": "Pilih kategori",
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
  "TXT-WIT-095": "Pilih kategori dulu sebelum mengirim.",
  "TXT-WIT-096": "Transkrip suara (hasil AI)",
  "TXT-WIT-097": "Diubah dari usulan AI",
  "TXT-WIT-098": "Isian {kolom} belum benar. Periksa lagi formatnya.",
  "TXT-WIT-099": "Kolom wajib yang masih kosong: {kolom}",
  "TXT-WIT-110": "Laporan terkirim",
  "TXT-WIT-111": "Kode laporan",
  "TXT-WIT-112": "Sidik jari bukti (SHA-256)",
  "TXT-WIT-113": "Sidik jari ini membuktikan file tidak berubah setelah dikirim. Simpan kode laporan ini.",
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
  "TXT-WIT-144": "Tulis jawaban dulu.",
  "TXT-WIT-145": "Jawaban terkirim. Terima kasih.",
  "TXT-WIT-146": "Tidak ada pertanyaan untuk Anda saat ini.",
  "TXT-WIT-147": "Ada {jumlah} pertanyaan audit untuk Anda",
  "TXT-WIT-148": "Jawab pertanyaan",
  "TXT-WIT-149": "Pertanyaan ini sudah dijawab.",
  "TXT-WIT-160": "Laporan saya",
  "TXT-WIT-161": "Tersimpan di perangkat ini. Anda tetap anonim.",
  "TXT-WIT-170": "Status laporan Anda",
  "TXT-WIT-171": "Kode laporan",
  "TXT-WIT-172": "Terkirim",
  "TXT-WIT-173": "Jawab dengan suara",
  "TXT-WIT-174": "Selesai bicara",
  "TXT-WIT-175": "Suara Anda diubah jadi teks oleh fitur dikte di browser. Yang dikirim ke AGESOA hanya teks, bukan suara.",
  "TXT-WIT-176": "Dikte suara tidak berhasil. Ketik jawaban Anda.",
  "TXT-WIT-130": "Tidak tersambung ke server. Periksa koneksi lalu coba lagi.",
  "TXT-WIT-131": "File ini tidak bisa dipakai. Gunakan foto JPG, PNG, atau WebP, atau rekaman suara.",
  "TXT-WIT-132": "File terlalu besar (maksimal 20 MB).",
  "TXT-WIT-133": "Terjadi kesalahan. Coba lagi.",

  // Shell and tabs (13B).
  "TXT-WIT-200": "Anonim",
  "TXT-WIT-201": "Langkah laporan",
  "TXT-WIT-202": "Bukti",
  "TXT-WIT-203": "Periksa",
  "TXT-WIT-204": "Terkirim",
  "TXT-WIT-205": "Navigasi utama",
  "TXT-WIT-206": "Lapor",
  "TXT-WIT-207": "Pertanyaan",
  "TXT-WIT-208": "Bantuan",
  // SCR-001 to SCR-006 additions.
  "TXT-WIT-210": "Info lokasi dan merek HP dihapus",
  "TXT-WIT-211": "Ketuk lalu ceritakan kejadiannya",
  "TXT-WIT-212": "Anda tetap bisa lanjut",
  "TXT-WIT-213": "Tanpa izin kamera, Anda tetap bisa memilih foto dari galeri.",
  "TXT-WIT-214": "Tanpa izin mikrofon, Anda tetap bisa mengetik ceritanya.",
  "TXT-WIT-215": "Tanpa izin lokasi, Anda tetap bisa memilih kecamatan sendiri.",
  "TXT-WIT-216": "Yang kami simpan",
  "TXT-WIT-217": "Teks kutipan, link postingan, dan screenshot yang Anda unggah.",
  "TXT-WIT-218": "Salin bagian postingan yang relevan",
  "TXT-WIT-219": "Lihat laporan saya",
  "TXT-WIT-220": "Anda tetap anonim",
  "TXT-WIT-221": "Pertanyaan ini muncul dari kasus laporan Anda. Jawaban dicatat sebagai dugaan dan tidak menaikkan status bukti.",
  "TXT-WIT-222": "Pertanyaan {n} dari {total}",
  "TXT-WIT-223": "Hasil AI",
  "TXT-WIT-224": "Tulis jawaban Anda di sini",
  "TXT-WIT-225": "Kalau audit butuh keterangan lagi, pertanyaannya muncul di sini.",
  "TXT-WIT-226": "Boleh singkat, dengan kata-kata Anda sendiri.",
  "TXT-WIT-227": "Apa yang terjadi, di mana, jam berapa?",
  // SCR-008 Laporan saya.
  "TXT-WIT-230": "Belum ada laporan",
  "TXT-WIT-231":
    "Laporan yang Anda kirim dari perangkat ini muncul di sini, lengkap dengan status bukti dan pertanyaan dari audit.",
  "TXT-WIT-232": "{kategori} di {wilayah}",
  "TXT-WIT-233": "Laporan",
  "TXT-WIT-234": "{n} bukti",
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
  // SCR-009 Bahasa dan wilayah.
  "TXT-WIT-250": "Bahasa dan wilayah",
  "TXT-WIT-251": "Bahasa awal aplikasi adalah Bahasa Indonesia. Anda bisa mengubahnya kapan saja.",
  "TXT-WIT-252": "Disarankan",
  "TXT-WIT-253": "Bahasa",
  "TXT-WIT-254": "Wilayah",
  "TXT-WIT-255": "Kecamatan dipilih setiap kali Anda melapor, dari lokasi perkiraan atau pilihan sendiri.",
  "TXT-WIT-256":
    "Di perangkat ini hanya tersimpan pilihan bahasa, kode acak perangkat, dan kode laporan Anda. Titik lokasi Anda tidak disimpan.",
  "TXT-WIT-257": "Batal",
  // SCR-001 issue type (domain pack) picker.
  "TXT-WIT-260": "Jenis masalah",
  "TXT-WIT-261": "Pilih yang paling dekat. Kategori dan kolom di bawah mengikuti pilihan ini.",
  "TXT-WIT-262": "Draf disusun ulang untuk jenis masalah ini. Periksa lagi kategori dan kolomnya.",
  // SCR-004 reporter-defined extra fields (same text as the design microcopy).
  "TXT-WIT-270": "Informasi tambahan (opsional)",
  "TXT-WIT-271": "Tambahkan informasi yang belum ada di formulir. Tulis nama kolom dan isinya sebagai teks.",
  "TXT-WIT-272": "Belum ada kolom tambahan.",
  "TXT-WIT-273": "Kolom tambahan {nomor}",
  "TXT-WIT-274": "Nama kolom",
  "TXT-WIT-275": "Contoh: Kondisi sekitar",
  "TXT-WIT-276": "Isi",
  "TXT-WIT-277": "Tulis informasi yang Anda ketahui",
  "TXT-WIT-278": "Hapus kolom tambahan {nomor}",
  "TXT-WIT-279": "kolom tambahan",
  "TXT-WIT-280": "Lengkapi nama dan isi kolom tambahan, atau hapus kolom yang tidak dipakai.",
  "TXT-WIT-281": "Nama kolom tambahan sudah dipakai. Gunakan nama yang berbeda.",
  "TXT-WIT-282": "Tambah kolom",
  "TXT-WIT-283": "Hapus kolom",
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
