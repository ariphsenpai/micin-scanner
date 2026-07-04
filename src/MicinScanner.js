/**
 * Micin Scanner v2 - Low-cap gem finder with anti-scam
 * Chains: BSC, Ethereum, Base, Solana
 * Sources: DexScreener, PumpFun, RugCheck, GoPlus, TokenSniffer
 */

const axios = require('axios');
const { TelegramNotifier } = require('./TelegramNotifier');
const config = require('../config');

class MicinScanner {
  constructor() {
    this.notifier = new TelegramNotifier(config.BOT_TOKEN, config.TELEGRAM_USER_ID);
    this.knownTokens = new Set();
    this.chainMap = {
      bsc: 'bsc',
      ethereum: 'ethereum',
      base: 'base',
      solana: 'solana',
    };
  }

  fmt(num) {
    if (!num) return '$0';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + num.toFixed(2);
  }

  // === SOURCE 1: DexScreener — Latest token profiles + boosted tokens ===
  async fetchDexScreener() {
    const tokens = [];
    const endpoints = [
      { url: 'https://api.dexscreener.com/token-profiles/latest/v1', label: 'profiles' },
      { url: 'https://api.dexscreener.com/token-boosts/top/v1', label: 'boosts' },
      { url: 'https://api.dexscreener.com/token-boosts/latest/v1', label: 'latest-boosts' },
    ];

    for (const ep of endpoints) {
      try {
        const res = await axios.get(ep.url, { headers: { Accept: 'application/json' }, timeout: 10000 });
        if (Array.isArray(res.data)) {
          for (const t of res.data) {
            tokens.push({
              source: 'dexscreener',
              chain: (t.chainId || '').toLowerCase(),
              address: t.tokenAddress || t.address || '',
              name: t.name || t.symbol || 'Unknown',
              symbol: t.symbol || '',
            });
          }
        }
      } catch (e) {
        console.warn(`[DexScreener ${ep.label}] Error:`, e.message);
      }
    }

    // Get detailed token data via pairs endpoint
    const detailed = [];
    const chains = ['bsc', 'ethereum', 'base', 'solana'];
    for (const chain of chains) {
      try {
        // DexScreener: search for trending low-cap tokens per chain
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/search?q=${chain}`, { timeout: 10000 });
        if (res.data && Array.isArray(res.data.pairs)) {
          for (const pair of res.data.pairs) {
            if (chains.includes((pair.chainId || '').toLowerCase())) {
              detailed.push(this.normalizeDexScreenerPair(pair));
            }
          }
        }
      } catch (e) {
        console.warn(`[DexScreener search ${chain}] Error:`, e.message);
      }
    }

    // Also get token details for profile tokens
    for (const t of tokens.slice(0, 30)) {
      if (!t.address || !t.chain) continue;
      try {
        const res = await axios.get(`https://api.dexscreener.com/tokens/v1/${t.chain}/${t.address}`, { timeout: 10000 });
        if (res.data && Array.isArray(res.data.pairs)) {
          for (const pair of res.data.pairs) {
            const norm = this.normalizeDexScreenerPair(pair);
            if (norm) detailed.push(norm);
          }
        }
      } catch (e) { /* skip */ }
    }

    console.log(`[DexScreener] ${detailed.length} tokens`);
    return detailed;
  }

  normalizeDexScreenerPair(pair) {
    if (!pair || !pair.baseToken) return null;
    const chain = (pair.chainId || '').toLowerCase();
    if (!['bsc', 'ethereum', 'base', 'solana'].includes(chain)) return null;

    return {
      source: 'dexscreener',
      chain,
      address: pair.baseToken.address || '',
      name: pair.baseToken.name || pair.baseToken.symbol || 'Unknown',
      symbol: pair.baseToken.symbol || '',
      price: parseFloat(pair.priceUsd || 0),
      mcap: pair.marketCap || pair.fdv || 0,
      liquidity: pair.liquidity?.usd || 0,
      volume24h: pair.volume?.h24 || 0,
      volume6h: pair.volume?.h6 || 0,
      txns24h: pair.txns?.h24 || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      priceChange6h: pair.priceChange?.h6 || 0,
      pairAddress: pair.pairAddress || '',
      dexUrl: `https://dexscreener.com/${chain}/${pair.pairAddress || pair.baseToken.address}`,
      createdAt: pair.pairCreatedAt || null,
    };
  }

  // === SOURCE 2: PumpFun — Latest launched tokens on Solana ===
  async fetchPumpFun() {
    const tokens = [];
    try {
      // PumpFun API: get recently launched tokens
      const res = await axios.get('https://frontend.pump.fun/coins?limit=50&offset=0&orderby=created_unix_time&dir=DESC', {
        headers: { Accept: 'application/json' },
        timeout: 10000,
      });
      if (Array.isArray(res.data)) {
        for (const t of res.data) {
          tokens.push({
            source: 'pumpfun',
            chain: 'solana',
            address: t.mint || '',
            name: t.name || 'Unknown',
            symbol: t.symbol || '',
            price: t.price_usd || 0,
            mcap: (t.price_usd || 0) * (t.supply || 0),
            liquidity: t.liquidity_usd || 0,
            volume24h: t.volume_24h || 0,
            volume6h: 0,
            txns24h: 0,
            priceChange24h: 0,
            priceChange6h: 0,
            pairAddress: '',
            dexUrl: `https://pump.fun/${t.mint || ''}`,
            createdAt: t.created_unix_time ? t.created_unix_time * 1000 : null,
          });
        }
      }
      console.log(`[PumpFun] ${tokens.length} tokens`);
    } catch (e) {
      console.warn('[PumpFun] Error:', e.message);
    }
    return tokens;
  }

  // === SOURCE 3: DexScreener trending by chain ===
  async fetchDexTrending() {
    const tokens = [];
    const chains = ['bsc', 'ethereum', 'base', 'solana'];
    for (const chain of chains) {
      try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/trending/${chain}`, { timeout: 10000 });
        if (res.data && Array.isArray(res.data.pairs)) {
          for (const pair of res.data.pairs) {
            const norm = this.normalizeDexScreenerPair(pair);
            if (norm) {
              norm.source = 'dexscreener-trending';
              tokens.push(norm);
            }
          }
        }
      } catch (e) { /* skip */ }
    }
    console.log(`[DexTrending] ${tokens.length} tokens`);
    return tokens;
  }

  // === ANTI-SCAM: RugCheck (Solana) ===
  async rugCheck(address, chain) {
    if (chain !== 'solana') return null;
    try {
      const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${address}/report`, {
        headers: { Accept: 'application/json' },
        timeout: 10000,
      });
      return res.data;
    } catch (e) { return null; }
  }

  // === ANTI-SCAM: GoPlus Security (EVM chains) ===
  async goPlusCheck(address, chain) {
    const chainIdMap = { bsc: 56, ethereum: 1, base: 8453 };
    const chainId = chainIdMap[chain];
    if (!chainId) return null;
    try {
      const res = await axios.get(`https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address}`, {
        headers: { Accept: 'application/json' },
        timeout: 10000,
      });
      const data = res.data?.result?.[address.toLowerCase()];
      if (!data) return null;

      return {
        isHoneypot: data.is_honeypot === '1',
        isOpenSource: data.is_open_source === '1',
        isMintable: data.is_mintable === '1',
        isProxy: data.is_proxy === '1',
        canTakeBackOwnership: data.can_take_back_ownership === '1',
        ownerCanChangeBalance: data.owner_change_balance === '1',
        hiddenOwner: data.hidden_owner === '1',
        externalCall: data.external_call === '1',
        selfDestruct: data.selfdestruct === '1',
        buyTax: parseFloat(data.buy_tax || 0),
        sellTax: parseFloat(data.sell_tax || 0),
        holderCount: parseInt(data.holder_count || 0),
        lpHolders: parseInt(data.lp_holder_count || 0),
        topHolderPct: data.top_holder_pct ? parseFloat(data.top_holder_pct) : 0,
      };
    } catch (e) { return null; }
  }

  // === ANTI-SCAM: TokenSniffer (EVM) ===
  async tokenSnifferCheck(address, chain) {
    const chainMap = { bsc: 'binance', ethereum: 'ethereum', base: 'base' };
    const c = chainMap[chain];
    if (!c) return null;
    try {
      const res = await axios.get(`https://tokensniffer.com/api/v2/tokens/${c}/${address}`, {
        headers: { Accept: 'application/json' },
        timeout: 10000,
      });
      return res.data;
    } catch (e) { return null; }
  }

  // === Calculate safety score (0-100, higher = safer) ===
  calculateSafety(token, rugData, goPlusData, snifferData) {
    let score = 100;
    const issues = [];
    const warnings = [];

    // === Solana checks (RugCheck) ===
    if (rugData) {
      if (rugData.mintAuthority) { score -= 25; issues.push('Mint authority enabled'); }
      if (rugData.freezeAuthority) { score -= 20; issues.push('Freeze authority enabled'); }
      if (rugData.lpTokens?.length > 0) {
        const burned = rugData.lpTokens.filter(lp => lp.burned).length;
        const total = rugData.lpTokens.length;
        if (burned < total) { score -= 20; issues.push(`LP not fully burned (${burned}/${total})`); }
      }
      if (rugData.topHolders?.length > 0) {
        const topPct = rugData.topHolders[0].pct || 0;
        if (topPct > 20) { score -= 20; issues.push(`Top holder: ${topPct.toFixed(1)}%`); }
        else if (topPct > 10) { score -= 10; warnings.push(`Top holder: ${topPct.toFixed(1)}%`); }
      }
    }

    // === EVM checks (GoPlus) ===
    if (goPlusData) {
      if (goPlusData.isHoneypot) { score = 0; issues.push('HONEYPOT detected'); return { score, issues, warnings, safe: false }; }
      if (goPlusData.isMintable) { score -= 25; issues.push('Mintable (dev can mint)'); }
      if (goPlusData.isProxy) { score -= 20; issues.push('Proxy contract (upgradeable)'); }
      if (goPlusData.hiddenOwner) { score -= 20; issues.push('Hidden owner'); }
      if (goPlusData.canTakeBackOwnership) { score -= 15; issues.push('Can take back ownership'); }
      if (goPlusData.ownerCanChangeBalance) { score -= 30; issues.push('Owner can change balance'); }
      if (goPlusData.buyTax > 10) { score -= 15; issues.push(`Buy tax: ${goPlusData.buyTax}%`); }
      if (goPlusData.sellTax > 10) { score -= 15; issues.push(`Sell tax: ${goPlusData.sellTax}%`); }
      if (goPlusData.buyTax > 25 || goPlusData.sellTax > 25) { score = 0; issues.push('Tax too high (>25%)'); return { score, issues, warnings, safe: false }; }
      if (goPlusData.topHolderPct > 20) { score -= 15; issues.push(`Top holder: ${goPlusData.topHolderPct}%`); }
      if (!goPlusData.isOpenSource) { score -= 15; warnings.push('Not open source'); }
    }

    // === TokenSniffer checks ===
    if (snifferData) {
      if (snifferData.issues) {
        for (const issue of snifferData.issues) {
          if (issue.severity === 'high') { score -= 20; issues.push(issue.title || 'High severity issue'); }
          else if (issue.severity === 'medium') { score -= 10; warnings.push(issue.title || 'Medium severity issue'); }
        }
      }
      if (snifferData.simulation?.tax_buy > 10 || snifferData.simulation?.tax_sell > 10) {
        score -= 15; issues.push('High tax detected');
      }
    }

    // === General checks ===
    const liq = token.liquidity || 0;
    const mcap = token.mcap || 0;
    const vol = token.volume24h || 0;

    if (liq < 1000) { score -= 10; warnings.push('Low liquidity (<$1K)'); }
    if (liq > 0 && mcap > 0 && liq / mcap < 0.1) { score -= 10; warnings.push('Low liquidity ratio'); }
    if (vol < 100) { score -= 5; warnings.push('Low 24h volume'); }
    if (mcap > 100000) { score -= 5; warnings.push('Market cap >$100K'); }
    if (mcap < 1000) { score -= 10; warnings.push('Very low market cap (<$1K)'); }

    score = Math.max(0, Math.min(100, score));
    const safe = score >= 60 && issues.length === 0;

    return { score, issues, warnings, safe };
  }

  // === Filter & validate tokens ===
  async filterAndValidate(tokens) {
    const valid = [];
    const seen = new Set();

    for (const token of tokens) {
      if (!token.address || !token.chain) continue;
      const key = `${token.chain}:${token.address}`;
      if (seen.has(key)) continue;
      if (this.knownTokens.has(key)) continue;
      seen.add(key);

      // Chain filter
      if (!['bsc', 'ethereum', 'base', 'solana'].includes(token.chain)) continue;

      // Market cap filter (low-cap: <$100K)
      if (token.mcap > 100000) continue;
      if (token.mcap <= 0) continue;

      // Liquidity filter (min $1K)
      if (token.liquidity < 1000) continue;
      if (token.liquidity > 50000) continue; // Not too big either

      // Anti-scam checks
      let rugData = null, goPlusData = null, snifferData = null;

      if (token.chain === 'solana') {
        rugData = await this.rugCheck(token.address, 'solana');
      } else {
        goPlusData = await this.goPlusCheck(token.address, token.chain);
        snifferData = await this.tokenSnifferCheck(token.address, token.chain);
      }

      const safety = this.calculateSafety(token, rugData, goPlusData, snifferData);

      // Only pass tokens with score >= 60 and no critical issues
      if (!safety.safe) {
        console.log(`  SKIP ${token.symbol} (${token.chain}) score=${safety.score} ${safety.issues[0] || ''}`);
        continue;
      }

      token.safety = safety;
      token.rugUrl = token.chain === 'solana' ? `https://rugcheck.xyz/tokens/${token.address}` : `https://gopluslabs.io/token-security/${token.chain === 'bsc' ? 56 : token.chain === 'base' ? 8453 : 1}/${token.address}`;
      valid.push(token);
      this.knownTokens.add(key);

      // Limit known tokens set size
      if (this.knownTokens.size > 500) {
        this.knownTokens = new Set([...this.knownTokens].slice(-250));
      }
    }

    return valid;
  }

  // === Send Telegram alert ===
  async sendAlert(token) {
    const s = token.safety;
    const chainBadge = {
      bsc: '🟡 BSC',
      ethereum: '🔷 ETH',
      base: '🔵 BASE',
      solana: '🟣 SOL',
    }[token.chain] || token.chain;

    const changeEmoji = token.priceChange24h >= 0 ? '📈' : '📉';
    const changeStr = token.priceChange24h >= 0 ? `+${token.priceChange24h.toFixed(1)}%` : `${token.priceChange24h.toFixed(1)}%`;

    let msg = '';
    msg += '\u{1F6A8} <b>MICIN ALERT</b>\n';
    msg += '\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\n';
    msg += `\u{1F195} <b>${this.escape(token.name)}</b> <code>($${this.escape(token.symbol)})</code>\n`;
    msg += `${chainBadge} \u{2502} Source: ${token.source}\n`;
    msg += `\u{1F4CD} <code>${token.address}</code>\n\n`;
    msg += `\u{1F4B0} MCap: <b>${this.fmt(token.mcap)}</b>\n`;
    msg += `\u{1F4A7} Liq: <b>${this.fmt(token.liquidity)}</b>\n`;
    msg += `\u{1F4C8} Vol 24h: <b>${this.fmt(token.volume24h)}</b>\n`;
    msg += `${changeEmoji} 24h: <b>${changeStr}</b>\n\n`;
    msg += `\u{1F6E1}\u{FE0F} Safety: <b>${s.score}/100</b>`;
    if (s.warnings.length > 0) {
      msg += `\n\u{26A0}\u{FE0F} ${this.escape(s.warnings.join(', '))}`;
    }
    if (s.issues.length > 0) {
      msg += `\n\u{274C} ${this.escape(s.issues.join(', '))}`;
    } else {
      msg += `\n\u{2705} No critical issues`;
    }
    msg += '\n\n';
    msg += `<a href="${token.dexUrl}">\u{1F517} DexScreener</a>`;
    if (token.source === 'pumpfun') {
      msg += ` \u{2502} <a href="https://pump.fun/${token.address}">\u{1F517} PumpFun</a>`;
    }
    msg += ` \u{2502} <a href="${token.rugUrl}">\u{1F517} Security Check</a>\n`;
    msg += '\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}';

    try {
      await this.notifier.sendMessage(msg);
      console.log(`  SENT ${token.symbol} (${token.chain}) score=${s.score}`);
    } catch (e) {
      console.error('Send error:', e.message);
    }
  }

  escape(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>');
  }

  // === Main scan ===
  async scanOnce() {
    console.log(`\n\u{1F50D} [${new Date().toISOString()}] Scanning micin...`);

    // Fetch from all sources
    const [dexTokens, pumpTokens, trendingTokens] = await Promise.allSettled([
      this.fetchDexScreener(),
      this.fetchPumpFun(),
      this.fetchDexTrending(),
    ]);

    const allTokens = [
      ...(dexTokens.status === 'fulfilled' ? dexTokens.value : []),
      ...(pumpTokens.status === 'fulfilled' ? pumpTokens.value : []),
      ...(trendingTokens.status === 'fulfilled' ? trendingTokens.value : []),
    ];

    console.log(`[Scanner] Total raw: ${allTokens.length} tokens`);

    // Deduplicate
    const seen = new Set();
    const unique = allTokens.filter(t => {
      const k = `${t.chain}:${t.address}`;
      if (seen.has(k) || !t.address) return false;
      seen.add(k);
      return true;
    });

    console.log(`[Scanner] Unique: ${unique.length} tokens`);

    // Filter & validate
    const valid = await this.filterAndValidate(unique);

    console.log(`[Scanner] Valid (pass anti-scam): ${valid.length} tokens`);

    if (valid.length === 0) {
      console.log('\u{1F634} No safe micin found this round');
      return 0;
    }

    for (const token of valid.slice(0, 10)) { // Max 10 alerts per scan
      await this.sendAlert(token);
      await new Promise(r => setTimeout(r, 800)); // Anti rate-limit
    }

    return valid.length;
  }

  start() {
    console.log('\u{1F680} Micin Scanner v2 started');
    console.log(`\u{1F4CA} Chains: BSC, Ethereum, Base, Solana`);
    console.log(`\u{1F50D} Sources: DexScreener + PumpFun + DexTrending`);
    console.log(`\u{1F6E1}\u{FE0F} Anti-scam: RugCheck + GoPlus + TokenSniffer`);
    console.log(`\u{23F0} Interval: every ${config.SCAN_INTERVAL / 60000} min\n`);

    const run = async () => {
      try { await this.scanOnce(); }
      catch (e) { console.error('Scan error:', e.message); }
      setTimeout(run, config.SCAN_INTERVAL);
    };

    run();
  }
}

module.exports = { MicinScanner };
