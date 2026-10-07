# Google Apps Script backend kurulumu

Bu klasördeki `Code.gs` dosyası, GitHub Pages üzerindeki aile sitesinin güvenli arka ucudur.

## Ne yapar?

- Cevapları Google Sheet'e yazar.
- Aynı kişinin ikinci kez cevap göndermesini engeller.
- Fotoğrafları Drive > Fotoğraflar klasörüne kaydeder.
- Video/ses dosyalarını Drive > Video-Ses klasörüne kaydeder.
- Her yanıt için JSON yedeğini Drive > Yedekler klasörüne yazar.
- Naime'ye Drive erişimi verir.
- Yeni cevap geldiğinde Naime ve Serhan'a e-posta bildirimi yollar.
- Admin sayfasına cevapları ve katılımcı durumlarını verir.

## Bir defalık kurulum

1. Google Sheet'i aç:
   Bebeğimiz İçin Aile Tahminleri - Cevaplar
2. Uzantılar > Apps Script seç.
3. Varsayılan Code.gs içeriğini silip bu dosyanın içeriğini yapıştır.
4. Apps Script > Project Settings > Script Properties bölümünde iki gizli değer ekle:
   - FAMILY_CODE = aile üyelerine vereceğiniz ortak şifre
   - ADMIN_PASSWORD = yalnızca Naime/Serhan'ın bileceği güçlü admin şifresi
5. `setupSharing` fonksiyonunu editörden bir kez çalıştır ve Google izinlerini onayla.
6. Deploy > New deployment > Web app:
   - Execute as: Me
   - Who has access: Anyone
7. Deploy et ve `/exec` ile biten Web App URL'sini kopyala.
8. Bu URL'yi ChatGPT'ye gönder. `config.js` dosyasındaki apiUrl alanı güncellenince site merkezi kayıt sistemine geçer.

## Güvenlik

Şifreleri GitHub'a yazmayın. Repo public olduğu için sadece Script Properties'te tutulmalıdır.
