
# Google kullanmadan kayıt ve şifreli yönetim

Bu değişiklik henüz canlı kayıt servisine bağlanmadı. Cloudflare hesabında kaynaklar
oluşturulup gerçek servis adresi doğrulandıktan sonra yayın akışı site bağlantısını günceller.

## Kullanım

- Aile formu ve anonim sonuçlar giriş gerektirmez.
- Yönetim paneli tek bir ortak yönetici şifresiyle açılır.
- E-posta, doğrulama kodu veya Google girişi kullanılmaz.
- Tahminler Cloudflare D1'e, fotoğraf/video/ses özel R2 alanına kaydedilir.
- İsimler, yazılı mesajlar ve dosyalar yalnızca yönetici oturumuna açıktır.
- Oturum altı saat geçerlidir. Aynı cevabın tekrar gönderimi ikinci kayıt oluşturmaz.

## Hesap bağlantısı

Cloudflare oturumuna erişen bir çalışma ortamı veya hesap bağlantısı gerekir.
Gizli değerleri sohbete ya da kaynak koduna yazma.

GitHub Actions'ın şifreli Secrets bölümünde:

- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_API_TOKEN: seçilen hesapta Worker, D1 ve R2 kurma/yönetme izinleri
- BABY_ADMIN_PASSWORD: ortak yönetici şifresi (8-256 karakter)

Yayın sırasında yönetici şifresinden tuzlu PBKDF2-SHA256 özeti üretilir ve Worker'ın
şifreli secret alanına yazılır. Düz şifre site dosyalarında veya veritabanında tutulmaz.
Tarayıcıya dönen yönetici oturumu ayrıca veritabanında hash olarak saklanır.

## Yayın

cloudflare-migration dalında yalnızca testler çalışır. Hesap erişimi hazır olduğunda
main dalına geçişte yayın akışı D1/R2 kaynaklarını kurar, Worker'ı yayınlar ve sağlık
yanıtını doğrular. Başarılı doğrulamadan sonra gerçek adres gh-pages/config.js içine
yazılır ve GitHub Pages yayını açıkça tetiklenir. Mevcut gh-pages yayın kaynağı korunur.

## Test

Node.js 24 ile:

node --test tests/*.test.cjs cloudflare/tests/*.test.mjs

Testler gerçek SQLite üzerinde kayıt, tekrar gönderim, özel dosya erişimi, anonim
sonuçlar, şifreli oturum ve dosya alanı hatasını kontrol eder. Bunlar gerçek
Cloudflare dağıtımının doğrulaması yerine geçmez.

## Eski kayıtlar

Mevcut Google arşivi değiştirilmez veya silinmez. Önceki gerçek cevaplar ve medya,
hesap erişimi sağlanınca ayrıca aktarılmalıdır. Bu PR eski cevapları otomatik
olarak Cloudflare'a taşımış gibi göstermez.
