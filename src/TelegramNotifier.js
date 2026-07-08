const axios = require('axios');

class TelegramNotifier {
  constructor(token, chatId) {
    this.token = token;
    this.chatId = String(chatId).trim();
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  escape(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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

  // === OUTPUT FORMAT: 7-POINT CHECKLIST (Micin Analyst) ===
  buildChecklistReport(token, cl) {
    const c = cl.checklist;
    const chainBadge = { bsc: '🟡 BSC', ethereum: '🔵 ETH', base: '🔵 BASE', solana: '🟣 SOL' }[token.chain] || token.chain;
    const gmgnUrl = `https://gmgn.ai/${token.chain === 'solana' ? 'sol' : token.chain}/token/${token.address}`;

    let r = '';
    if (c.sniperAlert) {
      r += '⚠️ <b>SNIPER / FLASH PATTERN TERDETEKSI</b>\n';
      r += `   ${this.escape(c.sniperDetails || '')}\n`;
      r += '────────────────────────────────────\n';
    }
    r += '🚨 <b>MICIN ALERT — ON-CHAIN SCREENING</b>\n';
    r += '────────────────────────────────────\n';
    r += `<b>${this.escape(token.name)}</b> <code>(${this.escape(token.symbol)})</code>\n`;
    r += `${chainBadge} │ <code>${this.escape(token.address)}</code>\n`;
    r += `<a href="${gmgnUrl}">🔗 Chart (GMGN)</a>\n\n`;

    r += '✅ <b>1. LIQUIDITY LOCK</b>\n';
    r += `   Di-lock: ${c.lpLocked === true ? 'YES ✅' : c.lpLocked === false ? 'NO ❌' : 'TIDAK TERVERIFIKASI ⚠️'}\n`;
    r += `   Platform: ${this.escape(c.lpLockPlatform || 'N/A')} │ Durasi: ${this.escape(c.lpLockDuration || 'N/A')}\n`;
    r += `   Locked %: ${c.lpLockedPercent != null ? c.lpLockedPercent.toFixed(1) + '%' : 'N/A'}\n\n`;

    r += '✅ <b>2. OWNERSHIP & CONTRACT</b>\n';
    r += `   Renounced: ${c.ownershipRenounced === true ? 'YES ✅' : c.ownershipRenounced === false ? 'NO ❌' : 'TIDAK TERVERIFIKASI ⚠️'}\n`;
    r += `   Mint/hidden func: ${c.hasHiddenFunc ? 'YES ❌' : 'NO ✅'}\n`;
    r += `   Verified: ${c.verified === true ? 'YES ✅' : c.verified === false ? 'NO ❌' : 'N/A'}\n\n`;

    r += '✅ <b>3. TAX & TRADING</b>\n';
    r += `   Buy: ${c.buyTax}% │ Sell: ${c.sellTax}%\n`;
    r += `   Tax bisa diubah: ${c.taxCanChange === false ? 'NO ✅' : c.taxCanChange === true ? 'YES ❌' : 'N/A'}\n\n`;

    r += '✅ <b>4. HOLDER DISTRIBUTION</b>\n';
    r += `   Top 10: ${c.top10Percent != null ? c.top10Percent.toFixed(1) + '%' : 'N/A'}\n`;
    r += `   Deployer holds: ${c.deployerStillHolds ? (c.deployerHoldPercent ? c.deployerHoldPercent.toFixed(1) + '%' : 'YES') : 'NO'}\n`;
    r += `   Wallet cluster: ${c.hasWalletClusters ? 'YES ⚠️' : 'NO ✅'}\n\n`;

    r += '✅ <b>5. SNIPER & BOT</b>\n';
    r += `   Sniper block 0-2: ${c.sniperAlert ? 'YES ❌' : 'NO ✅'}\n`;
    r += `   Max TX manip: ${c.maxTxManipulation ? 'YES ❌' : 'NO ✅'}\n`;
    r += `   Anti-bot: ${c.hasAntiBot ? 'YES' : 'NO'}\n\n`;

    r += '✅ <b>6. DEPLOYER HISTORY</b>\n';
    r += `   Wallet: <code>${this.escape(c.deployerAddress || 'UNKNOWN')}</code>\n`;
    r += `   History: ${this.escape(c.deployerHistory || 'N/A')}\n`;
    r += `   Fresh wallet: ${c.isFreshWallet === true ? 'YES ⚠️' : c.isFreshWallet === false ? 'NO' : 'N/A'}\n\n`;

    r += '✅ <b>7. SOCIAL & NARASI</b>\n';
    r += `   Team: ${this.escape(c.teamInfo || 'ANONIM')}\n`;
    r += `   Website: ${c.hasWebsite ? 'YES ✅' : 'NO ❌'}\n`;
    r += `   Socials: ${this.escape(c.socials || 'N/A')}\n\n`;

    r += '━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    r += `📊 <b>SKOR RISIKO: ${cl.riskLevel}</b> (${cl.riskScore}/100)\n`;
    if (cl.greenFlags.length) {
      r += '\n✅ <b>Green Flags:</b>\n';
      for (const f of cl.greenFlags) r += `   • ${this.escape(f)}\n`;
    }
    if (cl.redFlags.length) {
      r += '\n❌ <b>Red Flags:</b>\n';
      for (const f of cl.redFlags) r += `   • ${this.escape(f)}\n`;
    }
    r += '\n────────────────────────────────────\n';
    r += `🎯 <b>KESIMPULAN:</b> ${this.escape(cl.conclusion)}\n\n`;
    r += '⚠️ <b>DISCLAIMER:</b> Bukan rekomendasi finansial. Data objektif saja. Selalu DYOR & waspadai rug pull.\n';
    return r;
  }
}

module.exports = { TelegramNotifier };
