const axios = require('axios');
const { TelegramNotifier } = require('./TelegramNotifier');
const config = require('../config');

class MicinScannerV2 {
  constructor() {
    this.notifier = new TelegramNotifier(config.BOT_TOKEN, config.TELEGRAM_USER_ID);
    this.seenTokens = new Set();
    this.lastAlerts = new Map();
  }

  /**
   * Parse DexScreener pair data
   */
  parsePair(pair) {
    if (!pair) return null;
    
    return {
      name: pair.baseToken.name || 'Unknown',
      symbol: pair.baseToken.symbol || 'UNK',
      chain: pair.chainId.toLowerCase(),
      address: pair.baseToken.address,
      price: parseFloat(pair.priceUsd) || 0,
      mcap: pair.marketCap || 0,
      liquidity: pair.liquidity?.usd || 0,
      volume24h: pair.volume?.h24 || 0,
      volume6h: pair.volume?.h6 || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      txns24h: pair.txns?.h24?.buys + pair.txns?.h24?.sells || 0,
      buyTax: 0,
      sellTax: 0,
      verified: true,
      hasHiddenFunc: false,
      hasHiddenFee: false,
      ownershipRenounced: 'unknown',
      lpLocked: 'unknown',
      lpLockPlatform: 'Unknown',
      lpLockDuration: 'Unknown',
      lpLockedPercent: 0,
      top10Percent: 0,
      deployerAddress: pair.baseToken.address,
      deployerStillHolds: false,
      deployerHoldPercent: 0,
      hasWalletClusters: false,
      sniperAlert: false,
      sniperDetails: '',
      maxTxManipulation: false,
      taxCanChange: false,
      hasAntiBot: false,
      isFreshWallet: false,
      deployerHistory: 'N/A',
      teamInfo: 'ANONIM',
      hasWebsite: false,
      socials: 'N/A',
      dexUrl: pair.url || `https://dexscreener.com/${pair.chainId}/${pair.baseToken.address}`,
      source: 'dexscreener-auto',
      createdAt: Date.now(),
    };
  }

  /**
   * Evaluate token berdasarkan data yang ada
   */
  evaluateToken(token) {
    const analysis = {
      riskScore: 100, // Mulai dari 100 (LOW risk default)
      riskLevel: 'LOW',
      redFlags: [],
      greenFlags: [],
      conclusion: '',
    };

    // === 1. LIQUIDITY LOCK ===
    if (token.lpLocked === 'unknown') {
      analysis.redFlags.push('🔒 LP Lock: TIDAK BISA VERIFIKASI (butuh gmgn.ai/API key)');
      analysis.riskScore -= 30;
    } else if (token.lpLocked === true) {
      analysis.greenFlags.push(`✅ LP di-lock ${token.lpLockDuration} via ${token.lpLockPlatform}`);
    } else {
      analysis.redFlags.push('❌ LP TIDAK di-lock');
      analysis.riskScore -= 40;
    }

    // === 2. OWNERSHIP & CONTRACT ===
    if (token.ownershipRenounced === 'unknown') {
      analysis.redFlags.push('👤 Ownership: TIDAK BISA VERIFIKASI');
      analysis.riskScore -= 20;
    } else if (token.ownershipRenounced === true) {
      analysis.greenFlags.push('✅ Ownership renounced');
    } else {
      analysis.redFlags.push('❌ Ownership BELUM renounced');
      analysis.riskScore -= 25;
    }

    if (token.hasHiddenFunc) {
      analysis.redFlags.push('⚠️ Ada fungsi tersembunyi (mint/blacklist/pause)');
      analysis.riskScore -= 35;
    }

    if (token.hasHiddenFee) {
      analysis.redFlags.push(`⚠️ Hidden fee: ${token.hiddenFeeDetails || 'detected'}`);
      analysis.riskScore -= 30;
    }

    if (token.verified) {
      analysis.greenFlags.push('✅ Contract verified');
    } else {
      analysis.redFlags.push('⚠️ Contract BELUM verified');
      analysis.riskScore -= 10;
    }

    if (token.maxTxManipulation) {
      analysis.redFlags.push('⚠️ Max TX manipulation detected');
      analysis.riskScore -= 25;
    }

    // === 3. TAX & TRADING ===
    if (token.buyTax > 10 || token.sellTax > 10) {
      analysis.redFlags.push(`⚠️ Tax tinggi: Buy ${token.buyTax}% / Sell ${token.sellTax}%`);
      analysis.riskScore -= 15;
    } else if (token.buyTax > 0 || token.sellTax > 0) {
      analysis.greenFlags.push(`✅ Tax wajar: Buy ${token.buyTax}% / Sell ${token.sellTax}%`);
    } else {
      analysis.redFlags.push('💰 Tax: TIDAK BISA VERIFIKASI');
      analysis.riskScore -= 10;
    }

    if (token.taxCanChange) {
      analysis.redFlags.push('⚠️ Tax BISA diubah owner kapan saja');
      analysis.riskScore -= 20;
    }

    // === 4. HOLDER DISTRIBUTION ===
    if (token.top10Percent > 0) {
      if (token.top10Percent > 50) {
        analysis.redFlags.push(`⚠️ Top 10 holder: ${token.top10Percent.toFixed(1)}% (sangat konsentrasi)`);
        analysis.riskScore -= 20;
      } else if (token.top10Percent > 30) {
        analysis.redFlags.push(`⚠️ Top 10 holder: ${token.top10Percent.toFixed(1)}% (cukup konsentrasi)`);
        analysis.riskScore -= 10;
      } else {
        analysis.greenFlags.push(`✅ Distribusi holder bagus: Top 10 ${token.top10Percent.toFixed(1)}%`);
      }
    } else {
      analysis.redFlags.push('📊 Holder distribution: TIDAK BISA VERIFIKASI');
      analysis.riskScore -= 15;
    }

    if (token.hasWalletClusters) {
      analysis.redFlags.push('⚠️ Wallet cluster terdeteksi (indikasi tim/insider)');
      analysis.riskScore -= 15;
    }

    // === 5. SNIPER & BOT DETECTION ===
    if (token.sniperAlert) {
      analysis.redFlags.push(`🔫 SNIPER ALERT: ${token.sniperDetails || 'Sniper terdeteksi di block awal'}`);
      analysis.riskScore -= 25;
    } else {
      analysis.greenFlags.push('✅ Tidak ada sniper masif di block awal');
    }

    if (token.maxTxManipulation) {
      analysis.redFlags.push('⚠️ Max TX manipulation possible');
    }

    if (token.hasAntiBot) {
      analysis.greenFlags.push('✅ Anti-bot mechanism aktif');
    }

    // === 6. DEPLOYER HISTORY ===
    if (token.isFreshWallet) {
      analysis.redFlags.push('⚠️ Deployer wallet FRESH (no history)');
      analysis.riskScore -= 15;
    } else {
      analysis.greenFlags.push('✅ Deployer punya history');
    }

    // === 7. SOSIAL & NARASI ===
    if (token.hasWebsite) {
      analysis.greenFlags.push('✅ Ada website/docs');
    } else {
      analysis.redFlags.push('⚠️ Tidak ada website/docs');
      analysis.riskScore -= 5;
    }

    if (token.socials && token.socials !== 'N/A') {
      analysis.greenFlags.push(`✅ Sosial aktif: ${token.socials}`);
    } else {
      analysis.redFlags.push('⚠️ Sosial tidak ditemukan');
      analysis.riskScore -= 5;
    }

    // === FINAL CALCULATION ===
    analysis.riskScore = Math.max(0, Math.min(100, analysis.riskScore));

    if (analysis.riskScore >= 75) {
      analysis.riskLevel = 'LOW';
      analysis.conclusion = 'Relatif aman (berdasarkan data tersedia). Tetap DYOR.';
    } else if (analysis.riskScore >= 50) {
      analysis.riskLevel = 'MEDIUM';
      analysis.conclusion = 'Ada potensi tapi ada red flags. Pantau lebih lanjut.';
    } else if (analysis.riskScore >= 25) {
      analysis.riskLevel = 'HIGH';
      analysis.conclusion = 'Banyak red flags. DYOR ekstra sebelum consider.';
    } else {
      analysis.riskLevel = 'EXTREME';
      analysis.conclusion = 'Sangat berisiko. Kemungkinan rug pull / scam.';
    }

    // Jika ada sniper alert, tingkatkan level
    if (token.sniperAlert && analysis.riskLevel !== 'EXTREME') {
      analysis.riskLevel = 'EXTREME';
      analysis.conclusion = '🔫 SNIPER MASSIF! Indikasi rug pull / pump & dump.';
      analysis.redFlags.unshift('🔴 SNIPER MASSIF DI BLOCK AWAL');
    }

    // Jika LP tidak terkunci, otomatis HIGH ke atas
    if (token.lpLocked === false || token.lpLocked === 'unknown') {
      if (analysis.riskLevel === 'LOW') analysis.riskLevel = 'HIGH';
    }

    return analysis;
  }

  /**
   * Format currency
   */
  fmt(num) {
    if (!num) return '$0';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + num.toFixed(2);
  }

  /**
   * Send alert to Telegram (menggunakan format baru)
   */
  async sendAlert(token, analysis) {
    const { chain, address, name, symbol, price, mcap, liquidity, buyTax, sellTax, volume24h, priceChange24h } = token;
    const { riskScore, riskLevel, redFlags, greenFlags, conclusion } = analysis;
    
    const emoji = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', EXTREME: '🔴' }[riskLevel] || '⚪';
    
    let msg = '';
    msg += `${emoji} <b>MICIN ALERT — NEW SCAN</b>\n`;
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += `<b>Token:</b> ${name} (<code>${symbol}</code>)\n`;
    msg += `<b>Chain:</b> ${chain.toUpperCase()} │ <code>${address}</code>\n\n`;
    msg += `<b>💰 Price:</b> $${price?.toFixed(8) || 'N/A'} │ <b>MCap:</b> ${this.fmt(mcap)} │ <b>Liq:</b> ${this.fmt(liquidity)}\n`;
    msg += `<b>📊 Vol 24h:</b> ${this.fmt(volume24h)} │ <b>Change:</b> ${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(1)}%\n\n`;
    
    // SNIPER ALERT DI ATAS
    if (token.sniperAlert) {
      msg += '🔴 <b>⚠️ SNIPER MASSIF DI BLOCK AWAL!</b>\n';
      msg += `   ${token.sniperDetails || 'Detected sniper bot di transaksi pertama'}\n\n`;
    }
    
    // SECTION 1: Liquidity Lock
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '🔒 <b>LIQUIDITY LOCK</b>\n';
    if (token.lpLocked === true) {
      msg += `   ✔️ <b>Di-lock?</b> YES\n`;
      msg += `   📍 Platform: ${token.lpLockPlatform}\n`;
      msg += `   ⏱️ Duration: ${token.lpLockDuration || 'N/A'}\n`;
      msg += `   📊 Locked: ${token.lpLockedPercent ? token.lpLockedPercent.toFixed(1) : 'N/A'}%\n`;
    } else if (token.lpLocked === 'unknown') {
      msg += `   ❌ <b>Di-lock?</b> UNKNOWN\n`;
      msg += `   ⚠️ TIDAK BISA VERIFIKASI (gmgn.ai blocked)\n`;
    } else {
      msg += `   ❌ <b>Di-lock?</b> NO\n`;
    }
    msg += '\n';
    
    // SECTION 2: Ownership & Contract
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '👤 <b>OWNERSHIP & CONTRACT</b>\n';
    msg += `   📋 Ownership renounced? ${token.ownershipRenounced === true ? 'YES ✅' : token.ownershipRenounced === 'unknown' ? 'UNKNOWN ⚠️' : 'NO ❌'}\n`;
    msg += `   🔧 Hidden func/mint/blacklist? ${token.hasHiddenFunc ? 'YES ❌' : 'NO ✅'}\n`;
    msg += `   ✔️ Contract verified? ${token.verified ? 'YES' : 'NO ❌'}\n`;
    msg += `   💰 Hidden fee? ${token.hasHiddenFee ? 'YES ❌' : 'NO ✅'}\n';
    msg += `   ⚡ Max TX manipulation? ${token.maxTxManipulation ? 'YES ❌' : 'NO ✅'}\n`;
    msg += '\n';
    
    // SECTION 3: Tax
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '💰 <b>TAX & TRADING RULES</b>\n';
    if (buyTax > 0 || sellTax > 0) {
      msg += `   📊 Buy tax: ${buyTax}% │ Sell tax: ${sellTax}%\n`;
      msg += `   🔄 Tax bisa diubah owner? ${token.taxCanChange ? 'YES ❌' : 'NO ✅'}\n`;
    } else {
      msg += `   ❓ Tax: TIDAK BISA VERIFIKASI\n`;
    }
    msg += '\n';
    
    // SECTION 4: Holder
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '📊 <b>HOLDER DISTRIBUTION</b>\n';
    if (token.top10Percent > 0) {
      msg += `   📈 Top 10 holder: ${token.top10Percent.toFixed(1)}%\n`;
      msg += `   👛 Deployer masih hold? ${token.deployerStillHolds ? (token.deployerHoldPercent ? token.deployerHoldPercent.toFixed(1) + '%' : 'YES') : 'NO'}\n`;
      msg += `   🔗 Wallet clusters? ${token.hasWalletClusters ? 'YES ⚠️' : 'NO ✅'}\n`;
    } else {
      msg += `   ❓ Data: TIDAK BISA VERIFIKASI\n`;
    }
    msg += '\n';
    
    // SECTION 5: Deployer
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '👷 <b>DEPLOYER HISTORY</b>\n';
    msg += `   📍 Address: <code>${address}</code>\n`;
    msg += `   📜 History: ${token.deployerHistory}\n`;
    msg += `   🆕 Fresh wallet? ${token.isFreshWallet ? 'YES ⚠️' : 'NO ✅'}\n`;
    msg += '\n';
    
    // SECTION 6: Sosial
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '🌐 <b>SOCIAL & NARRASI</b>\n';
    msg += `   👥 Team: ${token.teamInfo || 'ANONIM'}\n`;
    msg += `   🌍 Website/docs: ${token.hasWebsite ? 'YES' : 'NO ❌'}\n`;
    msg += `   📢 Sosial: ${token.socials || 'N/A'}\n\n`;
    
    // SCORE
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += `${emoji} <b>SKOR RISIKO: ${riskLevel}</b> (${riskScore}/100)\n\n`;
    
    if (greenFlags.length > 0) {
      msg += '✅ <b>Green Flags:</b>\n';
      for (const flag of greenFlags) {
        msg += `   • ${flag}\n`;
      }
      msg += '\n';
    }
    
    if (redFlags.length > 0) {
      msg += '❌ <b>Red Flags:</b>\n';
      for (const flag of redFlags) {
        msg += `   • ${flag}\n`;
      }
      msg += '\n';
    }
    
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '<b>🎯 KESIMPULAN:</b>\n';
    msg += `${conclusion}\n\n`;
    msg += '<b>⚠️ DISCLAIMER:</b>\n';
    msg += 'Ini BUKAN rekomendasi finansial. Investasi tetap berisiko.\n';
    msg += 'Hanya data analitis objektif. DYOR sebelum action!\n\n';
    msg += `🔗 <a href="${token.dexUrl}">Lihat Chart</a>`;
    if (chain === 'solana') {
      msg += ` │ <a href="https://pump.fun/${address}">PumpFun</a>`;
    }
    msg += '\n';
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━';

    try {
      await this.notifier.sendMessage(msg);
      return true;
    } catch (err) {
      console.error('[MicinScanner] Send error:', err.message);
      return false;
    }
  }
}

module.exports = { MicinScannerV2 };
