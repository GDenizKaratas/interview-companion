# Interview Companion

[English](README.md)

**Görüşmeleriniz tek bir yerde.** Görüşme sırasında not yetiştirmeye çalışmayın, sonra da "aday bunu demiş miydi?" diye kayıtları aramayın. Interview Companion her adayın CV'sini, görüşmelerini, transkriptlerini, notlarınızı ve sorularınızı bir arada tutar; AI transkriptten sizin için not çıkarır.

- **Her notun yanında adayın kendi sözü durur.** AI'nin yazdığı her satır transkriptten bir alıntıya dayanır; alıntı transkriptte kelimesi kelimesine yoksa uygulama o satırı kaydetmez. Alıntı, adayın bunu söylediğini gösterir; doğru söylediğini değil.
- **Kararı siz verirsiniz.** AI not tutar. Kimseye puan vermez, kimseyi sıralamaz, karar vermez.
- **Veriniz bilgisayarınızda kalır.** Hesap açılmaz, uygulamanın bir sunucusu yoktur. Ücretsiz ve açık kaynaktır.

![Bir adayın çalışma alanı: solda transkript, ortada sorular, sağda notlar ve AI'nin görüşme notları](docs/images/workspace.png)
*Bir adayın çalışma alanı: CV ve transkript, Sorularım, Notlarım ve AI'nin çıkardığı Görüşme notları tek ekranda.*

Bu depodaki ve ekran görüntülerindeki bütün adlar, CV'ler ve transkriptler kurgudur.

## Altı adımda kullanım

Uygulamadaki **?** düğmesi aynı altı adımı gösterir.

1. **Aday ekle.** İsim ve rol yeter. Çok adayınız varsa CV'leri topluca bırakın; isimler CV'den okunur.
2. **CV yükle.** Metin içeren bir PDF.
3. **Görüşme ekle.** Tarihi ve saatiyle. Birkaç aday için tek seferde de planlayabilirsiniz; hepsi takvimde görünür.
4. **Transkripti yükle.** Görüşmeden sonra, toplantının metni. Teams ve Zoom bu dosyayı verir; nasıl alınacağını uygulamadaki **Transkripti nasıl alırım?** rehberi anlatır.
5. **Konuşmacıları onayla.** Aday hangisi, görüşmeci hangisi? Siz onaylamadan AI çalışmaz.
6. **Notları kontrol et.** AI taslak çıkarır, alıntılarıyla. Uyuşanı onaylar, yanlışı düzeltir ya da gizlersiniz.

![Aday hakkında bir not ve dayandığı iki alıntı](docs/images/interview-notes.png)
*Bir nota tıklayınca dayandığı alıntılar açılır; bir tıkla transkriptteki yerine gidersiniz.*

## Neye ihtiyacınız var

- **Kurulum:** bir kez, birkaç komutla yapılır ([aşağıda](#kurulum)). Terminal kullanmaya alışkın değilseniz teknik bir arkadaşınızdan isteyin. macOS'ta denendi; Windows ve Linux'ta denenmedi.
- **Transkript:** Microsoft Teams (iş ya da okul hesabı) ve Zoom (ücretli plan) konuşmacı adlarıyla bir dosya verir. Google Meet'in kendi transkripti henüz Türkçe çıkarmıyor ([Google'ın yardım sayfası](https://support.google.com/meet/answer/12849897)); Türkçe için [Tactiq](https://tactiq.io) kullanıp (ilk 10 transkript her ay ücretsiz; transkripti Tactiq saklar) TXT dosyasını buraya aktarabilirsiniz, rehber nasıl yapılacağını anlatır. Diğer durumlar için rehber, görüşmeyi adayın onayıyla kaydedip bilgisayarınızda yazıya dökmeyi anlatır.
- **AI için** aşağıdaki iki yoldan biri. AI olmadan da uygulamanın geri kalanı çalışır.

## AI'yi kullanmanın iki yolu

| | API anahtarıyla | Claude Desktop ya da Claude Code ile (MCP) |
|---|---|---|
| Ne gerekir | Anthropic'ten alınan bir API anahtarı (kullandıkça ücretlidir); uygulamaya bir kez kaydedilir | Bilgisayarınızda Claude Desktop ya da Claude Code; uygulamaya bir kez bağlanır. API anahtarı gerekmez |
| Nasıl kullanılır | Çalışma alanında düğmeye basarsınız | Claude'da sohbeti başlatıp adayı adıyla sorarsınız: "Interview Companion'ı başlat ve Selin Öztürk Terraform hakkında ne dedi, söyle." |
| Bilgisayarınızdan ne çıkar | Düğmeye bastığınızda, düğmenin yanında yazan veri Anthropic'e gider | Claude'un okuduğu veri, Claude'un kullandığı modele gider |
| Sonuç nerede görünür | Çalışma alanındaki Görüşme notları kartında | Claude sohbetinde; **Buraya kaydetmeye izin ver** açıksa notlar, sorular ve Aday Özeti uygulamada da görünür |

**Yalnızca başlattığınız sohbette çalışır.** Bir sohbette "Interview Companion'ı başlat" yazın ve Claude izin isteyince onaylayın; Claude Code'da hazır komut da var. Başlatmadığınız bir sohbette, adı geçen biri adayınız olsa bile, Claude uygulamanın verisine erişemez: uygulama ona hiçbir şey vermez.

Başlattığınızda Claude uygulamadaki veriyi doğrudan okur; siz bir şey kopyalamazsınız. Cevap, alıntısıyla ve alıntının nerede geçtiğiyle gelir: CV'de mi, hangi görüşmede mi. Bir şey CV'de yazıp görüşmede konuşulmadıysa ya da hiç geçmiyorsa bunu söyler. Claude okuyabilir ve izin verirseniz yalnızca kendi yazdıklarını kaydedebilir; adayları, görüşmeleri, CV'leri, transkriptleri ve sizin notlarınızı silemez, değiştiremez. Bağlamak için uygulamada **MCP ile kullan** düğmesine basın; ayrıntılar [docs/mcp.md](docs/mcp.md) dosyasında (İngilizce).

## Başka neler var

- **Adaylar** listesinde rol süzgeci, tek tıkla sıralama, bugünün ve bu haftanın görüşmeleri, **Görüşme takvimi**.
- Her rol için **Rol soruları**: o role eklenen her yeni aday bu soruların bir kopyasını alır.
- **Sorularım**: her sorunun görüşmede sorulup sorulmadığı görünür; kendi işaretiniz AI'nin bulduğundan önce gelir.
- CV'de ve bütün transkriptlerde arama; her sonuç bir alıntıdır ve yerine götürür.
- AI'den sonraki görüşme için soru önerisi; beğendiğinizi Sorularım'a eklersiniz.
- Bir adayı dosya olarak dışa aktarma ve uygulamanın başka bir kopyasına alma.
- Türkçe ve İngilizce arayüz; denemek için on bir örnek aday.

<details>
<summary>Daha fazla ekran görüntüsü</summary>

![Adaylar listesi ve Görüşme takvimi](docs/images/home.png)
*Adaylar ve Görüşme takvimi: bugün kiminle görüşeceğiniz ilk bakışta.*

![Toplu CV yükleme: yedi CV ve CV'lerden okunan isimler](docs/images/add-many.png)
*Toplu CV yükle: isimleri tek tek yazmazsınız.*

![Transkripti nasıl alırım? rehberi](docs/images/guide-transcript.png)
*Transkripti nasıl alırım? rehberi: her toplantı aracı için yol ve kayıttan önce yapılacaklar.*

</details>

## Bilerek yapmadıkları

- Adaylara puan vermez, onları sıralamaz ya da karşılaştırmaz.
- AI hiçbir şeye karar vermez.
- Toplantıya katılmaz, kayıt almaz. Transkripti siz getirirsiniz.
- Bulut hesabı yoktur. AI yalnızca siz istediğinizde, sizin anahtarınızla ya da sizin Claude uygulamanızla çalışır.

## Gerçek veri girmeden önce

Görüşme verisi kişisel veridir. Gerçek bir aday eklemeden önce üç şeyden emin olun: aday kayda ve verisinin AI ile işlenmesine onay verdi; kurumunuz bu verinin bilgisayarınızda durmasına izin veriyor; kullandığınız AI sağlayıcısı bu veri için onaylı. Uygulama veri klasörünü şifrelemez: şifreli bir disk kullanın ve işiniz biten adayı silin. Türkiye'de 6698 sayılı Kişisel Verilerin Korunması Kanunu geçerlidir. Bu bir hukuki görüş değildir; kurumunuzda kişisel verilerden sorumlu kişiye danışın.

## Kurulum

[Node.js](https://nodejs.org) 24 ya da daha yenisi ve git gerekir.

```sh
git clone https://github.com/GDenizKaratas/interview-companion.git
cd interview-companion
npm install
npm run demo     # isteğe bağlı: on bir örnek adayı yükler
npm start
```

Sonra tarayıcıda http://localhost:3000 adresini açın. Arayüz Türkçe açılır; dili sağ üstten değiştirirsiniz. `npm run demo` komutunu yeniden çalıştırmak örnek adayları tazeler, sizin adaylarınıza dokunmaz.

## Gündemdeki özellikler

Bunlar plandır, söz değildir. Gerekçeler ve kaynaklar [docs/research/what-could-come-next.md](docs/research/what-could-come-next.md) dosyasında (İngilizce).

**Sırada**

- Planlanan görüşmeler için takvim dosyası (`.ics`): tek içe aktarmayla Google Takvim'de ya da Outlook'ta görünür.
- Transkripti yapıştırma, `.srt` ve `.docx` dosyalarını okuma.
- Aday Özeti'ni yazdırma ya da PDF olarak alma.
- Adayları bir tablodan (CSV) içe aktarma.

**Daha çok iş ister**

- Görüşmeyi uygulamanın içinde kaydetme ve Türkçe yazıya dökme: ek yazılım olmadan, ses bilgisayardan çıkmadan.
- Transkriptleri Teams ya da Zoom'dan kendiliğinden çekme: her şirketin ayrı bir onay süreci var.
- Google Takvim ile canlı eşitleme: Google'ın doğrulama süreci gerekir; takvim dosyası faydanın çoğunu verir.
- Bir ekibin aynı adaylar üzerinde birlikte çalışması: hesapları ve yetkileri olan gerçek bir sunucu gerekir.

## Geliştiriciler için

Üç modüllü tek bir TypeScript projesi: `core` bütün kuralları ve veri erişimini tutar; `web` (yerel sunucu ve tarayıcı arayüzü) ve `mcp` (MCP sunucusu) yalnızca `core`'u çağırır. Veriler proje klasöründeki `data/` altında durur (bir SQLite dosyası ve CV dosyaları); başka bir klasör için `DATA_DIR`, başka bir kapı için `PORT` ayarlanır. Uygulamaya yalnızca kendi bilgisayarınızdan (`127.0.0.1`) erişilir. `npm test`, `npm run typecheck` ve `npm run lint` çalıştırılır. Kodda ve belgelerde geçen terimler [GLOSSARY.md](GLOSSARY.md) dosyasında; ayrıntılar [docs/architecture.md](docs/architecture.md), [docs/decisions.md](docs/decisions.md), [docs/adr](docs/adr), [docs/mcp.md](docs/mcp.md) ve [CONTRIBUTING.md](CONTRIBUTING.md) dosyalarında (İngilizce). Lisans: [MIT](LICENSE).
