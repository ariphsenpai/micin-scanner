const { MicinScanner } = require('./src/MicinScanner');
const config = require('./config');

async function main() {
  const scanner = new MicinScanner();
  
  if (process.argv.includes('--once')) {
    const count = await scanner.scanOnce();
    console.log(`\n\u2705 Scan complete. ${count} safe tokens found.`);
    process.exit(0);
  } else {
    scanner.start();
    setInterval(() => {}, 10000); // Keep alive
  }
}

main().catch(err => {
  console.error('\u274C Fatal:', err);
  process.exit(1);
});
