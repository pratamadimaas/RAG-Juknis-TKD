import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Sumber { no: number; dokumen: string; halaman: number; skor: number; cuplikan: string; }
interface Item { tanya: string; jawaban: string; sumber: Sumber[]; galat?: boolean; }

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly api = 'http://localhost:3000/api/ask';
  pertanyaan = '';
  memuat = signal(false);
  riwayat = signal<Item[]>([]);
  contoh = [
    'Apa saja dokumen persyaratan penyaluran DAK Fisik Tahap II?',
    'Apa beda syarat penyaluran DAK Fisik Tahap I dan Tahap II?',
    'Kapan batas waktu penyampaian dokumen persyaratan Tahap III?',
  ];

  async kirim(teks?: string) {
    const tanya = (teks ?? this.pertanyaan).trim();
    if (!tanya || this.memuat()) return;
    this.pertanyaan = '';
    this.memuat.set(true);
    try {
      const res = await fetch(this.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pertanyaan: tanya }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Gagal memproses.');
      this.riwayat.update((r) => [...r, { tanya, jawaban: data.jawaban, sumber: data.sumber }]);
    } catch (e) {
      const pesan = e instanceof Error ? e.message : 'Gagal menghubungi server.';
      this.riwayat.update((r) => [...r, { tanya, jawaban: pesan, sumber: [], galat: true }]);
    } finally {
      this.memuat.set(false);
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
    }
  }

  tekanEnter(e: KeyboardEvent) {
    if (!e.shiftKey) {
      e.preventDefault();
      this.kirim();
    }
  }

  format(teks: string): string {
    const aman = teks.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return aman.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
}