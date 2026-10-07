const APP = Object.freeze({
  SHEET_ID: '1Tgrd_sU1aOu9NKpFsv8_iM8Hh2rBifHbIqFSlDI5Cys',
  ROOT_FOLDER_ID: '1r9IoeRl2OEFVbKoFfumKZeaPaVCFLz05',
  PHOTO_FOLDER_ID: '1tqT07DElWXjn7BEEa1KMi4MCTZt-b1Ez',
  MEDIA_FOLDER_ID: '1HHeZ7AH1NjaA2TOP1WaphmmT9X3Gd-oi',
  BACKUP_FOLDER_ID: '1V7_wclmw5Vu0pHQBizmxZVP8TdGZaRiw',
  NAIME_EMAIL: 'naimegunduz75@gmail.com',
  SERHAN_EMAIL: 'serhan.narli@gmail.com',
  SITE_ORIGIN: 'https://deapresearchernn.github.io'
});

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'health';

  try {
    let result;

    if (action === 'health') {
      result = { ok: true, service: 'baby-family-api', authVersion: 'email-otp-v2', time: new Date().toISOString() };
    } else {
      throw new Error('Bilinmeyen işlem.');
    }

    return jsonp_(p.callback, result);
  } catch (err) {
    return jsonp_(p.callback, { ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  const p = (e && e.parameter) || {};

  try {
    let result;
    const action = p.action || 'submit';

    if (action === 'submit') {
      result = submitResponse_(p);
    } else if (action === 'requestAdminCode') {
      result = requestAdminCode_(p);
    } else if (action === 'verifyAdminCode') {
      result = verifyAdminCode_(p);
    } else if (action === 'logoutAdmin') {
      result = logoutAdmin_(p);
    } else if (action === 'adminList') {
      requireAdminSession_(p.adminToken);
      result = getAdminData_();
    } else if (action === 'adminAddParticipant') {
      requireAdminSession_(p.adminToken);
      result = adminAddParticipant_(p);
    } else if (action === 'adminSetSetting') {
      requireAdminSession_(p.adminToken);
      result = adminSetSetting_(p);
    } else {
      throw new Error('Bilinmeyen işlem.');
    }

    if (p.requestId) result.requestId = p.requestId;
    return postMessage_(result);
  } catch (err) {
    return postMessage_({ ok: false, error: String(err.message || err), requestId: p.requestId || '' });
  }
}

function setupSharing() {
  const folders = [
    APP.ROOT_FOLDER_ID,
    APP.PHOTO_FOLDER_ID,
    APP.MEDIA_FOLDER_ID,
    APP.BACKUP_FOLDER_ID
  ];

  folders.forEach(function(id) {
    DriveApp.getFolderById(id).addEditor(APP.NAIME_EMAIL);
  });

  DriveApp.getFileById(APP.SHEET_ID).addEditor(APP.NAIME_EMAIL);

  return 'Paylaşım tamamlandı.';
}

function submitResponse_(p) {

  const settings = getSettings_();
  if (String(settings.FORM_ACIK).toUpperCase() !== 'TRUE') {
    throw new Error('Form şu anda yeni cevap kabul etmiyor.');
  }

  const name = clean_(p.name);
  const relation = clean_(p.relation);
  const gender = clean_(p.gender);
  const firstGuess = clean_(p.firstGuess);
  const shortNote = clean_(p.shortNote);

  if (!name || !relation || !gender || !firstGuess) {
    throw new Error('Zorunlu alanlardan biri eksik.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.openById(APP.SHEET_ID);
    const participantsSheet = ss.getSheetByName('Katılımcılar');
    const responsesSheet = ss.getSheetByName('Cevaplar');

    let participant = findParticipant_(participantsSheet, name, relation);
    const listRequired = String(settings.KATILIMCI_LISTESI_ZORUNLU).toUpperCase() === 'TRUE';

    if (!participant && listRequired) {
      throw new Error('Bu kişi katılımcı listesinde bulunamadı.');
    }

    if (!participant) {
      const participantId = Utilities.getUuid();
      participantsSheet.appendRow([participantId, name, relation, true, false, '']);
      participant = {
        row: participantsSheet.getLastRow(),
        id: participantId,
        name: name,
        relation: relation,
        answered: false
      };
    }

    if (participant.answered || hasResponse_(responsesSheet, participant.id)) {
      throw new Error('Bu kişi daha önce cevap gönderdi. Cevap değiştirilemez.');
    }

    const photo = saveUpload_(
      APP.PHOTO_FOLDER_ID,
      participant.id + '_foto',
      p.photoName,
      p.photoMime,
      p.photoData,
      8 * 1024 * 1024
    );

    const media = saveUpload_(
      APP.MEDIA_FOLDER_ID,
      participant.id + '_medya',
      p.mediaName,
      p.mediaMime,
      p.mediaData,
      20 * 1024 * 1024
    );

    const submittedAt = new Date();
    const recordId = Utilities.getUuid();

    responsesSheet.appendRow([
      recordId,
      participant.id,
      name,
      relation,
      gender,
      firstGuess,
      shortNote,
      photo.id || '',
      photo.url || '',
      media.id || '',
      media.url || '',
      submittedAt,
      true
    ]);

    participantsSheet.getRange(participant.row, 5, 1, 2)
      .setValues([[true, submittedAt]]);

    // Auxiliary operations must never invalidate an already saved response.
    try {
      writeBackupJson_({
        recordId: recordId,
        participantId: participant.id,
        name: name,
        relation: relation,
        gender: gender,
        firstGuess: firstGuess,
        shortNote: shortNote,
        photo: photo,
        media: media,
        submittedAt: submittedAt.toISOString()
      });
    } catch (backupError) {
      console.error('Yedek oluşturulamadı: ' + String(backupError));
    }

    try {
      sendNotification_(name, relation, gender, submittedAt);
    } catch (notificationError) {
      console.error('Bildirim gönderilemedi: ' + String(notificationError));
    }

    return {
      ok: true,
      message: 'Tahminin kaydedildi ve artık değiştirilemez.',
      recordId: recordId,
      submittedAt: submittedAt.toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

function getStatus_(p) {
  const name = clean_(p.name);
  const relation = clean_(p.relation);

  if (!name || !relation) {
    return { ok: true, answered: false };
  }

  const ss = SpreadsheetApp.openById(APP.SHEET_ID);
  const participantsSheet = ss.getSheetByName('Katılımcılar');
  const participant = findParticipant_(participantsSheet, name, relation);

  return {
    ok: true,
    answered: Boolean(participant && participant.answered),
    participantId: participant ? participant.id : ''
  };
}

function getParticipants_() {
  const ss = SpreadsheetApp.openById(APP.SHEET_ID);
  const sheet = ss.getSheetByName('Katılımcılar');
  const values = sheet.getDataRange().getDisplayValues();

  const participants = values.slice(1)
    .filter(function(r) { return r[0] && String(r[3]).toUpperCase() !== 'FALSE'; })
    .map(function(r) {
      return {
        id: r[0],
        name: r[1],
        relation: r[2],
        answered: String(r[4]).toUpperCase() === 'TRUE'
      };
    });

  return { ok: true, participants: participants };
}

function getAdminData_() {
  const ss = SpreadsheetApp.openById(APP.SHEET_ID);
  const responses = ss.getSheetByName('Cevaplar').getDataRange().getDisplayValues();
  const participants = ss.getSheetByName('Katılımcılar').getDataRange().getDisplayValues();

  const responseObjects = responses.slice(1)
    .filter(function(r) { return r[0]; })
    .map(function(r) {
      return {
        recordId: r[0],
        participantId: r[1],
        name: r[2],
        relation: r[3],
        gender: r[4],
        firstGuess: r[5],
        shortNote: r[6],
        photoUrl: r[8],
        mediaUrl: r[10],
        submittedAt: r[11],
        locked: r[12]
      };
    });

  const participantObjects = participants.slice(1)
    .filter(function(r) { return r[0]; })
    .map(function(r) {
      return {
        id: r[0],
        name: r[1],
        relation: r[2],
        active: String(r[3]).toUpperCase() !== 'FALSE',
        answered: String(r[4]).toUpperCase() === 'TRUE',
        submittedAt: r[5]
      };
    });

  return {
    ok: true,
    responses: responseObjects,
    participants: participantObjects,
    settings: getSettings_(),
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + APP.SHEET_ID + '/edit'
  };
}

function adminAddParticipant_(p) {
  const name = clean_(p.name);
  const relation = clean_(p.relation);

  if (!name || !relation) {
    throw new Error('Ad ve yakınlık zorunlu.');
  }

  const ss = SpreadsheetApp.openById(APP.SHEET_ID);
  const sheet = ss.getSheetByName('Katılımcılar');

  if (findParticipant_(sheet, name, relation)) {
    throw new Error('Bu kişi zaten listede.');
  }

  const id = Utilities.getUuid();
  sheet.appendRow([id, name, relation, true, false, '']);

  return { ok: true, message: 'Katılımcı eklendi.', participantId: id };
}

function adminSetSetting_(p) {
  const allowed = ['FORM_ACIK', 'CANLI_ACIKLAMA_MODU', 'ETKINLIK_TARIHI', 'KATILIMCI_LISTESI_ZORUNLU'];
  const key = clean_(p.key);
  const value = clean_(p.value);

  if (allowed.indexOf(key) === -1) {
    throw new Error('Bu ayar değiştirilemez.');
  }

  setSetting_(key, value);
  return { ok: true, message: 'Ayar güncellendi.' };
}

function getSettings_() {
  const ss = SpreadsheetApp.openById(APP.SHEET_ID);
  const sheet = ss.getSheetByName('Ayarlar');
  const values = sheet.getDataRange().getDisplayValues();
  const out = {};

  values.slice(1).forEach(function(r) {
    if (r[0]) out[r[0]] = r[1];
  });

  return out;
}

function setSetting_(key, value) {
  const ss = SpreadsheetApp.openById(APP.SHEET_ID);
  const sheet = ss.getSheetByName('Ayarlar');
  const values = sheet.getDataRange().getDisplayValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }

  sheet.appendRow([key, value, '']);
}

function findParticipant_(sheet, name, relation) {
  const values = sheet.getDataRange().getValues();
  const nk = normalize_(name);
  const rk = normalize_(relation);

  for (let i = 1; i < values.length; i++) {
    if (!values[i][0]) continue;

    if (normalize_(values[i][1]) === nk && normalize_(values[i][2]) === rk) {
      return {
        row: i + 1,
        id: String(values[i][0]),
        name: String(values[i][1]),
        relation: String(values[i][2]),
        answered: values[i][4] === true || String(values[i][4]).toUpperCase() === 'TRUE'
      };
    }
  }

  return null;
}

function hasResponse_(sheet, participantId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const ids = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  return ids.some(function(r) { return r[0] === participantId; });
}

function saveUpload_(folderId, prefix, originalName, mimeType, dataUrl, maxBytes) {
  if (!dataUrl) return {};

  const parts = String(dataUrl).split(',');
  const raw = parts.length > 1 ? parts[1] : parts[0];
  const bytes = Utilities.base64Decode(raw);

  if (bytes.length > maxBytes) {
    throw new Error('Yüklenen dosya çok büyük.');
  }

  const safeName = cleanFileName_(originalName || 'dosya');
  const fileName = prefix + '_' + Date.now() + '_' + safeName;
  const blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', fileName);
  const file = DriveApp.getFolderById(folderId).createFile(blob);

  file.addEditor(APP.NAIME_EMAIL);

  return {
    id: file.getId(),
    url: file.getUrl(),
    name: file.getName()
  };
}

function writeBackupJson_(obj) {
  const name = 'yanit_' + obj.participantId + '_' + Date.now() + '.json';
  const blob = Utilities.newBlob(
    JSON.stringify(obj, null, 2),
    'application/json',
    name
  );

  const file = DriveApp.getFolderById(APP.BACKUP_FOLDER_ID).createFile(blob);
  file.addEditor(APP.NAIME_EMAIL);
}

function sendNotification_(name, relation, gender, submittedAt) {
  const subject = 'Yeni aile tahmini: ' + name;
  const body =
    '<p><strong>' + escapeHtml_(name) + '</strong> (' + escapeHtml_(relation) + ') cevap gönderdi.</p>' +
    '<p>Tahmin: <strong>' + escapeHtml_(gender) + '</strong></p>' +
    '<p>Zaman: ' + Utilities.formatDate(submittedAt, 'Europe/Berlin', 'dd.MM.yyyy HH:mm') + '</p>';

  MailApp.sendEmail({
    to: APP.NAIME_EMAIL + ',' + APP.SERHAN_EMAIL,
    subject: subject,
    htmlBody: body
  });
}



const ADMIN_CODE_TTL_SECONDS = 600;
const ADMIN_SESSION_TTL_SECONDS = 21600;
const ADMIN_CODE_ATTEMPT_LIMIT = 5;

function allowedAdminEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email !== APP.NAIME_EMAIL && email !== APP.SERHAN_EMAIL) {
    throw new Error('Bu e-posta hesabı için yönetici erişimi yok.');
  }
  return email;
}

function sha256_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    return ('0' + (b & 255).toString(16)).slice(-2);
  }).join('');
}

function otpSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('ADMIN_OTP_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('ADMIN_OTP_SECRET', secret);
  }
  return secret;
}

function requestAdminCode_(p) {
  const email = allowedAdminEmail_(p.adminEmail);
  const cache = CacheService.getScriptCache();
  const throttleKey = 'baby:otp:throttle:' + email;
  const countKey = 'baby:otp:count:' + email;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (cache.get(throttleKey)) {
      throw new Error('Yeni kod istemeden önce 60 saniye bekle.');
    }
    const count = Number(cache.get(countKey) || '0');
    if (count >= 8) {
      throw new Error('Çok fazla kod istendi. Bir saat sonra tekrar dene.');
    }
    cache.put(throttleKey, '1', 60);
    cache.put(countKey, String(count + 1), 3600);
  } finally {
    lock.releaseLock();
  }

  // Generate a one-time numeric challenge; store only its keyed digest.
  const randomHex = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  const code = String(100000 + parseInt(randomHex, 16) % 900000);
  const hash = sha256_(email + '|' + code + '|' + otpSecret_());
  const otpKey = 'baby:otp:challenge:' + email;
  cache.put(otpKey, JSON.stringify({
    hash: hash,
    attempts: 0,
    expiry: Date.now() + ADMIN_CODE_TTL_SECONDS * 1000
  }), ADMIN_CODE_TTL_SECONDS);

  try {
    MailApp.sendEmail({
      to: email,
      subject: 'Bebeğimiz İçin Aile Tahminleri - Yönetici giriş kodu',
      body: 'Yönetici paneline giriş kodun: ' + code +
        '\n\nKod 10 dakika geçerlidir ve yalnızca bir kez kullanılabilir.' +
        '\nBu işlemi sen başlatmadıysan mesajı dikkate alma.'
    });
  } catch (err) {
    cache.remove(otpKey);
    throw new Error('E-postaya kod gönderilemedi. Google izinlerini kontrol et.');
  }
  return {
    ok: true,
    message: 'Giriş kodunu seçilen e-posta adresine gönderdik. Kod 10 dakika geçerli.'
  };
}

function verifyAdminCode_(p) {
  const email = allowedAdminEmail_(p.adminEmail);
  const code = String(p.adminCode || '').trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error('6 haneli doğrulama kodunu gir.');
  }

  const cache = CacheService.getScriptCache();
  const key = 'baby:otp:challenge:' + email;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const raw = cache.get(key);
    if (!raw) throw new Error('Kodun süresi dolmuş veya kullanılmış. Yeni kod iste.');

    const challenge = JSON.parse(raw);
    if (challenge.expiry < Date.now()) {
      cache.remove(key);
      throw new Error('Kodun süresi doldu. Yeni kod iste.');
    }

    if (challenge.attempts >= ADMIN_CODE_ATTEMPT_LIMIT) {
      cache.remove(key);
      throw new Error('Çok fazla yanlış deneme. Yeni kod iste.');
    }

    const hash = sha256_(email + '|' + code + '|' + otpSecret_());
    if (hash !== challenge.hash) {
      challenge.attempts += 1;
      if (challenge.attempts >= ADMIN_CODE_ATTEMPT_LIMIT) {
        cache.remove(key);
      } else {
        cache.put(key, JSON.stringify(challenge),
          Math.max(1, Math.min(ADMIN_CODE_TTL_SECONDS,
            Math.ceil((challenge.expiry - Date.now()) / 1000))));
      }
      throw new Error('Kod yanlış. Tekrar kontrol et.');
    }

    cache.remove(key);
    const token = Utilities.getUuid().replace(/-/g, '') +
      Utilities.getUuid().replace(/-/g, '');
    cache.put('baby:admin:session:' + sha256_(token),
      email, ADMIN_SESSION_TTL_SECONDS);

    return {
      ok: true,
      adminToken: token,
      adminEmail: email,
      validSeconds: ADMIN_SESSION_TTL_SECONDS
    };
  } finally {
    lock.releaseLock();
  }
}

function requireAdminSession_(token) {
  const value = String(token || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('Yönetici girişi gerekli.');
  }
  const email = CacheService.getScriptCache().get(
    'baby:admin:session:' + sha256_(value));
  if (!email) {
    throw new Error('Oturumun süresi dolmuş. E-posta ile tekrar giriş yap.');
  }
  return allowedAdminEmail_(email);
}

function logoutAdmin_(p) {
  requireAdminSession_(p.adminToken);
  CacheService.getScriptCache().remove(
    'baby:admin:session:' + sha256_(p.adminToken));
  return {ok: true, message: 'Çıkış yapıldı.'};
}


function jsonp_(callback, data) {
  const cb = /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(String(callback || ''))
    ? String(callback)
    : 'callback';

  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify(data) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function postMessage_(data) {
  const json = JSON.stringify(Object.assign({source:'baby-form-api'}, data))
    .replace(/</g, '\\u003c');
  const html = '<!doctype html><meta charset="utf-8">' +
    '<script>window.top.postMessage(' +
    json + ',' + JSON.stringify(APP.SITE_ORIGIN) + ');<\/script>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function normalize_(v) {
  return clean_(v).toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

function clean_(v) {
  return String(v == null ? '' : v).trim();
}

function upper_(v) {
  return clean_(v).toUpperCase();
}

function cleanFileName_(v) {
  return clean_(v).replace(/[^0-9A-Za-zÀ-ž._-]+/g, '_').slice(0, 120);
}

function escapeHtml_(v) {
  return clean_(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}