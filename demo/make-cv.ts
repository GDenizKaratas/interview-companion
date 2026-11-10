// Writes the fictional CVs of the demo Candidates: demo/cv.pdf for the demo Candidate and one
// file per other Candidate of the demo set. Every person, company, and school in them is
// invented. Run with: node demo/make-cv.ts
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

const elif = makePdf([
  [
    { text: "ÖZGEÇMİŞ", size: 11 },
    { text: "Elif Kaya", size: 26 },
    { text: "Frontend Geliştirici", size: 14 },
    { text: "İstanbul · elif.kaya@example.com", size: 10 },
    { text: "", size: 10 },
    { text: "Deneyim", size: 14 },
    { text: "Frontend Geliştirici, Kurgu Market A.Ş. (2021 - bugün)", size: 11 },
    { text: "Ürün listeleme ve sepet ekranlarını React ve TypeScript ile geliştirdim.", size: 10 },
    { text: "Sanal liste ile filtre ekranının açılış süresini üçte birine indirdim.", size: 10 },
    { text: "Formların erişilebilirlik denetimini yürüttüm.", size: 10 },
    { text: "Stajyer Geliştirici, Örnek Ajans (2020 - 2021)", size: 11 },
    { text: "Kurumsal siteler için yeniden kullanılabilir bileşenler yazdım.", size: 10 },
    { text: "", size: 10 },
    { text: "Yetenekler", size: 14 },
    { text: "React, TypeScript, React Query, Zustand, Vite, Playwright, CSS", size: 10 },
  ],
]);
writeFileSync(new URL("cv-elif-kaya.pdf", import.meta.url), elif);

const mert = makePdf([
  [
    { text: "ÖZGEÇMİŞ", size: 11 },
    { text: "Mert Aydın", size: 26 },
    { text: "Veri Mühendisi", size: 14 },
    { text: "Ankara · mert.aydin@example.com", size: 10 },
    { text: "", size: 10 },
    { text: "Deneyim", size: 14 },
    { text: "Veri Mühendisi, Hayali Enerji A.Ş. (2020 - bugün)", size: 11 },
    { text: "Sayaç verilerini toplayan günlük veri hattını Airflow ile kurdum.", size: 10 },
    { text: "Kafka ile saatte on milyon olayı işleyen bir akış kurdum.", size: 10 },
    { text: "Veri ambarını BigQuery'e taşıyan ekipte çalıştım.", size: 10 },
    { text: "", size: 10 },
    { text: "Eğitim", size: 14 },
    { text: "İstatistik, Kurgu Teknik Üniversitesi (2014 - 2018)", size: 11 },
    { text: "", size: 10 },
    { text: "Yetenekler", size: 14 },
    { text: "Python, SQL, Airflow, Kafka, Spark, BigQuery, dbt", size: 10 },
  ],
]);
writeFileSync(new URL("cv-mert-aydin.pdf", import.meta.url), mert);

const selin = makePdf([
  [
    { text: "ÖZGEÇMİŞ", size: 11 },
    { text: "Selin Öztürk", size: 26 },
    { text: "DevOps Mühendisi", size: 14 },
    { text: "Eskişehir · selin.ozturk@example.com", size: 10 },
    { text: "", size: 10 },
    { text: "Deneyim", size: 14 },
    { text: "DevOps Mühendisi, Örnek Finans A.Ş. (2019 - bugün)", size: 11 },
    { text: "Kırk servisi Kubernetes üzerine taşıdım ve Terraform ile yönettim.", size: 10 },
    { text: "Argo CD ile GitOps tabanlı dağıtım hattını kurdum.", size: 10 },
    { text: "Bulut maliyetlerini yüzde on beş düşüren temizlik çalışmasını yürüttüm.", size: 10 },
    { text: "Sistem Yöneticisi, Hayali Lojistik Ltd. (2016 - 2019)", size: 11 },
    { text: "Linux sunucuların izleme ve yedekleme düzenini kurdum.", size: 10 },
    { text: "", size: 10 },
    { text: "Yetenekler", size: 14 },
    { text: "Kubernetes, Terraform, Argo CD, Prometheus, Grafana, AWS, Linux", size: 10 },
  ],
]);
writeFileSync(new URL("cv-selin-ozturk.pdf", import.meta.url), selin);
