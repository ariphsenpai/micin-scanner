const axios = require('axios');
const { TelegramNotifier } = require('./TelegramNotifier');
const config = require('../config');

class MicinScanner {
  constructor() {
    this.notifier = new TelegramNotifier(config.BOT_TOKEN, config.TELEGRAM_USER_ID);
  }

  /**
   * Extract contract address from various input formats
   */
  extractAddress(input) {
    // Try to extract address from URL
    const urlMatch = input.match(/0x([a-fA-F0-9]{40})/);
    if (urlMatch) return '0x' + urlMatch[1];
    
    // Solana address (base58, 32-44 chars)
    const solMatch = input.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    if (solMatch) return input;
    
    // If input is already an address
    if (input.startsWith('0x') && input.length === 42) return input;
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input)) return input;
    
    // Otherwise, use as search query
    return input.trim();
  }

  /**
   * Fetch token data from DexScreener API (free, no auth needed)
   */
  async fetchFromDexScreener(query) {
    try {
      console.log(`[fetchFromDexScreener] Query: "${query}"`);
      
      // Try search by query first
      const searchUrl = `${config.DEXSCREENER.SEARCH}?q=${encodeURIComponent(query)}`;
      console.log(`[fetchFromDexScreener] Search URL: ${searchUrl}`);
      
      const response = await axios.get(searchUrl, { 
        timeout: 15000,
        headers: { 'Accept': 'application/json' }
      });
      
      console.log(`[fetchFromDexScreener] Search response status: ${response.status}`);
      console.log(`[fetchFromDexScreener] Pairs found: ${response.data?.pairs?.length || 0}`);
      
      if (response.data && response.data.pairs && response.data.pairs.length > 0) {
        // Filter pairs with decent liquidity (> $1000) and return the best one
        const validPairs = response.data.pairs.filter(p => 
          p.liquidity?.usd > 1000 && p.dexId !== 'robinhood'
        );
        
        if (validPairs.length > 0) {
          // Sort by liquidity descending and return the highest
          validPairs.sort((a, b) => b.liquidity.usd - a.liquidity.usd);
          console.log(`[fetchFromDexScreener] Selected best pair from ${validPairs.length} valid pairs`);
          return validPairs[0];
        }
        
        // Fallback to first pair if no valid pairs found
        return response.data.pairs[0];
      }
      
      // If query looks like an address, try direct pair lookup
      if (query.startsWith('0x') || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query)) {
        console.log(`[fetchFromDexScreener] Trying direct pair lookup for address`);
        // Try common chains
        for (const chain of ['ethereum', 'bsc', 'base', 'solana']) {
          try {
            const pairUrl = `https://api.dexscreener.com/latest/dex/pairs/${chain}/${query}`;
            const pairResp = await axios.get(pairUrl, { timeout: 10000 });
            if (pairResp.data && pairResp.data.pair) {
              console.log(`[fetchFromDexScreener] Found pair on ${chain}`);
              return pairResp.data.pair;
            }
          } catch (e) {
            console.log(`[fetchFromDexScreener] Chain ${chain} failed: ${e.message}`);
          }
        }
      }
      
      console.log(`[fetchFromDexScreener] No pairs found`);
      return null;
    } catch (err) {
      console.error('DexScreener error:', err.message, err.response?.data);
      return null;
    }
  }

  /**
   * Parse DexScreener pair data into our token format
   */
  parseTokenData(pair) {
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
      ownershipRenounced: 'unknown',
      lpLocked: 'unknown',
      lpLockPlatform: 'Unknown',
      lpLockDuration: 'Unknown',
      top10Percent: 0,
      deployerAddress: pair.baseToken.address,
      sniperAlert: false,
      maxTxManipulation: false,
      taxCanChange: false,
      isFreshWallet: false,
      teamInfo: 'ANONIM',
      hasWebsite: false,
      socials: 'N/A',
      dexUrl: pair.url || `https://dexscreener.com/${pair.chainId}/${pair.baseToken.address}`,
      source: 'dexscreener',
    };
  }

  /**
   * Evaluate token based on available data
   */
  async evaluateToken(token, input) {
    const analysis = {
      riskScore: 50,
      riskLevel: 'MEDIUM',
      redFlags: [],
      greenFlags: [],
      summary: [],
      conclusion: '',
      inputs: [input]
    };

    // === LIQUIDITY CHECK ===
    if (token.liquidity > 50000) {
      analysis.greenFlags.push(`Liquidity tinggi: $${this.formatMoney(token.liquidity)}`);
    } else if (token.liquidity > 10000) {
      analysis.greenFlags.push(`Liquidity sedang: $${this.formatMoney(token.liquidity)}`);
    } else if (token.liquidity > 0) {
      analysis.redFlags.push(`⚠️ Liquidity rendah: $${this.formatMoney(token.liquidity)}`);
      analysis.riskScore -= 15;
    } else {
      analysis.redFlags.push('❌ Liquidity tidak tersedia');
      analysis.riskScore -= 25;
    }

    // === MARKET CAP CHECK ===
    if (token.mcap > 1000000) {
      analysis.greenFlags.push(`Market cap > $1M: $${this.formatMoney(token.mcap)}`);
    } else if (token.mcap > 100000) {
      analysis.greenFlags.push(`Market cap: $${this.formatMoney(token.mcap)}`);
    } else if (token.mcap > 0) {
      analysis.redFlags.push(`⚠️ Market cap sangat rendah: $${this.formatMoney(token.mcap)}`);
      analysis.riskScore -= 10;
    } else {
      analysis.redFlags.push('❌ Market cap tidak tersedia');
      analysis.riskScore -= 15;
    }

    // === MISSING DATA PENALTIES (gmgn.ai blocked) ===
    // Since gmgn.ai is blocked by Cloudflare, we can't verify:
    // - LP lock status
    // - Ownership renounced
    // - Holder distribution
    // - Tax rates
    // - Sniper detection
    // - Deployer history
    
    if (token.lpLocked === 'unknown') {
      analysis.redFlags.push('🔒 LP Lock: TIDAK BISA VERIFIKASI (gmgn.ai blocked)');
      analysis.riskScore -= 20;
    }
    
    if (token.ownershipRenounced === 'unknown') {
      analysis.redFlags.push('👤 Ownership: TIDAK BISA VERIFIKASI (gmgn.ai blocked)');
      analysis.riskScore -= 15;
    }
    
    if (token.top10Percent === 0) {
      analysis.redFlags.push('📊 Holder Distribution: TIDAK BISA VERIFIKASI (gmgn.ai blocked)');
      analysis.riskScore -= 10;
    }
    
    if (token.buyTax === 0 && token.sellTax === 0) {
      analysis.redFlags.push('💰 Tax Rate: TIDAK BISA VERIFIKASI (gmgn.ai blocked)');
      analysis.riskScore -= 5;
    }

    // === VOLUME CHECK ===
    if (token.volume24h > 50000) {
      analysis.greenFlags.push(`Volume 24h aktif: $${this.formatMoney(token.volume24h)}`);
    } else if (token.volume24h > 10000) {
      analysis.greenFlags.push(`Volume 24h: $${this.formatMoney(token.volume24h)}`);
    } else if (token.volume24h > 0) {
      analysis.redFlags.push(`⚠️ Volume rendah: $${this.formatMoney(token.volume24h)}`);
    }

    // === PRICE CHANGE ===
    if (token.priceChange24h > 100) {
      analysis.redFlags.push(`📈 Price change +${token.priceChange24h.toFixed(1)}% (volatil)`);
    } else if (token.priceChange24h < -50) {
      analysis.redFlags.push(`📉 Price drop ${token.priceChange24h.toFixed(1)}% (risiko tinggi)`);
    }

    // === CALCULATE FINAL RISK ===
    analysis.riskScore = Math.max(0, Math.min(100, analysis.riskScore));

    if (analysis.riskScore < 30) {
      analysis.riskLevel = 'EXTREME';
      analysis.conclusion = '🔴 Sangat berisiko! Banyak data tidak terverifikasi. DYOR ekstra.';
    } else if (analysis.riskScore < 50) {
      analysis.riskLevel = 'HIGH';
      analysis.conclusion = '🟠 Berisiko tinggi. Data keamanan tidak bisa diverifikasi. Waspada.';
    } else if (analysis.riskScore < 70) {
      analysis.riskLevel = 'MEDIUM';
      analysis.conclusion = '🟡 Ada potensi, tapi banyak data yang belum terverifikasi. DYOR.';
    } else {
      analysis.riskLevel = 'LOW';
      analysis.conclusion = '🟢 Relatif aman (berdasarkan data yang tersedia), tapi tetap DYOR.';
    }

    // Add disclaimer about gmgn.ai
    analysis.redFlags.unshift('⚠️ gmgn.ai diblokir Cloudflare dari VPS ini — data LP lock, ownership, tax, holder, sniper TIDAK TERVERIFIKASI');

    return analysis;
  }

  formatMoney(num) {
    if (!num) return '0';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
  }

  /**
   * Main analysis function
   */
  async analyzeToken(chatId, input) {
    // Parse input to get query
    let query = this.extractAddress(input);
    
    console.log(`🔍 Analyzing: "${query}"`);
    
    // Fetch from DexScreener
    const pair = await this.fetchFromDexScreener(query);
    
    if (!pair) {
      return { 
        success: false, 
        error: `❌ Token "${query}" tidak ditemukan di DexScreener.\n\nCoba kirim:\n• Contract address (0x...)\n• Nama token yang lebih spesifik` 
      };
    }
    
    console.log(`✅ Found: ${pair.baseToken.name} (${pair.baseToken.symbol}) on ${pair.chainId}`);
    
    // Parse token data
    const token = this.parseTokenData(pair);
    
    // Evaluate
    const analysis = await this.evaluateToken(token, input);
    
    // Build report
    const report = this.notifier.buildAnalystReport(token, analysis);
    
    // Send message
    await this.notifier.sendMessage(report);
    
    return { success: true, token, analysis };
  }
}

module.exports = { MicinScanner };
