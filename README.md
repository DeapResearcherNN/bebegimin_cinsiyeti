# Bebeğimin Cinsiyeti

Aile üyelerinin bebeğin cinsiyetini tahmin edebildiği ve bebeğe bir mesaj bırakabildiği özel aile web sitesi.

## Mevcut yapı

Bu sürümde:

- Mobil uyumlu tahmin formu
- İsim ve yakınlık bilgisi
- Kız / Erkek tahmini
- İsteğe bağlı kısa not
- Bebeğe mesaj
- Tahmin özeti ve onay ekranı
- GitHub Pages ile uyumlu statik yapı
- Arama motorlarına noindex talimatı

Yanıtlar Google Apps Script üzerinden özel Google Sheet'e, fotoğraf ve ses/video
dosyaları Google Drive'a kaydedilir. `config.js` mevcut web uygulaması adresini
ve anonim sonuç tablosunu tanımlar.

- `index.html`: aile formu, fotoğraf ve kısa video kaydı
- `sonuclar.html`: kimlik ve özel hatıra içeriği göstermeyen sonuçlar
- `admin.html`: e-posta koduyla korunan yönetim ekranı
- `api.js`: bağlantı kontrolü, tek POST ve sunucu kayıt onayı
- `backend/Code.gs`: Google Apps Script sunucu kodu

Tarayıcı yalnızca sonuç yenileme işaretini ve yeniden gönderim için geçici rastgele
kayıt anahtarını/cevap özetinin hash değerini saklar. Gerçek cevapların kalıcı arşivi
Google'dadır. Sunucu kaydı doğrulanmadan başarı ekranı gösterilmez.

## Yayın ve bağlantı

GitHub Pages, kök dizindeki dosyaları yayınlar. Apps Script ayrı bir dağıtımdır ve
GitHub'a kod göndermek sunucuyu güncellemez. Google girişine yönlenen kayıt adresi
ve yeni sunucu sürümünü yayınlama adımları için [backend/DEPLOY.md](backend/DEPLOY.md)
dosyasına bak.

## Kontroller

Node.js ile, ek paket kurmadan:

```sh
node --test tests/*.test.cjs
```

Kontroller tek gönderimi, kayıt onayını, bağlantı/hata davranışını, tekrar gönderimin
ikinci cevap oluşturmamasını ve kayıt sonrası yardımcı işlemlerin başarısızlığını kapsar.
