module.exports = {
  BOT_TOKEN: '8962752658:AAG0q1mDSMV0-wsFNh-lctsU7rFHQFIXduk',
  TELEGRAM_USER_ID: '5375775335',
  
  // Scan parameters
  MAX_MARKET_CAP: 100000,    // Max $100K market cap (low-cap gems)
  MIN_LIQUIDITY: 1000,       // Min $1K liquidity
  MAX_LIQUIDITY: 50000,      // Max $50K liquidity (still low-cap)
  
  // Chains to scan
  CHAINS: ['solana'],
  
  // Scan interval
  SCAN_INTERVAL: 60 * 60 * 1000, // 1 hour
  
  // Anti-scam thresholds
  SAFETY: {
    MIN_SCORE: 60,
    MAX_SINGLE_HOLDER: 20,
    MAX_BUY_TAX: 10,
    MAX_SELL_TAX: 10,
  },
  
  // Sources
  DEXSCREENER_PROFILES: 'https://api.dexscreener.com/token-profiles/latest/v1',
  DEXSCREENER_BOOSTS: 'https://api.dexscreener.com/token-boosts/top/v1',
  DEXSCREENER_LATEST_BOOSTS: 'https://api.dexscreener.com/token-boosts/latest/v1',
  DEXSCREENER_SEARCH: 'https://api.dexscreener.com/latest/dex/search',
  PUMPFUN_API: 'https://frontend.pump.fun/coins',
  RUGCHECK_API: 'https://api.rugcheck.xyz/v1',
  GOPLUS_API: 'https://api.gopluslabs.io/api/v1',
  TOKENSNIFFER_API: 'https://tokensniffer.com/api/v2',
};
