/**
 * ChecklistAnalyzer v1 — 7-point on-chain screening (Micin Analyst checklist)
 * Sumber data: GoPlus (EVM) / RugCheck (Solana) + DexScreener holder.
 * GMGN unusable dari VPS (403) -> GMGN hanya jadi link chart.
 * Aturan ketat dari prompt user diterapkan:
 *  - data LP lock/ownership gak terverifikasi -> otomatis HIGH RISK
 *  - pola sniper masif di block awal -> warning eksplisit di atas output
 *  - tidak ada rekomendasi finansial, hanya data objektif
 */
const axios = require('axios');

class ChecklistAnalyzer {
  constructor() {
    this.chainIdMap = { bsc: 56, ethereum: 1, base: 8453 };
    this.gmgnChain = { bsc: 'bsc', ethereum: 'eth', base: 'base', solana: 'sol' };
  }

  fmtPct(n) { return n == null ? 'N/A' : n.toFixed(1) + '%'; }

  async goPlus(address, chain) {
    const cid = this.chainIdMap[chain];
    if (!cid) return null;
    try {
      const r = await axios.get(`https://api.gopluslabs.io/api/v1/token_security/${cid}?contract_addresses=${address}`, { headers: { Accept: 'application/json' }, timeout: 12000 });
      return r.data?.result?.[address.toLowerCase()] || null;
    } catch (e) { return null; }
  }

  async rugCheck(address) {
    try {
      const r = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${address}/report`, { headers: { Accept: 'application/json' }, timeout: 12000 });
      return r.data || null;
    } catch (e) { return null; }
  }

  async holders(address, chain) {
    const c = { bsc: 'binance', ethereum: 'ethereum', base: 'base' }[chain];
    if (!c) return null;
    try {
      const r = await axios.get(`https://tokensniffer.com/api/v2/tokens/${c}/${address}`, { headers: { Accept: 'application/json' }, timeout: 12000 });
      return r.data || null;
    } catch (e) { return null; }
  }

  // Main: build 7-point checklist from real on-chain data
  async analyze(token) {
    const { address, chain, name, symbol } = token;
    const a = {
      lpLocked: null, lpLockPlatform: 'N/A', lpLockDuration: 'N/A', lpLockedPercent: null,
      ownershipRenounced: null, hasHiddenFunc: false, verified: null, hasHiddenFee: false, hiddenFeeDetails: '',
      buyTax: token.buyTax ?? 0, sellTax: token.sellTax ?? 0, taxCanChange: null,
      top10Percent: null, deployerStillHolds: null, deployerHoldPercent: null, hasWalletClusters: null,
      sniperAlert: false, sniperDetails: '', maxTxManipulation: null, hasAntiBot: null,
      deployerAddress: 'UNKNOWN', deployerHistory: 'N/A', isFreshWallet: null,
      teamInfo: 'ANONIM', hasWebsite: null, socials: 'N/A',
    };

    let gp = null, rc = null;
    if (chain === 'solana') rc = await this.rugCheck(address);
    else gp = await this.goPlus(address, chain);

    // ---- RugCheck (Solana) ----
    if (rc) {
      a.ownershipRenounced = !rc.mintAuthority && !rc.freezeAuthority;
      a.hasHiddenFunc = false;
      a.verified = null;
      if (rc.lpTokens?.length) {
        const burned = rc.lpTokens.filter(l => l.burned).length;
        a.lpLocked = burned === rc.lpTokens.length && burned > 0;
        a.lpLockedPercent = rc.lpTokens.length ? (burned / rc.lpTokens.length) * 100 : null;
        a.lpLockPlatform = 'Burned / Locked';
      }
      if (rc.topHolders?.length) a.top10Percent = rc.topHolders.slice(0, 10).reduce((s, h) => s + (h.pct || 0), 0);
    }

    // ---- GoPlus (EVM) ----
    if (gp) {
      a.isHoneypot = gp.is_honeypot === '1';
      a.hasHiddenFunc = gp.is_mintable === '1';
      a.ownershipRenounced = gp.can_take_back_ownership === '0' && gp.hidden_owner !== '1';
      a.verified = gp.is_open_source === '1';
      a.buyTax = parseFloat(gp.buy_tax || 0);
      a.sellTax = parseFloat(gp.sell_tax || 0);
      a.taxCanChange = null;
      a.top10Percent = gp.top_holder_pct ? parseFloat(gp.top_holder_pct) : null;
      a.hasHiddenFee = gp.hidden_owner === '1';
      // GoPlus gak expose LP lock secara langsung -> tandai unverified
      a.lpLocked = null;
    }

    // ---- Aturan ketat: data LP/ownership gak terverifikasi -> HIGH RISK flag ----
    const unverified = (a.lpLocked === null) || (a.ownershipRenounced === null);
    if (unverified) a._forceHighRisk = true;

    // ---- Sniper heuristic (dari token volume/tx pattern) ----
    const vol = token.volume24h || 0, liq = token.liquidity || 0, txns = token.txns24h || 0, chg = token.priceChange24h || 0;
    if (vol > 0 && liq > 0 && vol / liq > 20 && txns < 50) {
      a.sniperAlert = true;
      a.sniperDetails = `Vol/Liq ${ (vol/liq).toFixed(0) }x + tx rendah (${txns})`;
    }

    // ---- Score ----
    let score = 70;
    const red = [], green = [];

    if (a.lpLocked === true) green.push(`LP di-lock (${a.lpLockPlatform})`);
    else if (a.lpLocked === false) { red.push('LP tidak di-lock'); score -= 20; }
    else { red.push('LP lock TIDAK terverifikasi'); score -= 15; }

    if (a.ownershipRenounced === true) green.push('Ownership renounced');
    else if (a.ownershipRenounced === false) { red.push('Ownership belum renounced'); score -= 10; }
    else { red.push('Ownership TIDAK terverifikasi'); score -= 8; }

    if (a.hasHiddenFunc) { red.push('Mintable / fungsi tersembunyi'); score -= 25; }
    if (a.verified === true) green.push('Contract verified');
    else if (a.verified === false) red.push('Contract unverified');

    if (a.buyTax > 10 || a.sellTax > 10) { red.push(`Tax tinggi (B${a.buyTax}%/S${a.sellTax}%)`); score -= 15; }
    else if (a.buyTax > 0 || a.sellTax > 0) green.push('Tax wajar');

    if (a.top10Percent != null) {
      if (a.top10Percent > 30) { red.push(`Top 10 holder tinggi: ${a.top10Percent.toFixed(1)}%`); score -= 15; }
      else if (a.top10Percent > 20) green.push('Top 10 holder acceptable');
      else green.push('Holder terdistribusi baik');
    }

    if (a.sniperAlert) { red.push('⚠️ SNIPER/flash pattern terdeteksi'); score -= 20; }
    if (a.isFreshWallet) { red.push('Deployer fresh wallet'); score -= 10; }
    else if (a.isFreshWallet === false) green.push('Deployer ada history');

    if (a._forceHighRisk) { score -= 20; red.push('Data LP/ownership gak diverifikasi → auto HIGH RISK'); }

    score = Math.max(0, Math.min(100, score));

    let level = 'LOW';
    if (score < 30) level = 'EXTREME';
    else if (score < 50) level = 'HIGH';
    else if (score < 70) level = 'MEDIUM';

    // honeypot = instant extreme
    if (gp?.is_honeypot === '1') { level = 'EXTREME'; red.unshift('HONEYPOT terdeteksi'); }

    let conclusion = 'Aman untuk dipantau.';
    if (level === 'EXTREME') conclusion = 'HINDARI — risiko rug pull sangat tinggi.';
    else if (level === 'HIGH') conclusion = 'Banyak red flag. DYOR ekstra sebelum masuk.';
    else if (level === 'MEDIUM') conclusion = 'Ada potensi, tapi awasi red flags.';

    return {
      checklist: a,
      riskScore: score,
      riskLevel: level,
      redFlags: red,
      greenFlags: green,
      conclusion,
    };
  }
}

module.exports = { ChecklistAnalyzer };
