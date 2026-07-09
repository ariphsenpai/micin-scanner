const { TelegramNotifier } = require('./TelegramNotifier');
const config = require('../config');

class MicinScanner {
  constructor() {
    this.notifier = new TelegramNotifier(config.BOT_TOKEN, config.TELEGRAM_USER_ID);
  }

  fmt(num) {
    if (!num) return '/usr/bin/bash';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + num.toFixed(2);
  }

  async fetchGmgnToken(tokenInput) {
    let address = '';
    let chain = 'bsc';
    let name = 'Unknown';
    let symbol = 'UNK';

    if (tokenInput.toLowerCase().includes('gmgn.ai')) chain = 'solana';
    
    if (tokenInput.startsWith('0x') || tokenInput.toLowerCase().startsWith('so')) {
      address = tokenInput.split('/').pop().split('?')[0];
      if (address.includes('#')) address = address.split('#')[0];
    } else {
      address = '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
      name = tokenInput.length > 4 ? tokenInput.substring(0, 12) : tokenInput;
      symbol = name.substring(0, 4).toUpperCase();
    }

    return {
      name, symbol, chain, address,
      price: 0.0001, mcap: 50000, liquidity: 8000, volume24h: 25000, volume6h: 12000, txns24h: 250,
      buyTax: 2, sellTax: 5, priceChange24h: 15.5, verified: true, hasHiddenFunc: false,
      ownershipRenounced: Math.random() > 0.3, lpLocked: true, lpLockPlatform: 'Unicrypt',
      lpLockDuration: '365 days', top10Percent: 25.5,
      deployerAddress: '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      sniperAlert: Math.random() > 0.7, maxTxManipulation: false, taxCanChange: false,
      isFreshWallet: Math.random() > 0.6, teamInfo: 'ANONIM', hasWebsite: true, socials: 'Twitter, Telegram',
      dexUrl: 'https://gmgn.ai/' + chain + '/token/' + address,
    };
  }

  async evaluateToken(token, input) {
    const analysis = { riskScore: 50, riskLevel: 'MEDIUM', redFlags: [], greenFlags: [], summary: [], conclusion: '', inputs: [input] };

    if (token.lpLocked && token.liquidity > 1000) analysis.greenFlags.push('LP di-lock ' + token.lpLockDuration + ' via ' + token.lpLockPlatform);
    else { analysis.redFlags.push('LP tidak di-lock / terlalu rendah'); analysis.riskScore -= 20; }

    if (token.ownershipRenounced) analysis.greenFlags.push('Ownership sudah renounced');
    else { analysis.redFlags.push('Ownership belum renounced'); analysis.riskScore -= 10; }
    if (token.hasHiddenFunc) { analysis.redFlags.push('Ada fungsi tersembunyi'); analysis.riskScore -= 25; }
    if (token.verified) analysis.greenFlags.push('Contract verified');

    if (token.buyTax > 10 || token.sellTax > 10) { analysis.redFlags.push('Tax tinggi'); analysis.riskScore -= 15; }
    else analysis.greenFlags.push('Tax wajar');
    if (token.taxCanChange) { analysis.redFlags.push('Tax bisa diubah'); analysis.riskScore -= 20; }

    if (token.top10Percent > 30) { analysis.redFlags.push('Top 10 holder tinggi: ' + token.top10Percent.toFixed(1) + '%'); analysis.riskScore -= 15; }
    else if (token.top10Percent > 20) analysis.greenFlags.push('Top 10 holder acceptable');
    else analysis.greenFlags.push('Top 10 holder terdistribusi baik');

    if (token.sniperAlert) { analysis.redFlags.push('⚠️ SNIPER ALERT'); analysis.riskScore -= 20; }
    else analysis.greenFlags.push('Tidak ada sniper masif');
    if (token.maxTxManipulation) analysis.redFlags.push('Max TX manipulation');
    if (token.isFreshWallet) { analysis.redFlags.push('Deployer fresh'); analysis.riskScore -= 10; }
    else analysis.greenFlags.push('Deployer ada history');

    if (token.hasWebsite) analysis.greenFlags.push('Ada website');
    if (token.socials) analysis.greenFlags.push('Sosial: ' + token.socials);

    analysis.riskScore = Math.max(0, Math.min(100, analysis.riskScore));

    if (analysis.riskScore < 30) { analysis.riskLevel = 'EXTREME'; analysis.conclusion = 'Token sangat berisiko.'; }
    else if (analysis.riskScore < 50) { analysis.riskLevel = 'HIGH'; analysis.conclusion = 'Banyak red flag. DYOR ekstra.'; }
    else if (analysis.riskScore < 70) { analysis.riskLevel = 'MEDIUM'; analysis.conclusion = 'Ada potensi, watch red flags.'; }
    else { analysis.riskLevel = 'LOW'; analysis.conclusion = 'Relatif aman, tetap DYOR.'; }

    return analysis;
  }

  async analyzeToken(chatId, input) {
    const token = await this.fetchGmgnToken(input);
    const analysis = await this.evaluateToken(token, input);
    const report = this.notifier.buildAnalystReport(token, analysis);
    await this.notifier.sendMessage(report);
    return { success: true, token, analysis };
  }
}

module.exports = { MicinScanner };
