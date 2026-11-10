import type { ProposedAiNote, ProposedAskedQuestion } from "./ai-provider.ts";

// Ready-made AI output for the demo set, written by hand in Turkish, so the post-Interview view
// can be explored without an API key. It is saved through the same quote checks as the model's
// output; loading the demo fails if any quote is not found in its Transcript. Every person in it
// is fictional.

// An Asked Question names the Saved Question it matches by its text, since ids are made on load.
export type DemoAskedQuestion = Omit<ProposedAskedQuestion, "savedQuestionId"> & { savedQuestion?: string };

export interface DemoAiContent {
  askedQuestions: DemoAskedQuestion[];
  aiNotes: ProposedAiNote[];
}

const q = (segmentNumber: number, quote: string) => ({ segmentNumber, quote });

export const selinOzturk: DemoAiContent = {
  askedQuestions: [
    {
      question: "Şu anki altyapının yapısı",
      questionEvidence: q(1, "Şu anki altyapınızı kısaca anlatır mısın?"),
      answerSummary:
        "Kırk kadar servisin Kubernetes üzerinde çalıştığını, altyapıyı Terraform ile yönettiklerini ve geliştirme, test ve canlı için üç ayrı küme olduğunu söyledi.",
      answerEvidence: [
        q(2, "Yaklaşık kırk servisimiz var, hepsi Kubernetes üzerinde çalışıyor."),
        q(3, "Üç ortamımız var: geliştirme, test ve canlı."),
      ],
    },
    {
      question: "Son büyük kesinti",
      questionEvidence: q(4, "Son yaşadığınız büyük kesintiyi anlatır mısın?"),
      answerSummary:
        "Süresi dolan bir sertifika yüzünden ödeme servisinin yirmi dakika istek alamadığını; sonra sertifikaları cert-manager ile otomatik yenilediklerini ve on dört gün önceden uyaran bir alarm eklediklerini anlattı.",
      answerEvidence: [
        q(5, "ödeme servisi yirmi dakika boyunca istek alamadı"),
        q(6, "sertifikaları cert-manager ile otomatik yeniledik"),
      ],
    },
    {
      question: "Kesintinin nasıl fark edildiği",
      questionEvidence: q(7, "O gece kesintiyi nasıl fark ettiniz?"),
      savedQuestion: "Kesintiyi ilk kim fark etti?",
      answerSummary:
        "Kesintiyi müşteri destek ekibinin bildirdiğini, alarmlarının bağlantı hatalarını görmediğini; ardından ödeme sayfasını dışarıdan her dakika çağıran bir kontrol eklediklerini söyledi.",
      answerEvidence: [
        q(8, "Aslında müşteri destek ekibi haber verdi."),
        q(9, "dışarıdan her dakika ödeme sayfasını çağıran bir kontrol ekledik"),
      ],
    },
    {
      question: "Dağıtım süreci",
      questionEvidence: q(10, "Dağıtımları nasıl yapıyorsunuz?"),
      answerSummary:
        "Argo CD ile GitOps kullandıklarını; her değişikliğin önce test ortamına gidip sonra kademeli olarak canlıya açıldığını anlattı.",
      answerEvidence: [q(11, "Argo CD ile GitOps kullanıyoruz."), q(11, "sonra kademeli olarak canlıya açılıyor")],
    },
    {
      question: "Kademeli açılımda geri dönüş kararı",
      questionEvidence: q(12, "geri dönüşe kim karar veriyor?"),
      savedQuestion: "Kademeli dağıtımda geri dönüş kararını kim veriyor?",
      answerSummary:
        "Hata oranı yüzde biri geçince Argo Rollouts'un kendiliğinden geri döndüğünü, diğer durumlarda nöbetçi mühendisin karar verdiğini söyledi.",
      answerEvidence: [
        q(13, "Hata oranı yüzde birin üstüne çıkarsa Argo Rollouts geri dönüşü kendisi yapıyor."),
        q(13, "nöbetçi mühendis karar veriyor"),
      ],
    },
    {
      question: "Parolaların ve anahtarların saklanması",
      questionEvidence: q(14, "parolaları ve anahtarları nasıl saklıyorsunuz?"),
      answerSummary: "HashiCorp Vault kullandıklarını, servislerin parolaları açılışta Vault'tan aldığını ve depoda parola tutmadıklarını söyledi.",
      answerEvidence: [q(15, "HashiCorp Vault kullanıyoruz."), q(15, "depoda hiçbir parola tutulmuyor")],
    },
    {
      question: "Maliyet takibi",
      questionEvidence: q(16, "Maliyetleri takip ediyor musunuz?"),
      answerSummary:
        "Harcamaları ekip etiketleriyle ayırdıklarını; kullanılmayan diskleri temizleyerek bulut faturasını yüzde on beş düşürdüklerini söyledi.",
      answerEvidence: [
        q(17, "her ekibin harcamasını etiketlerle ayırıyoruz"),
        q(17, "bulut faturasını yüzde on beş düşürdük"),
      ],
    },
    {
      question: "Nöbet düzeni",
      questionEvidence: q(18, "Nöbet düzeniniz nasıl?"),
      answerSummary:
        "Altı kişilik ekipte haftalık nöbet tuttuklarını ve her kesintiden sonra suçlamasız bir değerlendirme toplantısı yaptıklarını anlattı.",
      answerEvidence: [
        q(19, "haftalık nöbet tutuyoruz"),
        q(19, "suçlamasız bir değerlendirme toplantısı yapıyoruz"),
      ],
    },
  ],
  aiNotes: [
    {
      statement: "Kırk kadar servisi Kubernetes üzerinde çalıştırdıklarını ve altyapıyı Terraform ile yönettiklerini söyledi.",
      evidence: [q(2, "hepsi Kubernetes üzerinde çalışıyor"), q(2, "Altyapıyı Terraform ile yönetiyoruz.")],
    },
    {
      statement: "Sertifika kaynaklı kesintiden sonra otomatik yenileme ve erken uyarı alarmı eklediklerini anlattı.",
      evidence: [q(6, "süresi dolmadan on dört gün önce uyarı veren bir alarm ekledik")],
    },
    {
      statement: "Kesintiyi ilk müşteri destek ekibinin bildirdiğini söyledi; alarmları bağlantı hatalarını görmüyormuş.",
      evidence: [q(8, "Bizim alarmımız yalnızca sunucu hatalarına bakıyordu, bağlantı hatalarını görmüyordu.")],
    },
    {
      statement: "Otomatik geri dönüş için Argo Rollouts kullandıklarını belirtti.",
      evidence: [q(13, "Argo Rollouts geri dönüşü kendisi yapıyor")],
    },
    {
      statement: "Kullanılmayan diskleri temizleyerek bulut maliyetini yüzde on beş azalttıklarını söyledi.",
      evidence: [q(17, "Geçen yıl kullanılmayan diskleri temizleyerek bulut faturasını yüzde on beş düşürdük.")],
    },
  ],
};

export const elifKaya: DemoAiContent = {
  askedQuestions: [
    {
      question: "Şu an üzerinde çalıştığı arayüz",
      questionEvidence: q(1, "Şu an üzerinde çalıştığın arayüzden bahseder misin?"),
      answerSummary:
        "Bir e-ticaret sitesinin ürün listeleme ve sepet ekranlarını React ve TypeScript ile yazdığını, dört kişilik bir frontend ekibinde olduğunu söyledi.",
      answerEvidence: [
        q(2, "ürün listeleme ve sepet ekranlarını React ve TypeScript ile yazıyorum"),
        q(2, "Ekipte dört frontend geliştiriciyiz."),
      ],
    },
    {
      question: "Yavaşlayan bir sayfada sorunu bulma",
      questionEvidence: q(3, "Sayfa yavaşladığında sorunu nasıl buluyorsun?"),
      answerSummary:
        "Önce React Profiler ile gereksiz yeniden çizimlere baktığını; son örnekte her tuşta baştan çizilen filtre listesini useMemo ve sanal liste ile düzelttiklerini anlattı.",
      answerEvidence: [
        q(4, "React Profiler ile hangi bileşenin gereksiz yere yeniden çizildiğine bakıyorum"),
        q(4, "useMemo ve sanal liste ile düzelttik"),
      ],
    },
    {
      question: "Sanal liste dışında denenen çözümler",
      questionEvidence: q(5, "Sanal liste dışında başka bir çözüm denediniz mi?"),
      savedQuestion: "Sanal listeyi neden seçtiniz, başka ne denediniz?",
      answerSummary:
        "Önce sayfalamayı denediklerini ama kullanıcıların kaydırarak gezmeyi istediğini; sanal listeyle beş bin ürünün bile akıcı kaydığını söyledi.",
      answerEvidence: [q(6, "Önce sayfalamayı denedik"), q(6, "Sanal liste ile beş bin ürün bile akıcı kaydı.")],
    },
    {
      question: "Erişilebilirlik çalışmaları",
      questionEvidence: q(7, "Erişilebilirlik konusunda neler yaptınız?"),
      answerSummary:
        "Formlara etiket eklediklerini, klavyeyle gezinmeyi test ettiklerini ve renk karşıtlığını tasarım ekibiyle yeniden belirlediklerini anlattı.",
      answerEvidence: [q(8, "Formların hepsine etiket ekledik, klavyeyle gezilebilmesini test ettik.")],
    },
    {
      question: "Erişilebilirlik testlerini kimin yaptığı",
      questionEvidence: q(9, "Bu testleri kim yapıyor, otomatik mi?"),
      answerSummary: "Her çekme isteğinde axe ile otomatik tarama yapıldığını, ekran okuyucu testinin ayda bir elle yapıldığını söyledi.",
      answerEvidence: [
        q(10, "Her çekme isteğinde axe ile otomatik bir tarama çalışıyor."),
        q(10, "Ekran okuyucu testini ise ayda bir elle yapıyoruz."),
      ],
    },
    {
      question: "Durum yönetimi",
      questionEvidence: q(11, "Durum yönetimi için ne kullanıyorsunuz?"),
      answerSummary:
        "Sunucu verisi için React Query, sepet gibi küçük paylaşılan durumlar için Zustand kullandıklarını ve Redux'ı bir yıl önce kaldırdıklarını söyledi.",
      answerEvidence: [q(12, "Sunucudan gelen veri için React Query"), q(12, "Redux'ı bir yıl önce kaldırdık.")],
    },
    {
      question: "Redux'tan çıkış",
      questionEvidence: q(13, "Redux'tan çıkışı nasıl yaptınız?"),
      savedQuestion: "Redux'tan çıkış nasıl planlandı?",
      answerSummary: "Her sprintte bir ekranı taşıyarak ilerlediklerini, iki yapının üç ay boyunca yan yana çalıştığını anlattı.",
      answerEvidence: [q(14, "Her sprintte bir ekranı taşıdık"), q(14, "iki yapı üç ay boyunca yan yana çalıştı")],
    },
    {
      question: "Arayüz testleri",
      questionEvidence: q(15, "Arayüz testlerini nasıl yazıyorsunuz?"),
      answerSummary:
        "Bileşenleri Testing Library ile, ödeme akışı gibi kritik yolları Playwright ile uçtan uca test ettiklerini söyledi.",
      answerEvidence: [
        q(16, "Bileşenleri Testing Library ile test ediyoruz."),
        q(16, "Playwright ile uçtan uca testlerimiz var"),
      ],
    },
    {
      question: "Tasarım ekibiyle çalışma",
      questionEvidence: q(17, "Tasarım ekibiyle nasıl çalışıyorsunuz?"),
      answerSummary:
        "Storybook'ta duran ortak bir bileşen kütüphaneleri olduğunu, yeni bir bileşenin önce orada onaylanıp sonra ekrana girdiğini anlattı.",
      answerEvidence: [
        q(18, "Ortak bir bileşen kütüphanemiz var, Storybook'ta duruyor."),
        q(18, "Yeni bir bileşen önce orada onaylanıyor"),
      ],
    },
  ],
  aiNotes: [
    {
      statement: "Performans sorunlarını bulmak için önce React Profiler'a baktığını söyledi.",
      evidence: [q(4, "Önce React Profiler ile hangi bileşenin gereksiz yere yeniden çizildiğine bakıyorum.")],
    },
    {
      statement: "Sayfalama yerine sanal listeyi, kullanıcılar kaydırarak gezmeyi istediği için seçtiklerini anlattı.",
      evidence: [q(6, "kullanıcılar kaydırarak gezmeyi istiyordu")],
    },
    {
      statement: "Erişilebilirlik için otomatik axe taramasını ve aylık elle ekran okuyucu testini anlattı.",
      evidence: [q(10, "axe ile otomatik bir tarama"), q(10, "ayda bir elle yapıyoruz")],
    },
    {
      statement: "Redux'tan çıkışın ekran ekran, üç ay süren bir geçiş olduğunu söyledi.",
      evidence: [q(14, "Ekran ekran ilerledik."), q(14, "üç ay boyunca yan yana çalıştı")],
    },
    {
      statement: "Kritik akışlar için Playwright ile uçtan uca testleri olduğunu belirtti.",
      evidence: [q(16, "Ödeme akışı gibi kritik yollar için de Playwright ile uçtan uca testlerimiz var.")],
    },
  ],
};

export const mertAydin: DemoAiContent = {
  askedQuestions: [
    {
      question: "Çalıştığı veri hattı",
      questionEvidence: q(1, "Şu an çalıştığın veri hattını anlatır mısın?"),
      answerSummary:
        "Tıklama olaylarını Kafka ile topladıklarını, saatte yaklaşık on milyon olay geldiğini; olayların Flink ile işlenip ClickHouse'a yazıldığını anlattı.",
      answerEvidence: [
        q(2, "tıklama olaylarını Kafka ile topluyoruz"),
        q(2, "Saatte yaklaşık on milyon olay geliyor."),
        q(3, "Olaylar Flink ile işleniyor ve sonuçlar ClickHouse'a yazılıyor."),
      ],
    },
    {
      question: "Bu ölçekte veri kaybını önleme",
      questionEvidence: q(4, "Bu ölçekte veri kaybını nasıl önlüyorsunuz?"),
      savedQuestion: "Saatte on milyon olayı işlerken veri kaybını nasıl önlediniz?",
      answerSummary:
        "Kafka'da her konunun üç kopya tutulduğunu, Flink'te beş dakikada bir kontrol noktası alındığını ve hata olunca oradan devam edildiğini söyledi.",
      answerEvidence: [
        q(5, "Kafka'da her konu üç kopya tutuluyor."),
        q(5, "her beş dakikada bir kontrol noktası alıyoruz"),
      ],
    },
    {
      question: "Yinelenen olaylar",
      questionEvidence: q(6, "Aynı olay iki kez gelirse ne oluyor?"),
      answerSummary: "Her olayın bir kimliği olduğunu ve ClickHouse'ta yinelenen kayıtları bu kimliğe göre birleştirdiklerini anlattı.",
      answerEvidence: [q(7, "Her olayın bir kimliği var."), q(7, "yinelenen kayıtları bu kimliğe göre birleştiren")],
    },
    {
      question: "Toplu işler",
      questionEvidence: q(8, "Toplu işler için ne kullanıyorsunuz?"),
      answerSummary: "Gece çalışan raporlar için yaklaşık altmış Airflow işi olduğunu söyledi.",
      answerEvidence: [q(9, "Gece çalışan raporlar için Airflow kullanıyoruz."), q(9, "Yaklaşık altmış iş var.")],
    },
    {
      question: "Başarısız bir Airflow işi",
      questionEvidence: q(10, "Bir Airflow işi başarısız olunca ne oluyor?"),
      savedQuestion: "Airflow işleri başarısız olunca ne oluyor?",
      answerSummary:
        "İşin iki kez daha denendiğini, yine olmazsa ekibin Slack kanalına uyarı düştüğünü ve sabah ilk iş bakıldığını söyledi.",
      answerEvidence: [q(11, "İş iki kez daha deneniyor."), q(11, "ekibin Slack kanalına bir uyarı düşüyor")],
    },
    {
      question: "Veri kalitesinin kontrolü",
      questionEvidence: q(12, "Veri kalitesini nasıl kontrol ediyorsunuz?"),
      answerSummary:
        "Önemli tablolarda Great Expectations ile kurallar tanımladıklarını; örneğin günlük satır sayısı haftalık ortalamadan çok saparsa işin durduğunu anlattı.",
      answerEvidence: [q(13, "Great Expectations ile kurallar tanımladık"), q(13, "çok saparsa iş duruyor")],
    },
    {
      question: "Şema değişiklikleri",
      questionEvidence: q(14, "Şemada bir değişiklik olduğunda ne yapıyorsunuz?"),
      answerSummary:
        "Şemaları bir şema kayıt servisinde tuttuklarını, geriye uyumsuz bir değişikliğin üretici tarafında yayına alınamadığını söyledi.",
      answerEvidence: [
        q(15, "Şemaları bir şema kayıt servisinde tutuyoruz."),
        q(15, "Geriye uyumsuz bir değişiklik gelirse üretici tarafında yayına alınamıyor."),
      ],
    },
    {
      question: "Ekibin büyüklüğü",
      questionEvidence: q(16, "Ekipte kaç kişisiniz?"),
      answerSummary: "Beş veri mühendisi olduklarını ve analistlerle haftada bir ortak toplantı yaptıklarını söyledi.",
      answerEvidence: [q(17, "Beş veri mühendisiyiz."), q(17, "Analistlerle haftada bir ortak toplantı yapıyoruz.")],
    },
  ],
  aiNotes: [
    {
      statement: "Saatte yaklaşık on milyon tıklama olayını Kafka ile topladıklarını söyledi.",
      evidence: [q(2, "Saatte yaklaşık on milyon olay geliyor.")],
    },
    {
      statement: "Veri kaybına karşı Kafka'daki üç kopyayı ve Flink kontrol noktalarını anlattı.",
      evidence: [q(5, "Kafka'da her konu üç kopya tutuluyor."), q(5, "kontrol noktası alıyoruz")],
    },
    {
      statement: "Yinelenen olayları olay kimliğine göre birleştirdiklerini söyledi.",
      evidence: [q(7, "yinelenen kayıtları bu kimliğe göre birleştiren bir tablo yapısı kullanıyoruz")],
    },
    {
      statement: "Veri kalitesi için Great Expectations kuralları kullandıklarını anlattı.",
      evidence: [q(13, "Önemli tablolarda Great Expectations ile kurallar tanımladık.")],
    },
  ],
};
