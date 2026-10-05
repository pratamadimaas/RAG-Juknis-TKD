import fs from "node:fs";
import path from "node:path";
import pdf from "pdf-parse";
import { Pool } from "pg";
import { GoogleGenAI } from "@google/genai";

const EMBED_MODEL = "gemini-embedding-001";
const DIM = 768;
const dir = process.env.DOKUMEN_DIR!;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function bacaHalaman(file: string): Promise<string[]> {
  const pages: string[] = [];
  await pdf(fs.readFileSync(file), {
    pagerender: async (pageData: any) => {
      const tc = await pageData.getTextContent();
      let teks = "";
      let lastY: number | null = null;
      for (const it of tc.items) {
        const y = it.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) teks += "\n";
        else if (lastY !== null) teks += " ";
        teks += it.str;
        lastY = y;
      }
      pages.push(teks);
      return teks;
    },
  });
  return pages;
}

function potong(teks: string, ukuran = 1000, tumpang = 150): string[] {
  const bersih = teks.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const hasil: string[] = [];
  for (let i = 0; i < bersih.length; i += ukuran - tumpang) {
    const bagian = bersih.slice(i, i + ukuran).trim();
    if (bagian.length > 80) hasil.push(bagian);
  }
  return hasil;
}

async function embed(teks: string[]): Promise<number[][]> {
  for (let coba = 0; ; coba++) {
    try {
      const res = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: teks,
        config: { outputDimensionality: DIM, taskType: "RETRIEVAL_DOCUMENT" },
      });
      return res.embeddings!.map((e) => e.values!);
    } catch (err) {
      if (coba >= 5) throw err;
      console.log("  gagal/limit, tunggu 20 detik lalu ulangi...");
      await new Promise((r) => setTimeout(r, 20000));
    }
  }
}

async function main() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await pool.query(`CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY, dokumen TEXT NOT NULL, halaman INT NOT NULL,
    isi TEXT NOT NULL, embedding vector(${DIM}))`);

  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  for (const f of files) {
    console.log("Memproses:", f);
    const halaman = await bacaHalaman(path.join(dir, f));
    const items: { halaman: number; isi: string }[] = [];
    halaman.forEach((t, i) => potong(t).forEach((isi) => items.push({ halaman: i + 1, isi })));
    if (items.length === 0) { console.log("  TIDAK ADA TEKS (mungkin scan), dilewati"); continue; }

    await pool.query("DELETE FROM chunks WHERE dokumen = $1", [f]);
    for (let i = 0; i < items.length; i += 50) {
      const batch = items.slice(i, i + 50);
      const vek = await embed(batch.map((b) => b.isi));
      for (let j = 0; j < batch.length; j++) {
        await pool.query(
          "INSERT INTO chunks (dokumen, halaman, isi, embedding) VALUES ($1,$2,$3,$4)",
          [f, batch[j].halaman, batch[j].isi, JSON.stringify(vek[j])]
        );
      }
      console.log(`  ${Math.min(i + 50, items.length)}/${items.length} potongan`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  await pool.end();
  console.log("Selesai.");
}
main();