module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN || '8962752658:***',
  TELEGRAM_USER_ID: process.env.TELEGRAM_USER_ID || '5375775335',
  MODE: process.env.ANALYST_MODE || 'analyst', // 'analyst' atau 'scanner'
  
  // Chains to scan/analyze
  CHAINS: ['bsc', 'ethereum', 'base', 'solana'],
  
  // GMGN.AI config (primary source)
  GMGN: {
    BASE_URL: 'https://gmgn.ai',
    API_COIN_INFO: 'https://gmgn.ai/api/v1/tokens/coin_info',
    API_PRICE: 'https://gmgn.ai/api/v1/tokens/price',
    API_TOP_HOLDER: 'https://gmgn.ai/api/v1/tokens/top_holders',
    API_TXNS: 'https://gmgn.ai/api/v1/tokens/transactions',
  },
  
  // DexScreener fallback
  DEXSCREENER: {
    PROFILES: 'https://api.dexscreener.com/token-profiles/latest/v1',
    BOOSTS: 'https://api.dexscreener.com/token-boosts/top/v1',
    LATEST_BOOSTS: 'https://api.dexscreener.com/token-boosts/latest/v1',
    SEARCH: 'https://api.dexscreener.com/latest/dex/search',
  },
  
  // Anti-scam APIs
  RUGCHECK: 'https://api.rugcheck.xyz/v1',
  GOPLUS: 'https://api.gopluslabs.io/api/v1',
  TOKENSNIFFER: 'https://tokensniffer.com/api/v2',
};
