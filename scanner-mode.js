const TelegramBot = require('node-telegram-bot-api');
const { MicinScanner } = require('./src/MicinScanner');
const config = require('./config');

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
const scanner = new MicinScanner();

console.log('🚀 Micin Scanner Bot — AUTO-SCAN MODE');
console.log('Scanning DexScreener for new tokens...');
console.log(`🔐 Authorized user ID: ${config.TELEGRAM_USER_ID}`);

// Helper: cek apakah chat ID sah
function isAuthorized(chatId) {
  return String(chatId) === String(config.TELEGRAM_USER_ID);
}

// Middleware: blokir user lain
bot.on('message', (msg) => {
  if (!isAuthorized(msg.chat.id)) {
    console.log(`⛔ Unauthorized access from ${msg.chat.id} — ignoring`);
    // optional: reply with warning? Bisa di-disable supaya gak ngasih tau
    // bot.sendMessage(msg.chat.id, '❌ Bot pribadi. Akses ditolak.');
    return;
  }
  // authorized → continue to other handlers
});

// State untuk deduplication
const seenTokens = new Set();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 menit
const lastAlerts = new Map(); // token address → timestamp

/**
 * Fetch trending/new pairs from DexScreener
 */
async function fetchTrendingTokens() {
  try {
    // Search for recent tokens with decent volume
    const chains = ['ethereum', 'bsc', 'base', 'solana'];
    const allPairs = [];
    
    for (const chain of chains) {
      // DexScreener doesn't have a direct "trending" endpoint, so we search by common terms
      // and filter by recent volume + liquidity
      const queries = ['new', 'trending', 'gem', 'meme'];
      
      for (const query of queries) {
        const url = `${config.DEXSCREENER.SEARCH}?q=${encodeURIComponent(query)}`;
        const response = await require('axios').get(url, { timeout: 10000 });
        
        if (response.data?.pairs) {
          for (const pair of response.data.pairs) {
            // Filter: only pairs with good liquidity and volume
            const liquidity = pair.liquidity?.usd || 0;
            const volume24h = pair.volume?.h24 || 0;
            const priceChange = pair.priceChange?.h24 || 0;
            
            if (liquidity > 10000 && volume24h > 50000) {
              allPairs.push(pair);
            }
          }
        }
      }
    }
    
    // Remove duplicates by token address
    const uniquePairs = [];
    const seen = new Set();
    for (const pair of allPairs) {
      const key = `${pair.chainId}:${pair.baseToken.address}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePairs.push(pair);
      }
    }
    
    // Sort by volume descending (most interesting first)
    uniquePairs.sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
    
    return uniquePairs.slice(0, 20); // Top 20
  } catch (err) {
    console.error('[Scanner] Error fetching tokens:', err.message);
    return [];
  }
}

/**
 * Evaluate token and send alert if interesting
 */
async function processToken(pair) {
  const address = pair.baseToken.address;
  const chain = pair.chainId;
  const key = `${chain}:${address}`;
  
  // Deduplication check
  if (seenTokens.has(key)) return;
  
  // Cooldown check
  const now = Date.now();
  if (lastAlerts.has(key)) {
    const lastTime = lastAlerts.get(key);
    if (now - lastTime < ALERT_COOLDOWN_MS) return;
  }
  
  try {
    // Parse token data (reuse MicinScanner logic)
    const token = scanner.parseTokenData(pair);
    token.source = 'dexscreener-auto';
    
    // Simple evaluation for scanner alerts
    const score = evaluateForScanner(token);
    
    // Only alert if risk level is acceptable (not extreme) and has some green flags
    if (score.riskLevel !== 'EXTREME' && score.greenFlags.length > 0) {
      await sendScannerAlert(token, score);
      seenTokens.add(key);
      lastAlerts.set(key, now);
      console.log(`[Scanner] Alert sent: ${token.name} (${token.symbol})`);
    }
  } catch (err) {
    console.error('[Scanner] Error processing token:', err.message);
  }
}

/**
 * Simple scoring for auto-scan mode
 */
function evaluateForScanner(token) {
  const score = {
    riskScore: 50,
    redFlags: [],
    greenFlags: [],
    riskLevel: 'MEDIUM'
  };
  
  // Green flags
  if (token.liquidity > 50000) score.greenFlags.push('High liquidity');
  if (token.volume24h > 100000) score.greenFlags.push('Active volume');
  if (token.priceChange24h > 0 && token.priceChange24h < 500) score.greenFlags.push('Positive price change');
  if (token.verified) score.greenFlags.push('Contract verified');
  
  // Red flags
  if (token.liquidity < 10000) score.redFlags.push('Low liquidity');
  if (token.volume24h < 50000) score.redFlags.push('Low volume');
  if (token.priceChange24h > 300) score.redFlags.push('Extreme price change (pump?)');
  
  // Calculate final
  score.riskScore += score.greenFlags.length * 10;
  score.riskScore -= score.redFlags.length * 15;
  score.riskScore = Math.max(0, Math.min(100, score.riskScore));
  
  if (score.riskScore < 30) score.riskLevel = 'EXTREME';
  else if (score.riskScore < 50) score.riskLevel = 'HIGH';
  else if (score.riskScore < 70) score.riskLevel = 'MEDIUM';
  else score.riskLevel = 'LOW';
  
  return score;
}

/**
 * Send scanner alert to Telegram (using existing notifier format)
 */
async function sendScannerAlert(token, score) {
  const chainBadge = { bsc: '🟡 BSC', ethereum: '🔵 ETH', base: '🔵 BASE', solana: '🟣 SOL' }[token.chain] || token.chain;
  const changeEmoji = token.priceChange24h >= 0 ? '📈' : '📉';
  const changeStr = token.priceChange24h >= 0 ? `+${token.priceChange24h.toFixed(1)}%` : `${token.priceChange24h.toFixed(1)}%`;
  
  let msg = '';
  msg += '🚨 <b>MICIN SCANNER — NEW GEM</b>\n';
  msg += '────────────────────────\n';
  msg += `🆕 <b>${token.name}</b> <code>(${token.symbol})</code>\n`;
  msg += `${chainBadge} │ <code>${token.address}</code>\n\n`;
  msg += `💰 MCap: <b>$${scanner.formatMoney(token.mcap)}</b> │ 💧 Liq: <b>$${scanner.formatMoney(token.liquidity)}</b>\n`;
  msg += `📊 Vol 24h: <b>$${scanner.formatMoney(token.volume24h)}</b> │ ${changeEmoji} ${changeStr}\n\n`;
  msg += `🛡️ Risk Level: <b>${score.riskLevel}</b> (${score.riskScore}/100)\n`;
  
  if (score.greenFlags.length > 0) {
    msg += `✅ Green: ${score.greenFlags.join(', ')}\n`;
  }
  if (score.redFlags.length > 0) {
    msg += `⚠️ Red: ${score.redFlags.join(', ')}\n`;
  }
  
  msg += `\n🔗 <a href="${token.dexUrl}">Chart</a>\n`;
  msg += '────────────────────────';
  
  try {
    await bot.sendMessage(config.TELEGRAM_USER_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
  } catch (err) {
    console.error('[Scanner] Send error:', err.message);
  }
}

// === MAIN LOOP ===
async function scanLoop() {
  console.log('[Scanner] Starting scan cycle...');
  
  try {
    const pairs = await fetchTrendingTokens();
    console.log(`[Scanner] Found ${pairs.length} candidate pairs`);
    
    // Process top pairs
    for (const pair of pairs) {
      await processToken(pair);
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error('[Scanner] Cycle error:', err.message);
  }
  
  // Schedule next scan
  const interval = 10 * 60 * 1000; // Every 10 minutes
  setTimeout(scanLoop, interval);
}

// Start scanning
scanLoop();

// Also handle manual commands
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '🔄 Micin Scanner Bot — AUTO-SCAN MODE\n\nBot akan otomatis scan DexScreener dan kirim alert token menarik setiap 10 menit.\n\nCommand:\n/status — lihat status\n/scan — trigger scan manual\n/clear — clear seen tokens');
});

bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id, `📊 Status:\n• Seen tokens: ${seenTokens.size}\n• Alerts sent: ${lastAlerts.size}\n• Mode: AUTO-SCAN\n• Interval: 10 menit`);
});

bot.onText(/\/scan/, async (msg) => {
  bot.sendMessage(msg.chat.id, '🔍 Triggering manual scan...');
  await scanLoop();
  bot.sendMessage(msg.chat.id, '✅ Scan selesai');
});

bot.onText(/\/clear/, (msg) => {
  seenTokens.clear();
  lastAlerts.clear();
  bot.sendMessage(msg.chat.id, '✅ Seen tokens cleared');
});

console.log('✅ Scanner bot ready');
