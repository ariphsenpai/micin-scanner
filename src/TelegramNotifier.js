/**
 * Telegram Notifier v5 — Output format untuk Micin Analyst Bot
 * Format: Terstruktur checklist + red/green flags + skor risiko
 */

const axios = require('axios');

class TelegramNotifier {
  constructor(token, chatId) {
    this.token = token;
    this.chatId = String(chatId).trim();
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  fmt(num) {
    if (!num) return '$0';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + num.toFixed(2);
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
      return null;
    }
  }

  // === OUTPUT FORMAT UTAMA: ANALYST REPORT ===
  buildAnalystReport(token, analysis) {
    const { chain, address, name, symbol, source, price, mcap, liquidity, buyTax, sellTax, txns24h } = token;
    const { riskScore, riskLevel, redFlags, greenFlags, summary, conclusion, inputs } = analysis;

    const chainBadge = { bsc: '🟡 BSC', ethereum: '🔵 ETH', base: '🔵 BASE', solana: '🟣 SOL' }[chain] || chain;

    let report = '';
    report += '🚨 <b>MICIN ANALYST — TOKEN REVIEW</b>\n';
    report += '────────────────────────────────────\n';
    report += `<b>INPUT:</b> ${inputs.join(', ')}\n`;
    report += `<b>Token:</b> ${this.escape(name)} (<code>${this.escape(symbol)}</code>)\n`;
    report += `${chainBadge} │ <code>${this.escape(address)}</code>\n\n`;

    // SECTION 1: Liquidity Lock
    report += '<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n';
    report += '✅ <b>LIQUIDITY LOCK</b>\n';
    if (analysis.lpLocked) {
      report += `   <b>✔️ Di-lock?</b> YES\n`;
      report += `   <b>Platform:</b> ${analysis.lpLockPlatform || 'Manual burn'}\n`;
      report += `   <b>Duration:</b> ${analysis.lpLockDuration || 'N/A'}\n`;
      report += `   <b>Locked %:</b> ${analysis.lpLockedPercent ? analysis.lpLockedPercent.toFixed(1) : 'N/A'}%\n`;
    } else {
      report += `   <b>❌ Di-lock?</b> NO / UNKNOWN\n`;
    }
    report += '\n';

    // SECTION 2: Ownership & Contract
    report += '<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n';
    report += '✅ <b>OWNERSHIP & CONTRACT</b>\n';
    report += `   <b>Ownership renounced?</b> ${analysis.ownershipRenounced ? 'YES ✅' : 'NO ❌'}\n`;
    report += `   <b>Mint/hidden func?</b> ${analysis.hasHiddenFunc ? 'YES ❌' : 'NO ✅'}\n`;
    report += `   <b>Verified?</b> ${analysis.verified ? 'YES ✅' : 'NO ❌'}\n`;
    if (analysis.hasHiddenFee) {
      report += `   <b>Hidden fee?</b> YES ❌ (${analysis.hiddenFeeDetails})\n`;
    }
    report += '\n';

    // SECTION 3: Tax & Trading Rules
    report += '<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n';
    report += '✅ <b>TAX & TRADING RULES</b>\n';
    report += `   <b>Buy tax:</b> ${buyTax || 0}%\n`;
    report += `   <b>Sell tax:</b> ${sellTax || 0}%\n`;
    report += `   <b>Tax can change?</b> ${analysis.taxCanChange ? 'YES ❌' : 'NO ✅'}\n`;
    report += '\n';

    // SECTION 4: Holder Distribution
    report += '<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n';
    report += '✅ <b>HOLDER DISTRIBUTION</b>\n';
    report += `   <b>Top 10 %:</b> ${analysis.top10Percent ? analysis.top10Percent.toFixed(1) : 'N/A'}%\n`;
    report += `   <b>Deployer holds?</b> ${analysis.deployerStillHolds ? (analysis.deployerHoldPercent ? analysis.deployerHoldPercent.toFixed(1) + '%' : 'YES') : 'NO'}\n`;
    report += `   <b>Wallet clusters?</b> ${analysis.hasWalletClusters ? 'YES ⚠️' : 'NO ✅'}\n`;
    report += '\n';

    // SECTION 5: Sniper & Bot Detection
    report += '<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n';
    report += '✅ <b>SNIPER & BOT DETECTION</b>\n';
    if (analysis.sniperAlert) {
      report += `   <b>⚠️ EARLY SNIPER ALERT!</b> (${analysis.sniperDetails})\n`;
    } else {
      report += `   <b>Sniper in block 0-2?</b> NO ✅\n`;
    }
    report += `   <b>Max TX manipulation?</b> ${analysis.maxTxManipulation ? 'YES ❌' : 'NO ✅'}\n`;
    report += `   <b>Anti-bot mechanism?</b> ${analysis.hasAntiBot ? 'YES ⚠️' : 'NO'}\n`;
    report += '\n';

    // SECTION 6: Deployer History
    report += '<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n';
    report += '✅ <b>DEPLOYER HISTORY</b>\n';
    report += `   <b>Deployer:</b> <code>${this.escape(analysis.deployerAddress || 'UNKNOWN')}</code>\n`;
    report += `   <b>History:</b> ${analysis.deployerHistory || 'N/A'}\n`;
    report += `   <b>Fresh wallet?</b> ${analysis.isFreshWallet ? 'YES ⚠️' : 'NO'}\n`;
    report += '\n';

    // SECTION 7: Social & Narrative
    report += '<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n';
    report += '✅ <b>SOCIAL & NARASI</b>\n';
    report += `   <b>Team:</b> ${analysis.teamInfo || 'ANONIM'}\n`;
    report += `   <b>Website/docs:</b> ${analysis.hasWebsite ? 'YES ✅' : 'NO ❌'}\n`;
    report += `   <b>Socials:</b> ${analysis.socials || 'N/A'}\n`;
    report += '\n';

    // SCORE & SUMMARY
    report += '<b>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</b>\n';
    report += '📊 <b>SKOR RISIKO:</b> <b>' + riskLevel + '</b> (' + riskScore + '/100)\n';

    if (greenFlags.length > 0) {
      report += '\n<b>✅ Green Flags (' + greenFlags.length + '):</b>\n';
      for (const flag of greenFlags) {
        report += '   • ' + flag + '\n';
      }
    }

    if (redFlags.length > 0) {
      report += '\n<b>❌ Red Flags (' + redFlags.length + '):</b>\n';
      for (const flag of redFlags) {
        report += '   • ' + flag + '\n';
      }
    }

    report += '\n────────────────────────────────────\n';
    report += '<b>🎯 KESIMPULAN:</b>\n';
    report += this.escape(conclusion) + '\n\n';

    report += '<b>⚠️ DISCLAIMER:</b>\n';
    report += 'Ini BUKAN rekomendasi finansial. Investasi tetap berisiko.\n';
    report += 'Lakukan DYOR lebih lanjut sebelum membeli.\n\n';

    report += '────────────────────────────────────\n';
    report += `<a href="${token.dexUrl || 'https://gmgn.ai'}">🔗 Chart (GMGN)</a>`;
    if (source === 'pumpfun') {
      report += ` │ <a href="https://pump.fun/${address}">🔗 PumpFun</a>`;
    }
    if (chain !== 'solana') {
      report += ` │ <a href="https://gopluslabs.io/token-security/${chain === 'bsc' ? 56 : chain === 'base' ? 8453 : 1}/${address}">🔗 GoPlus</a>`;
    }
    report += '\n';

    return report;
  }

  // === ALERT UTAMA: Token baru ditemukan (mode scanner only) ===
  async sendScannerAlert(token) {
    const chainBadge = { bsc: '🟡 BSC', ethereum: '🔵 ETH', base: '🔵 BASE', solana: '🟣 SOL' }[token.chain] || token.chain;
    const changeEmoji = token.priceChange24h >= 0 ? '📈' : '📉';
    const changeStr = token.priceChange24h >= 0 ? `+${token.priceChange24h.toFixed(1)}%` : `${token.priceChange24h.toFixed(1)}%`;

    let msg = '';
    msg += '🚨 <b>MICIN ALERT — NEW GEM</b>\n';
    msg += '────────────────────────\n';
    msg += `🆕 <b>${this.escape(token.name)}</b> <code>($${this.escape(token.symbol)})</code>\n`;
    msg += `${chainBadge} │ ${token.source}\n`;
    msg += `📍 <code>${token.address}</code>\n\n`;
    msg += `💰 MCap: <b>${this.fmt(token.mcap)}</b> │ 💧 Liq: <b>${this.fmt(token.liquidity)}</b>\n`;
    msg += `📊 Vol 24h: <b>${this.fmt(token.volume24h)}</b> │ ${changeEmoji} ${changeStr}\n`;
    msg += `🔊 Txns 24h: <b>${token.txns24h || 'N/A'}</b>\n\n`;
    msg += `🚀 JEPE Potential: <b>${token.jepeScore || 0}/100</b>\n\n`;
    msg += `🛡️ Safety: <b>${token.safety?.score || 0}/100</b>`;
    if (token.safety?.warnings?.length) msg += `\n⚠️ ${this.escape(token.safety.warnings.join(', '))}`;
    if (token.safety?.issues?.length) msg += `\n❌ ${this.escape(token.safety.issues.join(', '))}`;
    else msg += `\n✅ No critical issues`;
    msg += '\n\n';
    msg += `<a href="${token.dexUrl}">🔗 Chart</a>`;
    if (token.source === 'pumpfun') msg += ` │ <a href="https://pump.fun/${token.address}">🔗 PumpFun</a>`;
    msg += '\n────────────────────────';

    try {
      await this.sendMessage(msg);
      console.log(`[Scanner] ALERT SENT: ${token.symbol}`);
      return true;
    } catch (e) {
      console.error('[Scanner] Send error:', e.message);
      return false;
    }
  }
}

module.exports = { TelegramNotifier };
