module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN || '8962752658:AAFFlcPbpBbu6V6S-S6_62Zc4ze3Y4r7eaA',
  TELEGRAM_USER_ID: process.env.TELEGRAM_USER_ID || '5375775335',
  MODE: process.env.ANALYST_MODE || 'analyst', // 'analyst' atau 'scanner'
  
  // Chains to scan/analyze
  CHAINS: ['bsc', 'ethereum', 'base', 'solana'],
  
  // DexScreener API (primary source — gmgn.ai blocked by Cloudflare)
  DEXSCREENER: {
    SEARCH: 'https://api.dexscreener.com/latest/dex/search',
  },
  
  // Anti-scam APIs (fallback)
  RUGCHECK: 'https://api.rugcheck.xyz/v1',
  GOPLUS: 'https://api.gopluslabs.io/api/v1',
};
