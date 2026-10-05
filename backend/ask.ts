import { Pool } from "pg";
import { GoogleGenAI } from "@google/genai";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const pertanyaan = process.argv.slice(2).join(" ");
if (!pertanyaan) {
  console.log('Contoh: npx tsx --env-file=.env ask.ts "pertanyaan kamu"');
  process.exit(1);
}

async function main() {
  const e = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: pertanyaan,
    config: { outputDimensionality: 768, taskType: "RETRIEVAL_QUERY" },
  });
  const vek = JSON.stringify(e.embeddings![0].values);

  const { rows } = await pool.query(
    `SELECT dokumen, halaman, isi, 1 - (embedding <=> $1::vector) AS skor
     FROM chunks ORDER BY embedding <=> $1::vector LIMIT 6`,
    [vek]
  );

  console.log("\n=== POTONGAN TERAMBIL ===");
  rows.forEach((r, i) =>
    console.log(
      `[${i + 1}] ${r.dokumen} hal.${r.halaman} skor=${Number(r.skor).toFixed(3)}\n    ${r.isi.slice(0, 150).replace(/\n/g, " ")}...`
    )
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

  const res = await ai.models.generateContent({
    model: process.env.GEN_MODEL!,
    contents: prompt,
  });
  console.log("\n=== JAWABAN ===\n" + res.text);
  await pool.end();
}
main();