const { MicinScanner } = require('./src/MicinScanner');
const config = require('./config');

async function main() {
  const scanner = new MicinScanner();
  
  if (process.argv.includes('--once')) {
    const tokenInput = process.argv[process.argv.indexOf('--once') + 1];
    if (!tokenInput) {
      console.error('Usage: node scanner.js --once <token_address_or_url>');
      process.exit(1);
    }
    const result = await scanner.analyzeToken('test', tokenInput);
    console.log(`\n✅ Analysis complete for: ${tokenInput}`);
    console.log(`Risk Level: ${result.analysis.riskLevel} (${result.analysis.riskScore}/100)`);
    process.exit(0);
  } else {
    console.log('🚀 Micin Analyst Bot started');
    console.log('Mode: ANALYST — kirim token ke bot untuk evaluasi');
    console.log('Kirim ke Telegram: contract address, nama token, atau link gmgn.ai');
    
    // Keep alive (no scanning loop in analyst mode)
    setInterval(() => {}, 10000);
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
