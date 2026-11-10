import type { TranslationFile } from "../languages.ts";

const translation: TranslationFile = {
  name: "Türkçe",
  text: {
    appName: "Interview Companion",
    tagline: "Mülakatlarınız tek bir yerde.",
    languageLabel: "Dil",
    candidates: {
      title: "Adaylar",
      empty: "Henüz aday yok. İlkini yukarıdan ekleyin.",
      nameLabel: "Ad",
      roleLabel: "Pozisyon",
      add: "Aday ekle",
      saveFailed: "Aday kaydedilemedi.",
      loadFailed: "Adaylar yüklenemedi.",
      required: {
        name: "Adayın adı girilmeli.",
        role: "Adayın pozisyonu girilmeli.",
      },
    },
    workspace: {
      back: "← Adaylar",
      loading: "Yükleniyor…",
      notFound: "Böyle bir aday yok.",
      loadFailed: "Çalışma alanı yüklenemedi. Uygulamanın hâlâ çalıştığını kontrol edin.",
    },
    panels: {
      cv: { title: "CV", empty: "CV yüklenmedi." },
      interviewerNotes: { title: "Notlarım", empty: "Henüz kişisel not yok." },
      transcript: { title: "Transkript", empty: "Transkript yok." },
      aiNotes: { title: "AI Notları", label: "AI tarafından üretildi", empty: "AI Notları henüz oluşturulmadı." },
      questions: {
        title: "Sorular",
        empty: "Kayıtlı soru yok.",
        placeholder: "Bir soru yazın, kaydetmek için Enter…",
        newLabel: "Yeni soru",
        hint: "Yeni satır için Shift+Enter.",
        writtenByYou: "sizin yazdığınız",
        fromSuggestion: "bir öneriden",
        moveUp: "Yukarı taşı",
        moveDown: "Aşağı taşı",
        edit: "Düzenle",
        delete: "Sil",
        save: "Kaydet",
        cancel: "Vazgeç",
        confirmDelete: "Bu soru silinsin mi?",
        required: "Soru boş olamaz.",
        saveFailed: "Soru kaydedilemedi.",
        changeFailed: "Değişiklik kaydedilemedi.",
        loadFailed: "Sorular yüklenemedi.",
      },
    },
  },
};

export default translation;
