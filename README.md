# Asisten Juknis Penyaluran TKD

Aplikasi tanya jawab berbasis dokumen untuk petunjuk teknis (juknis) penyaluran Transfer ke Daerah. Pertanyaan dijawab dari isi juknis yang sudah dimuat, lengkap dengan nama dokumen dan nomor halaman sumbernya. Dibuat untuk membantu Seksi Bank dalam konsultasi dan pengecekan ketentuan penyaluran.

Pendekatan yang dipakai adalah RAG (Retrieval-Augmented Generation): dokumen dipecah menjadi potongan teks, potongan yang paling relevan dengan pertanyaan dicari terlebih dahulu, lalu model hanya diminta menjawab berdasarkan potongan tersebut.

## Cara kerja

1. **Ingest (sekali, atau setiap ada dokumen baru).** PDF dibaca per halaman, dipecah menjadi potongan sekitar 1000 karakter, diubah menjadi embedding oleh Gemini, lalu disimpan di PostgreSQL dengan ekstensi pgvector.
2. **Tanya.** Pertanyaan diubah menjadi embedding yang sama. PostgreSQL mengambil 6 potongan dengan jarak kosinus terdekat.
3. **Jawab.** Keenam potongan dikirim ke model Gemini bersama instruksi untuk menjawab hanya dari kutipan, menyebut sumber, dan menyatakan "tidak ditemukan" bila kutipan tidak memuat jawabannya.

```
Angular (localhost:4200)  ->  API Express (localhost:3000)  ->  Gemini API
                                        |
                              PostgreSQL + pgvector (Docker)
```

## Struktur folder

```
AI-Agent/
  backend/
    ingest.ts      membaca PDF, membuat embedding, mengisi database
    ask.ts         uji pencarian dan jawaban lewat terminal
    server.ts      API untuk frontend (POST /api/ask)
  frontend/        aplikasi Angular
  Dokumen/         PDF juknis (tidak ikut repositori)
```

## Prasyarat

- Node.js 20.19 atau lebih baru
- Docker Desktop
- Angular CLI (`npm i -g @angular/cli`)
- API key Gemini dari Google AI Studio

## Menyiapkan

**1. Jalankan database**

```
docker run -d --name pg-rag -e "POSTGRES_PASSWORD=GANTI_PASSWORD" -e POSTGRES_DB=rag_seksi_bank -p 5432:5432 pgvector/pgvector:pg16
```

Setelah laptop dinyalakan ulang, container dihidupkan lagi dengan `docker start pg-rag`. Data tidak hilang.

**2. Siapkan backend**

```
cd backend
npm install
```

Salin `.env.example` menjadi `.env`, lalu isi nilainya. Jika menulis password yang mengandung tanda seru di CMD, bungkus dengan kutip ganda.

**3. Masukkan dokumen**

Taruh PDF juknis di folder yang ditunjuk `DOKUMEN_DIR`. Pastikan teksnya dapat diseleksi, karena PDF hasil scan tidak terbaca tanpa OCR. Lalu jalankan:

```
npx tsx --env-file=.env ingest.ts
```

Script aman dijalankan ulang. Dokumen yang sama akan diganti, bukan digandakan. Bila terkena batas penggunaan Gemini, script menunggu dan mencoba lagi otomatis.

**4. Siapkan frontend**

```
cd frontend
npm install
```

## Menjalankan

Terminal 1, di folder `backend`:

```
npx tsx --env-file=.env server.ts
```

Terminal 2, di folder `frontend`:

```
ng serve
```

Buka http://localhost:4200.

Untuk menguji pencarian tanpa antarmuka:

```
npx tsx --env-file=.env ask.ts "Apa saja dokumen persyaratan penyaluran DAK Fisik Tahap II?"
```

Keluarannya menampilkan potongan yang terambil beserta skor kemiripannya, lalu jawaban.

## Keterbatasan

- Kualitas jawaban bergantung pada 6 potongan yang terambil. Jika jawaban berada di potongan lain, jawaban bisa kurang lengkap. Periksa daftar sumber di bawah setiap jawaban.
- Juknis antar tahap isinya mirip, sehingga pertanyaan tentang satu tahap dapat mengambil potongan dari tahap lain.
- Tabel pada lampiran sering terbaca dengan urutan teks yang teracak oleh pembaca PDF.
- Jawaban adalah alat bantu. Selalu cocokkan dengan dokumen aslinya sebelum dipakai sebagai dasar tindakan.
- Nama model Gemini sering berubah. Jika muncul galat model tidak ditemukan, perbarui `GEN_MODEL` sesuai daftar di Google AI Studio.

## Keamanan

- `.env` berisi API key dan password database. Jangan di-commit. Berkas ini sudah dikecualikan lewat `.gitignore`.
- Folder `Dokumen/` dikecualikan dari repositori. Pastikan dokumen yang dimuat boleh diproses melalui layanan Gemini. Pada free tier, data yang dikirim dapat dipakai Google untuk perbaikan produk, jadi jangan memuat dokumen internal atau data satuan kerja yang sensitif.
- API saat ini hanya menerima permintaan dari `http://localhost:4200` dan belum memiliki autentikasi. Tambahkan autentikasi sebelum dibuka untuk pengguna lain.

## Rencana pengembangan

- Menyertakan nama dokumen pada teks yang di-embed, dan membatasi pencarian ke dokumen tertentu.
- Mengubah asisten menjadi agent yang dapat mencari beberapa kali dan membandingkan antar dokumen.
- Menambah peraturan lain, seperti ketentuan UMi dan PFK.
