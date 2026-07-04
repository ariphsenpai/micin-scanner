# Setup Bot Telegram untuk MiMicinScanner

## 1. Buat Bot Baru di Telegram

1. Buka Telegram dan cari bot **@BotFather**
2. Kirim command: `/newbot`
3. Ikuti instruksi:
   - Masukkan nama bot (contoh: "MiMicin Alert")
   - Masukkan username bot (harus diakhiri "bot", contoh: "micinalert_bot")
4. BotFather akan kirim **HTTP API Token** (contoh: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. **Simpan token ini dengan aman!** Jangan share ke siapapun.

## 2. Setup Bot untuk Kirim DM

1. Buka bot yang baru dibuat (klik link dari BotFather)
2. Kirim `/start` ke bot
3. **PENTING**: Copy chat ID Anda. Cara cek chat ID:
   - Buka: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Ganti `<TOKEN>` dengan token bot Anda
   - Cari field `"chat":{"id":123456789` - itulah chat ID Anda

## 3. Konfigurasi Scanner

Edit file `.env` atau passing via environment variable:

```bash
export BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
export TELEGRAM_USER_ID="5375775335"  # Chat ID Kakak
```

Atau edit di awal file `scanner.js`:

```javascript
const CONFIG = {
  BOT_TOKEN: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
  TELEGRAM_USER_ID: '5375775335',
  // ... rest of config
};
```

## 4. Jalankan Scanner

```bash
cd /root/.openclaw/workspace/micin-scanner
npm install  # Install dependencies

# Run sekali untuk test
BOT_TOKEN=*** TELEGRAM卢比 TELEGRAM_USER_ID=5375775335 node scanner.js --once

# Run continuous (background)
BOT_TOKEN=*** TELEGRAM_USER_ID=5375775335 node scanner.js
```

## 5. Jalankan dengan PM2 (untuk production)

```bash
npm install -g pm2

pm2 start scanner.js --name "micin-scanner" --env BOT_TOKEN="***" --env TELEGRAM_USER_ID="5375775335"

# Save config
pm2 save
pm2 startup
```

---

**⚠️ PENTING: Jangan pernah share BOT_TOKEN ke siapapun!**
