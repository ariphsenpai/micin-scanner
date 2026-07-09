module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN || '8962752658:AAFFlcPbpBbu6V6S-S6_62Zc4ze3Y4r7eaA',
  TELEGRAM_USER_ID: process.env.TELEGRAM_USER_ID || '5375775335',
  MODE: process.env.ANALYST_MODE || 'scanner', // 'scanner' (auto-scan) atau 'analyst' (manual input)
  
  // Chains to scan/analyze
  CHAINS: ['robinhood', 'solana'], // Fokus ke robinhood dan solana
  
  // DexScreener API (primary source — gmgn.ai blocked)
  DEXSCREENER: {
    SEARCH: 'https://api.dexscreener.com/latest/dex/search',
  },
  
  // Scan settings
  SCAN_INTERVAL_MS: 15 * 60 * 1000, // 15 menit
  ALERT_COOLDOWN_MS: 5 * 60 * 1000, // 5 menit cooldown per token
  MAX_PAIRS_PER_SCAN: 30,
  
  // Risk thresholds
  LIQUIDITY_MIN: 1000,
  VOLUME_MIN: 1000,
};
