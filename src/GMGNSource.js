const axios = require('axios');

class GMGNSource {
  constructor() {
    this.base = 'https://gmgn.ai/api/v1';
    this.endpoints = [
      '/new_pairs?limit=50',
      '/trending_tokens?limit=50',
      '/pump_tokens?limit=50',
    ];
    this.chainMap = {
      bsc: 'bsc',
      ethereum: 'eth',
      base: 'base',
      solana: 'sol',
    };
  }

  toChain(chain) {
    return this.chainMap[chain] || chain;
  }

  async fetchTokens() {
    const tokens = [];
    for (const ep of this.endpoints) {
      try {
        const res = await axios.get(this.base + ep, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0',
          },
          timeout: 12000,
        });
        const items = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.pairs || []);
        for (const t of items.slice(0, 40)) {
          const raw = (t.chain || t.chainId || '').toString().toLowerCase();
          const chain = ['bsc', 'ethereum', 'base', 'solana'].includes(raw) ? raw : null;
          if (!chain) continue;
          const address = t.token_address || t.tokenAddress || t.address || '';
          const symbol = t.symbol || t.token_symbol || '';
          const name = t.name || symbol || 'Unknown';
          const price = t.price_usd || t.price || 0;
          const mcap = t.market_cap || t.fdv || t.usd_market_cap || 0;
          const liq = t.liquidity_usd || t.liquidity || 0;
          const vol24 = t.volume_24h || t.volume24h || t.volume_1d || 0;
          const txns24 = (t.txns_24h?.buys || 0) + (t.txns_24h?.sells || 0) || t.txns24h || 0;
          const change24 = t.price_change_24h || t.priceChange24h || 0;
          const created = t.created_unix_time ? t.created_unix_time * 1000 : (t.createdAt ? new Date(t.createdAt).getTime() : null);
          if (!address || !symbol) continue;
          tokens.push({
            source: 'gmgn-' + ep.replace(/^\//, '').split('?')[0],
            chain,
            address,
            name,
            symbol,
            price: parseFloat(price) || 0,
            mcap: parseFloat(mcap) || 0,
            liquidity: parseFloat(liq) || 0,
            volume24h: parseFloat(vol24) || 0,
            txns24h: parseInt(txns24) || 0,
            priceChange24h: parseFloat(change24) || 0,
            createdAt,
            dexUrl: `https://gmgn.ai/${this.toChain(chain)}/token/${address}`,
            pairAddress: t.pair_address || t.pairAddress || '',
          });
        }
      } catch (e) {
        console.warn(`[GMGN] ${ep}:`, e.message);
      }
    }
    console.log(`[GMGN] ${tokens.length} tokens`);
    return tokens;
  }
}

module.exports = { GMGNSource };
