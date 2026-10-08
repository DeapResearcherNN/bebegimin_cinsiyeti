# Aile tahminleri: Google Drive ve yöneticiler için e-posta doğrulaması

Bu projede aile formu GitHub Pages üzerinden yayınlanır. Yanıtlar Google Sheet'e,
fotoğraf ve ses/video dosyaları Google Drive'a kaydedilir.

## Yönetici girişi nasıl çalışır?

- Aile formunda hiçbir şifre yoktur.
- Admin sayfasında Naime veya Serhan seçilir.
- Seçilen Google e-posta adresine 6 haneli, 10 dakika geçerli tek kullanımlık kod gönderilir.
- Kod doğrulanırsa yalnızca o tarayıcı sekmesinde 6 saatlik yönetici oturumu açılır.
- Şifreler ve oturum anahtarları **GitHub koduna yazılmaz**. Oturum anahtarı yalnızca tarayıcı
  oturumunda ve sunucunun geçici önbelleğinde tutulur.
- Kodun aynı anda 5 kez yanlış denenmesi engellenir. Kod gönderimi sıklık sınırına tabidir.
- Giriş yapabilecek tek hesaplar: naimegunduz75@gmail.com ve serhan.narli@gmail.com.

**Bu sistem Google hesabı OAuth düğmesi kullanmaz.**
Google e-posta adreslerinin sahipliğini e-postaya gönderilen tek kullanımlık kodla doğrular.

## Halihazırda dağıtılmış Apps Script'i güncellemek (yeni URL gerekmez)

1. Google Apps Script projesini aç: https://script.google.com
2. Projedeki `Kod.gs` dosyasının tüm içeriğini seçip sil.
3. GitHub'daki `backend/Code.gs` dosyasının **tamamını** oraya kopyala.
4. **Kaydet** (`Ctrl + S`).
5. Sağ üstte **Dağıt → Dağıtımları yönet** seç.
6. Mevcut web uygulaması dağıtımını seç ve **Düzenle (kalem simgesi)** tıkla.
7. **Sürüm → Yeni sürüm** seçip tekrar **Dağıt** de.
8. Google yeni e-posta gönderim izinleri isterse kodu kontrol ettikten sonra onayla.
9. Eski `/exec` URL'si aynı kalır; `config.js` zaten mevcut dağıtım URL'sine bağlıdır.

## Kayıt adresi Google girişine yönlendiriyorsa

GitHub Pages güncellemesi Apps Script dağıtımını güncellemez. Formun aile üyeleri
tarafından Google hesabıyla giriş yapmadan kullanılabilmesi için mevcut web uygulaması
dağıtımında şu iki seçenek gerekir:

- **Şu kullanıcı olarak çalıştır: Ben (dağıtımı yapan hesap)**
- **Erişimi olan kullanıcılar: Herkes** (yalnızca Google hesabı olanlar seçeneği değil)

Dağıtım adresini gizli pencerede `?action=health&callback=checkHealth` ekleyerek aç.
Google giriş ekranı yerine `checkHealth({"ok":true,...})` yanıtını görmelisin.
Güncel kodun yanıtında `submissionVersion: "receipt-v2"` bulunur.
Giriş ekranı görünüyorsa ön yüz kodu bu erişim engelini düzeltemez.

Bu ayar özel cevap tablosunu veya Drive klasörlerini herkese açmaz. Bunların mevcut
özel paylaşımını koru. `publicResults` yalnızca anonim verileri döndürür; yönetim
işlemleri e-posta kodu ve sunucu tarafından doğrulanan oturum gerektirir.

Form artık önce servisi kontrol eder, tek bir POST gönderir ve rastgele kayıt
anahtarıyla sunucudan kayıt onayı bekler. Sunucu hata yanıtı aynı gönderim denemesine
bağlanır. Başarılı yanıt yedek veya bildirim hatası nedeniyle başarısız sayılmaz.
İstek tekrarlandığında aynı kayıt anahtarı ikinci cevap oluşturmaz.

Artık `ADMIN_PASSWORD` veya `FAMILY_CODE` Script Properties gerekmez.
Önceden eklenmişlerse kaldırılabilir. **Kod hiçbir Google hesap parolasını istemez.**

## Drive paylaşımı

Cevaplar tablosu Naime'ye düzenleyici olarak paylaşılmıştır.
Ama fotoğraf/video klasörleri Serhan'ın Drive hesabında oluşturulmuştur.
Bunların da Apps Script'i çalıştıran Naime tarafından erişilebilir olması gerekir.

Serhan kendi hesabında şu klasörü açmalıdır:
https://drive.google.com/drive/folders/1r9IoeRl2OEFVbKoFfumKZeaPaVCFLz05

**Paylaş → naimegunduz75@gmail.com → Düzenleyici** yapmalıdır.
Bu yapılmazsa Naime hesabından çalışan Apps Script fotoğraf/video yükleyemeyebilir.

## Güvenlik sınırları

- Aile formu şifresiz olduğu için linke ulaşan herhangi biri yanıt göndermeyi deneyebilir.
- Aynı ad ve aynı yakınlıkla ikinci cevap engellenir; kimlik doğrulaması olmadığından
  farklı isim kullanılarak bu kontrol atlatılabilir.
- Katılımcı listesini admin ekranından oluşturup `Sadece listedekiler` modunu açmak
  istenmeyen yanıtları azaltır ama güçlü kimlik doğrulaması yerine geçmez.
- GitHub deposu ve site herkese açıktır. Gerçek admin oturumu ve kayıtların görüntülenmesi
  sunucu tarafında doğrulanmalıdır.
- Google Drive izinleri cevap ve yüklenen dosyaları yalnızca yetkili hesaplarda tutmalıdır.
- Cevap kaydedildikten sonra bildirim e-postasında hata oluşursa kayıt iptal edilmez.
