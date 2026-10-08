
# Google kullanmadan kayıt: Cloudflare geçişi

Bu değişiklik henüz canlı kayıt servisine bağlanmadı. Cloudflare hesabında kaynaklar
oluşturulup gerçek servis adresi doğrulandıktan sonra yayın akışı site bağlantısını
günceller. Kod içinde tahmini bir workers.dev adresi veya erişim anahtarı yoktur.

## Sonuç

- Site ve kaynak kodu GitHub'da kalır.
- Tahminler özel Cloudflare D1 veritabanına kaydedilir.
- Fotoğraf, video ve ses dosyaları özel R2 alanında tutulur. Public bucket açılmaz.
- Herkes anonim sonuçları görebilir; isimler, yazılı mesajlar ve dosyalar yönetici
  oturumu gerektirir.
- Mevcut iki yönetici e-posta koduyla giriş yapar.
- Aynı kayıt anahtarıyla tekrar gönderim ikinci cevap oluşturmaz.

## Hesap bağlantısı ve yayın

Cloudflare hesabına erişen bir çalışma ortamı veya hesap bağlantısı gerekir.
API anahtarları sohbet mesajına veya GitHub dosyalarına yazılmaz.

GitHub Actions'ın şifreli Secrets bölümünde gereken hesap bağlantıları:

- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_API_TOKEN: sadece seçilen hesapta Worker, D1 ve R2 kurma/yönetme izinleri

CLOUDFLARE_EMAIL_FROM değişkeni mevcut Cloudflare Email Service alanındaki
yetkili gönderici adresidir. Yönetici kodları yalnızca mevcut iki yöneticiye gönderilir.
E-posta hizmeti yapılandırılmadan yönetici girişi açık kabul edilmez.

cloudflare-migration dalında yalnızca testler çalışır. main dalına geçişten sonra
yayın akışı gerçek kaynakları oluşturur veya mevcut aynı adlı kaynakları kullanır,
şemayı uygular, Worker'ı yayınlar ve sağlık yanıtını doğrular. Yalnızca bu işlem
başarılı olursa gerçek API adresi gh-pages/config.js dosyasına yazılır.
GitHub Pages'in mevcut gh-pages yayın kaynağı korunur.

## Test

Node.js 24 ile ek test paketi gerektirmez:

node --test tests/*.test.cjs cloudflare/tests/*.test.mjs

Testler gerçek SQLite üzerinde kayıt, yinelenen kayıt, özel dosya erişimi, anonim
sonuçlar, yönetici kodu ve dosya alanı hatasını kontrol eder. Bunlar Cloudflare
hesabında gerçek bir dağıtımın doğrulaması yerine geçmez.

## Eski kayıtlar

Mevcut Google arşivi değiştirilmez veya silinmez. Önceki gerçek cevaplar ve medya,
hesap erişimi sağlanınca ayrıca aktarılmalıdır. Bu PR eski cevapları otomatik
olarak Cloudflare'a taşımış gibi göstermez.
