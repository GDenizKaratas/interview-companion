# Interview Companion

[English](README.md)

Interview Companion, bir adayla ilgili her şeyi tek yerde tutar: CV'si, görüşmeleri, transkriptleri, sizin notlarınız ve sorularınız. Yapay zekâ isterseniz transkriptten sizin için not çıkarır. Her notun yanında adayın kendi sözleri durur, böylece notu tek tıkla kontrol edersiniz. Yapay zekâ sizin not tutanınızdır: kimseye puan vermez, kararı her zaman siz verirsiniz. Uygulama kendi bilgisayarınızda çalışır ve bütün verisi orada, tek bir klasörde kalır.

![Aday listesi ve görüşme takvimi](docs/images/home.png)
*Aday listesi; bugünün ve bu haftanın görüşmeleri takvimde.*

Bu depodaki ve ekran görüntülerindeki bütün isimler, CV'ler ve transkriptler kurmacadır. Kodda ve belgelerde kullanılan İngilizce terimler [GLOSSARY.md](GLOSSARY.md) dosyasında tanımlıdır.

## Bugün neler yapabilirsiniz

### Aday ekleyin, görüşme planlayın

- Adayları tek tek ekleyin ya da birçok CV'yi (PDF) bir kerede bırakın. Uygulama her adayın adını CV'den okur; kaydetmeden önce düzeltebilirsiniz.
- Her adaya bir rol verin. Bir rol için rol soruları tutun; o role eklenen her yeni aday bu soruların bir kopyasını alır.
- Birden fazla adayla görüşmeyi bir kerede planlayın: bir gün ve ilk saati seçin, adayları işaretleyin.
- Bugünün ve bu haftanın görüşmelerini takvimde görün. Aday listesini bir sütuna göre sıralayın, role göre süzün ya da yalnızca henüz görüşmesi olmayan adayları gösterin.

![Birçok CV'yi bir kerede eklemek](docs/images/add-many.png)
*Birçok CV bir kerede: adlar CV'lerden okunur.*

### Bir aday üzerinde çalışın

- Her adayın tek bir ekranı vardır. CV, her görüşmenin transkripti, notlarınız ve sorularınız yan yana durur.
- Transkripti WebVTT (`.vtt`; Teams ve Zoom bu dosyayı verir) ya da her satırı `Konuşan: metin` biçiminde düz metin olarak içe aktarın.
- Kimin konuştuğunu siz onaylarsınız: bir aday ve en az bir görüşmeci. Siz onaylayana kadar yapay zekâ bekler.
- Kendi notlarınızı ve sorularınızı yazın. Her soru için görüşmede sorulup sorulmadığı, arandığı hâlde bulunamadığı ya da planlandığı görünür. Bir soruyu siz işaretlerseniz sizin işaretiniz geçerlidir.
- CV'de ve bütün transkriptlerde bir kelime arayın; isterseniz yalnızca adayın söylediklerinde. Her sonuç birebir bir alıntıdır ve tıklayınca geldiği yeri açar.

![Bir adayın çalışma ekranı](docs/images/workspace.png)
*Bir adayın ekranı: CV, transkript, notlar ve sorular bir arada.*

### Notları yapay zekâya aldırın

- **Görüşme notları**, iki sekmede. **Sorular ve cevaplar** görüşmede sorulan soruları, her birinin cevabının kısa bir anlatımıyla listeler. **Aday hakkında notlar** kısa notları listeler. Her satır, yazıldığı alıntıları taşır; uygulama satırı ancak her alıntı transkriptte kelimesi kelimesine geçiyorsa kaydeder.
- Her notu onaylar, düzeltir ya da kaldırırsınız; bir soruyu ve cevabını yanlış olarak işaretleyebilirsiniz.
- Sonraki görüşme için önerilen sorular; istediğinizi kendi listenize alırsınız.
- Aday Özeti: aday hakkında tek sayfa, her maddenin dayandığı alıntılarla.

![Yapay zekânın alıntılı görüşme notları](docs/images/interview-notes.png)
*Görüşme notları: her satırın yanında adayın kendi sözleri, sizin kontrolünüzü bekliyor.*

### Diğerleri

- Bir adayı zip dosyası olarak dışa aktarın ve uygulamanın başka bir kopyasına alın.
- Arayüz Türkçe ve İngilizcedir.
- On bir kurmaca adaylık örnek veriyle her ekranı hiç uğraşmadan deneyebilirsiniz.

## Yapay zekâyı kullanmanın iki yolu

1. **Anthropic API anahtarıyla.** Anahtarı uygulamaya kaydedin. Uygulama modeli yalnızca siz bir düğmeye bastığınızda çağırır ve önce neyi göndereceğini söyler.
2. **Anahtarsız, Claude Desktop ya da Claude Code ile.** Bunu uygulamaya bir kez MCP ile bağlayın. MCP, bir yapay zekâ uygulamasının başka bir programın verisini kullanmasını sağlayan açık bir standarttır. Sonra yalnızca sorun, örneğin: "Selin Öztürk Terraform hakkında ne dedi?" Claude uygulamanın verisini bilgisayarınızda, o anki hâliyle okur; hiçbir şey yeniden kopyalanmaz ya da yüklenmez. Cevap, dayandığı alıntıyla ve yeriyle gelir (CV mi, hangi görüşmenin transkripti mi); bir şey CV'de yazıp görüşmede konuşulmadıysa ya da hiç geçmiyorsa bunu da söyler. İzin verirseniz Claude yazdığı notları uygulamaya kaydeder; uygulama bunları kendi notları gibi kontrol eder.

MCP üzerinden yapay zekâ uygulaması okuyabilir ve izninizle yalnızca kendi notlarını, sorularını ve Aday Özeti'ni kaydedebilir. Adayları, görüşmeleri, CV'leri, transkriptleri ya da sizin notlarınızı silecek veya değiştirecek bir aracı yoktur. Kurulum birkaç dakika sürer: [docs/mcp.md](docs/mcp.md) (İngilizce).

## Transkripti nereden alırsınız

- Microsoft Teams (iş ya da okul hesabı) ve Zoom (ücretli plan), konuşan adlarını içeren bir WebVTT dosyası verebilir; uygulama bunu içe aktarır.
- Google Meet transkript çıkarmayı yalnızca birkaç dilde sunar; 11 Kasım 2026'da Türkçe bu listede yoktu ([Google'ın yardım sayfası](https://support.google.com/meet/answer/12849897)).
- Diğer durumlarda, adayın onayıyla görüşmeyi kaydedin ve kaydı bilgisayarınızdaki bir konuşmadan metne aracıyla yazıya dökün.

Uygulamada bunun için bir rehber var: transkript içe aktarma düğmesinin yanındaki **Transkripti nasıl alırım?** Bilgiler ve kaynakları [docs/research/getting-a-transcript.md](docs/research/getting-a-transcript.md) dosyasında.

![Transkript rehberi](docs/images/guide-transcript.png)
*Uygulamadaki rehber: her toplantı aracı için transkripti almanın yolu.*

## Çalıştırma

[Node.js](https://nodejs.org) 24 veya üstü ve git gerekir. API anahtarı gerekmez.

```sh
git clone https://github.com/GDenizKaratas/interview-companion.git
cd interview-companion
npm install
npm run demo     # isteğe bağlı: on bir kurmaca örnek adayı yükler
npm start
```

Ardından http://localhost:3000 adresini açın. Arayüz Türkçe açılır; sağ üstteki dil menüsünden İngilizceye geçebilirsiniz. `npm run demo` komutunu yeniden çalıştırmak örnek verileri tazeler, kendi adaylarınıza dokunmaz.

Veriler proje klasörünün içindeki `data/` klasöründedir: bir SQLite dosyası ve CV dosyaları. Başka bir klasör için `DATA_DIR` değişkenini ayarlayın. Uygulama yalnızca kendi bilgisayarınızdan (`127.0.0.1`) erişilir ve giriş ekranı yoktur.

## Bilerek yapmadıkları

- Adaylara puan vermez, onları sıralamaz ya da karşılaştırmaz.
- Yapay zekâ hiçbir şeye karar vermez. Not yazar; alıntıları siz okur, değerlendirmeyi siz yaparsınız.
- Bulut hesabı yoktur. Kayıt olunmaz, bize ait bir sunucu yoktur; model yalnızca siz istediğinizde, sizin anahtarınızla ya da sizin Claude uygulamanızla çağrılır.
- Toplantıları kaydetmez, toplantılara katılmaz. Transkripti siz getirirsiniz.

## Gerçek veri girmeden önce

Görüşme verisi kişisel veridir. Gerçek bir aday eklemeden önce adayın kayda ve yapay zekâyla işlenmeye onay verdiğinden, kurumunuzun bu verinin sizin bilgisayarınızda tutulmasına izin verdiğinden ve yapay zekâ sağlayıcınızın bu veri için onaylı olduğundan emin olun. API anahtarıyla veri Anthropic'e gider; MCP ile Claude uygulamanızın kullandığı modele gider. Uygulama veri klasörünü şifrelemez; şifreli bir disk kullanın ve artık gerekmeyen adayı silin. Türkiye'de 6698 sayılı Kişisel Verilerin Korunması Kanunu geçerlidir; uygulamadaki transkript rehberi bununla ilgili kısa bir hatırlatma içerir, hukuki görüş değildir.

## İleride neler eklenebilir

Bunlar fikirdir, söz değildir. Gerekçeler ve kaynaklar [docs/research/what-could-come-next.md](docs/research/what-could-come-next.md) dosyasında (İngilizce).

| Fikir | Ne kazandırır | Ne gerektirir |
|---|---|---|
| Planlanan görüşmeler için takvim dosyası (`.ics`) | Planlanan görüşmeler tek içe aktarmayla Google Takvim'de ya da Outlook'ta | Bir dosya dışa aktarımı; hesap ya da izin gerekmez |
| Transkripti yapıştırma; `.srt` ve `.docx` okuma | Toplantı aracından ya da konuşmadan metne aracından daha az adım | İki yeni okuyucu ve bir metin kutusu |
| Bir kaydı bilgisayarda yazıya dökme | Hiçbir toplantı aracı transkript vermediğinde de bir transkript; ses bilgisayardan çıkmaz | Whisper gibi yerel bir model ve konuşanları ayırmanın bir yolu; Türkçedeki başarısı denenmedi |
| Aday Özeti'ni yazdırma ya da PDF | Toplantıya götürülecek bir özet | Bir baskı düzeni |
| Adayları CSV'den içe aktarma | Bir tablodan ya da aday takip sisteminden çok sayıda aday | Sütun eşleştirme ve kontroller |
| Ağır: transkriptleri Google Meet, Teams ya da Zoom'dan otomatik çekme | İndirilecek dosya kalmaz | Meet Türkçe transkript çıkarmıyor. Başkalarının bağlanabilmesi için her şirketin kendi incelemesi var: Google'ın hassas veri doğrulaması, Microsoft'ta bir yöneticinin izni, Zoom Marketplace incelemesi. "Transkript hazır" bildirimleri bilgisayarınızdaki bir uygulama için değil, internetteki bir sunucu için tasarlanmıştır. |
| Ağır: Google Takvim ile canlı eşitleme | Görüşmeler kendiliğinden görünür ve güncellenir | Aynı Google doğrulaması; `.ics` dosyası faydanın çoğunu verir |
| Ağır: bir ağ sürücüsünde birkaç kişinin ortak kullandığı veritabanı | Bir ekibin aynı adaylar üzerinde çalışması | SQLite, veritabanı dosyasının ağ sürücüsünde kullanılmasını önermez; hesapları ve yetkileri olan gerçek bir sunucu gerekir |

## Geliştiriciler için

Üç modüllü tek bir TypeScript projesi: `core` bütün kuralları ve veri erişimini tutar; `web` (yerel sunucu ve tarayıcı arayüzü) ve `mcp` (MCP sunucusu) yalnızca `core`'u çağırır. `npm test`, `npm run typecheck` ve `npm run lint` komutlarını çalıştırın. Ayrıntılar [docs/architecture.md](docs/architecture.md), [docs/decisions.md](docs/decisions.md), [docs/adr](docs/adr), [docs/mcp.md](docs/mcp.md) ve [CONTRIBUTING.md](CONTRIBUTING.md) dosyalarında (İngilizce). Lisans: [MIT](LICENSE).
