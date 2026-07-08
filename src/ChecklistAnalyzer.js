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
const config = require('../config');

class ChecklistAnalyzer {
  constructor() {
    this.chainIdMap = { bsc: 56, ethereum: 1, base: 8453 };
    this.gmgnChain = { bsc: 'bsc', ethereum: 'eth', base: 'base', solana: 'sol' };
    // Proxy support (isi di config.js kalau punya VPS/residential proxy)
    this.proxy = config.PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || null;
    this.axiosOpts = this.proxy ? { proxy: this._parseProxy(this.proxy) } : {};
    this.RUGCHECK_RETRIES = 3;
    this.RUGCHECK_BACKOFF = 1500;
  }

  _parseProxy(p) {
    // support http://host:port / http://user:pass@host:port
    try {
      const u = new URL(p);
      return { protocol: u.protocol.replace(':', ''), host: u.hostname, port: parseInt(u.port), username: u.username || undefined, password: u.password || undefined };
    } catch (e) { return null; }
  }

  async _get(url, timeout = 12000) {
    for (let i = 0; i < this.RUGCHECK_RETRIES; i++) {
      try {
        const r = await axios.get(url, { headers: { Accept: 'application/json' }, timeout, ...this.axiosOpts });
        return r;
      } catch (e) {
        if (i < this.RUGCHECK_RETRIES - 1) {
          await new Promise(res => setTimeout(res, this.RUGCHECK_BACKOFF * (i + 1)));
          continue;
        }
        return null;
      }
    }
    return null;
  }

  async goPlus(address, chain) {
    const cid = this.chainIdMap[chain];
    if (!cid) return null;
    const r = await this._get(`https://api.gopluslabs.io/api/v1/token_security/${cid}?contract_addresses=${address}`);
    return r?.data?.result?.[address.toLowerCase()] || null;
  }

  async rugCheck(address) {
    const r = await this._get(`https://api.rugcheck.xyz/v1/tokens/${address}/report`);
    return r?.data || null;
  }

  async holders(address, chain) {
    const c = { bsc: 'binance', ethereum: 'ethereum', base: 'base' }[chain];
    if (!c) return null;
    const r = await this._get(`https://tokensniffer.com/api/v2/tokens/${c}/${address}`);
    return r?.data || null;
  }

  // GMGN via proxy (kalau di-set) — fallback kalau RugCheck null
  async gmgnInfo(address, chain) {
    if (!this.proxy) return null;
    const rc = this.gmgnChain[chain] || chain;
    const r = await this._get(`https://gmgn.ai/api/v1/tokens/coin_info?chain=${rc}&token_address=${address}`);
    return r?.data || null;
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
    if (chain === 'solana') {
      rc = await this.rugCheck(address);
      // Fallback: GMGN via proxy kalau RugCheck null (proxy di-set)
      if (!rc) {
        const gm = await this.gmgnInfo(address, chain);
        if (gm?.data) {
          rc = gm.data; // gmgn coin_info shape: { mint, creator, ... } — map minimal
          rc._fromGmgn = true;
        }
      }
    }
    else gp = await this.goPlus(address, chain);

    // ---- RugCheck (Solana) ----
    if (rc && !rc._fromGmgn) {
      // Ownership: mint/freeze authority harus null (renounced)
      a.ownershipRenounced = !rc.mintAuthority && !rc.freezeAuthority;
      a.hasHiddenFunc = false;
      // LP lock: cek lockers / lockerOwners
      const lockers = rc.lockers || rc.lockerOwners || [];
      if (Array.isArray(lockers) && lockers.length > 0) {
        const burned = lockers.filter(l => l.burned || l.locked).length;
        a.lpLocked = burned > 0;
        a.lpLockedPercent = lockers.length ? (burned / lockers.length) * 100 : null;
        a.lpLockPlatform = rc.launchpad || rc.deployPlatform || 'Locked';
      } else if (rc.risks) {
        // fallback: cek risk "LP Burned" / "LP Locked"
        const lpRisk = rc.risks.find(r => /lp (burn|lock)/i.test(r.name || ''));
        a.lpLocked = lpRisk ? lpRisk.detected === false : null;
      }
      // Top holders: RugCheck v1 topHolders = { '0':[{pct}], '1':[...] } atau { '0':{pct} }
      if (rc.topHolders && typeof rc.topHolders === 'object') {
        const vals = Object.values(rc.topHolders);
        const flat = vals.flatMap(v => Array.isArray(v) ? v : [v]);
        const pcts = flat.map(h => h.pct || h.percentage || 0);
        a.top10Percent = pcts.slice(0, 10).reduce((s, p) => s + (parseFloat(p) || 0), 0);
      }
      // Risk score dari RugCheck (score_normalised itu 0-100, score mentah angka besar)
      const rcScore = typeof rc.score_normalised === 'number' ? rc.score_normalised : (rc.score != null ? Math.min(100, rc.score) : null);
      if (rcScore != null) {
        a._rugScore = rcScore;
        // kalau RugCheck nilai rendah (<50), itu red flag
        if (rcScore < 50) { a._forceHighRisk = true; }
      }
      // Explicit risks
      if (Array.isArray(rc.risks)) {
        for (const r of rc.risks) {
          if (r.detected && (r.level === 'danger' || r.level === 'high')) {
            a.redRiskNotes = a.redRiskNotes || [];
            a.redRiskNotes.push(r.name);
          }
        }
      }
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
    else { red.push('LP lock TIDAK terverifikasi (token baru/fase bonding)'); score -= 8; }

    if (a.ownershipRenounced === true) green.push('Ownership renounced');
    else if (a.ownershipRenounced === false) { red.push('Ownership belum renounced'); score -= 10; }
    else { red.push('Ownership TIDAK terverifikasi'); score -= 5; }

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
