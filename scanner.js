const TelegramBot = require('node-telegram-bot-api');
const { MicinScanner } = require('./src/MicinScanner');
const config = require('./config');

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
const scanner = new MicinScanner();

console.log('🚀 Micin Scanner Bot — AUTO-SCAN MODE');
console.log(`Chains: ${config.CHAINS.join(', ')}`);
console.log(`Alert to: ${config.TELEGRAM_USER_ID}`);

// State untuk deduplication
const seenTokens = new Set();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 menit cooldown per token
const lastAlerts = new Map();

/**
 * Fetch trending/new pairs dari DexScreener
 */
async function fetchNewPairs() {
  try {
    const allPairs = [];
    
    // Search queries untuk menemukan token baru
    const queries = ['new', 'trending', 'meme', 'gem', '100x'];
    
    for (const query of queries) {
      const url = `${config.DEXSCREENER.SEARCH}?q=${encodeURIComponent(query)}`;
      const response = await require('axios').get(url, { timeout: 10000 });
      
      if (response.data?.pairs) {
        for (const pair of response.data.pairs) {
          // Filter: hanya chain yang aktif + liquidity > $1000
          if (config.CHAINS.includes(pair.chainId.toLowerCase()) && pair.liquidity?.usd > 1000) {
            allPairs.push(pair);
          }
        }
      }
    }
    
    // Remove duplicates
    const uniquePairs = [];
    const seen = new Set();
    for (const pair of allPairs) {
      const key = `${pair.chainId}:${pair.baseToken.address}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePairs.push(pair);
      }
    }
    
    // Sort by volume descending
    uniquePairs.sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
    
    return uniquePairs.slice(0, 30); // Top 30
  } catch (err) {
    console.error('[Scanner] Error fetching pairs:', err.message);
    return [];
  }
}

/**
 * Evaluate token dan kirim alert
 */
async function processToken(pair) {
  const address = pair.baseToken.address;
  const chain = pair.chainId.toLowerCase();
  const key = `${chain}:${address}`;
  
  // Deduplication
  if (seenTokens.has(key)) return;
  
  // Cooldown check
  const now = Date.now();
  if (lastAlerts.has(key)) {
    const lastTime = lastAlerts.get(key);
    if (now - lastTime < ALERT_COOLDOWN_MS) return;
  }
  
  try {
    const token = scanner.parsePair(pair);
    const analysis = scanner.evaluateToken(token);
    
    // Kirim alert
    await scanner.sendAlert(token, analysis);
    
    seenTokens.add(key);
    lastAlerts.set(key, now);
    console.log(`[Scanner] Alert sent: ${token.name} (${token.symbol})`);
  } catch (err) {
    console.error('[Scanner] Error processing token:', err.message);
  }
}

/**
 * Main scan loop
 */
async function scanLoop() {
  console.log('[Scanner] Starting scan cycle...');
  
  try {
    const pairs = await fetchNewPairs();
    console.log(`[Scanner] Found ${pairs.length} candidate pairs`);
    
    for (const pair of pairs) {
      await processToken(pair);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Delay antar request
    }
  } catch (err) {
    console.error('[Scanner] Cycle error:', err.message);
  }
  
  // Schedule next scan (setiap 15 menit)
  const nextScan = 15 * 60 * 1000;
  console.log(`[Scanner] Next scan in ${nextScan / 60000} minutes`);
  setTimeout(scanLoop, nextScan);
}

// Start scanning
scanLoop();
