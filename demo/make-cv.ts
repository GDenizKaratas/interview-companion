// Writes demo/cv.pdf, the fictional CV of the demo Candidate. Every person, company, and school
// in it is invented. Run with: node demo/make-cv.ts
import { writeFileSync } from "node:fs";
import { makePdf } from "../src/core/testing/make-pdf.ts";

const cv = makePdf([
  [
    { text: "ÖZGEÇMİŞ", size: 11 },
    { text: "Deniz Yılmaz", size: 26 },
    { text: "Kıdemli Backend Mühendisi", size: 14 },
    { text: "İzmir · deniz.yilmaz@example.com", size: 10 },
    { text: "", size: 10 },
    { text: "Deneyim", size: 14 },
    { text: "Kıdemli Backend Mühendisi, Örnek Ödeme A.Ş. (2022 - bugün)", size: 11 },
    { text: "Ödeme servislerini Node.js ve PostgreSQL ile geliştirdim.", size: 10 },
    { text: "Arka plan işleri için Redis ve BullMQ kullanan bir kuyruk kurdum.", size: 10 },
    { text: "Günlük iki milyon işlemi işleyen bir mutabakat servisini tasarladım.", size: 10 },
    { text: "Backend Mühendisi, Hayali Lojistik Ltd. (2019 - 2022)", size: 11 },
    { text: "Kargo takip API'sini monolitten ayrı bir servise taşıdım.", size: 10 },
    { text: "Yük testleriyle yanıt süresini yarıya indirdim.", size: 10 },
  ],
  [
    { text: "Eğitim", size: 14 },
    { text: "Bilgisayar Mühendisliği, Kurgu Teknik Üniversitesi (2015 - 2019)", size: 11 },
    { text: "", size: 10 },
    { text: "Yetenekler", size: 14 },
    { text: "TypeScript, Node.js, PostgreSQL, Redis, BullMQ, Docker, Kubernetes", size: 10 },
    { text: "", size: 10 },
    { text: "Diller", size: 14 },
    { text: "Türkçe (ana dil), İngilizce (ileri)", size: 10 },
  ],
]);

writeFileSync(new URL("cv.pdf", import.meta.url), cv);
