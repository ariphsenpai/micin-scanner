const axios = require('axios');

class TelegramNotifier {
  constructor(token, chatId) {
    this.token = token;
    this.chatId = String(chatId).trim();
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(text, options = {}) {
    try {
      const url = `${this.baseUrl}/sendMessage`;
      const payload = {
        chat_id: this.chatId,
        text: text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...options,
      };
      const res = await axios.post(url, payload);
      return res.data;
    } catch (err) {
      console.error('[Notifier] Error:', err.response?.data?.description || err.message);
    }
  }
}

module.exports = { TelegramNotifier };
