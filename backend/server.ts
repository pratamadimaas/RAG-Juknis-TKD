import express from "express";
import cors from "cors";
import { Pool } from "pg";
import { GoogleGenAI } from "@google/genai";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const app = express();
app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());

async function denganUlang<T>(fn: () => Promise<T>): Promise<T> {
  for (let coba = 0; ; coba++) {
    try {
      return await fn();
    } catch (err) {
      if (coba >= 2) throw err;
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
}

app.post("/api/ask", async (req, res) => {
  const pertanyaan = String(req.body?.pertanyaan ?? "").trim();
  if (!pertanyaan) return res.status(400).json({ error: "Pertanyaan kosong." });
  if (pertanyaan.length > 1000) return res.status(400).json({ error: "Pertanyaan terlalu panjang." });

  try {
    const e = await denganUlang(() =>
      ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: pertanyaan,
        config: { outputDimensionality: 768, taskType: "RETRIEVAL_QUERY" },
      })
    );
    const vek = JSON.stringify(e.embeddings![0].values);

    const { rows } = await pool.query(
      `SELECT dokumen, halaman, isi, 1 - (embedding <=> $1::vector) AS skor
       FROM chunks ORDER BY embedding <=> $1::vector LIMIT 6`,
      [vek]
    );

    const konteks = rows
      .map((r, i) => `[${i + 1}] (${r.dokumen}, hal. ${r.halaman})\n${r.isi}`)
      .join("\n\n");

    const prompt = `Kamu asisten yang menjawab pertanyaan tentang penyaluran Transfer ke Daerah berdasarkan petunjuk teknis resmi.
Jawab HANYA berdasarkan kutipan di bawah. Sebutkan sumber dengan format [nomor] (nama dokumen, hal.).
Jika kutipan tidak memuat jawabannya, katakan tidak ditemukan di dokumen yang tersedia dan jangan menebak.

KUTIPAN:
${konteks}

PERTANYAAN: ${pertanyaan}`;

    const out = await denganUlang(() =>
      ai.models.generateContent({ model: process.env.GEN_MODEL!, contents: prompt })
    );

    res.json({
      jawaban: out.text ?? "",
      sumber: rows.map((r, i) => ({
        no: i + 1,
        dokumen: r.dokumen,
        halaman: r.halaman,
        skor: Number(r.skor),
        cuplikan: String(r.isi).slice(0, 600),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Terjadi kesalahan saat memproses pertanyaan." });
  }
});

app.listen(3000, () => console.log("API siap di http://localhost:3000"));