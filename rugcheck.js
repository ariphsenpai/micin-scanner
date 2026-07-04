/**
 * RugCheck API integration for MiMicinScanner
 * Checks token safety scores and risk indicators
 */

const fetch = require('node-fetch');

// RugCheck API endpoints
const RUGCHECK_API = {
  base: 'https://api.rugcheck.xyz/v1',
  walletReport: (address) => `https://api.rugcheck.xyz/v1/tokens/${address}/report`,
  tokenLookup: (address) => `https://api.rugcheck.xyz/v1/tokens/${address}/lookup`,
};

/**
 * Fetch token safety report from RugCheck
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<Object|null>} - Safety report data
 */
async function getTokenReport(tokenAddress) {
  try {
    const response = await fetch(RUGCHECK_API.walletReport(tokenAddress), {
      headers: { 'Accept': 'application/json' },
      timeout: 10000
    });
    
    if (!response.ok) {
      console.warn(`RugCheck API error: ${response.status}`);
      return null;
    }
    
    return await response.json();
  } catch (err) {
    console.warn(`RugCheck fetch error: ${err.message}`);
    return null;
  }
}

/**
 * Calculate safety score from RugCheck data
 * @param {Object} report - RugCheck report data
 * @returns {Object} - Safety analysis
 */
function calculateSafetyScore(report) {
  if (!report) {
    return {
      score: 0,
      risk: 'unknown',
      issues: ['Unable to verify token safety'],
      warnings: [],
      isSafe: false
    };
  }

  const issues = [];
  const warnings = [];
  let score = 100;
  
  // Check mint authority
  if (report.mintAuthority) {
    score -= 30;
    issues.push('Mint authority enabled (dev can mint unlimited tokens)');
  }
  
  // Check freeze authority
  if (report.freezeAuthority) {
    score -= 20;
    warnings.push('Freeze authority enabled');
  }
  
  // Check LP tokens
  if (report.lpTokens?.length > 0) {
    const burned = report.lpTokens.filter(lp => lp.burned).length;
    const total = report.lpTokens.length;
    if (burned < total) {
      score -= 25;
      issues.push(`${total - burned}/${total} LP token positions not burned`);
    }
  }
  
  // Check token distribution
  if (report.topHolders) {
    const maxHolder = report.topHolders[0];
    if (maxHolder && maxHolder.pct > 10) {
      score -= 15;
      warnings.push(`Top holder owns ${maxHolder.pct.toFixed(2)}%`);
    }
  }
  
  // Check known risks
  if (report.risks) {
    report.risks.forEach(risk => {
      if (risk.level === 'high') {
        score -= 20;
        issues.push(risk.description);
      } else if (risk.level === 'medium') {
        score -= 10;
        warnings.push(risk.description);
      }
    });
  }
  
  // Normalize score
  score = Math.max(0, Math.min(100, score));
  
  // Determine risk level
  let risk = 'low';
  if (score < 30) risk = 'critical';
  else if (score < 50) risk = 'high';
  else if (score < 70) risk = 'medium';
  
  return {
    score,
    risk,
    issues: issues.slice(0, 5), // Limit to top 5
    warnings: warnings.slice(0, 5),
    isSafe: score >= 60 && issues.length === 0,
    rawReport: report
  };
}

/**
 * Quick check if token is safe to consider
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<{safe: boolean, score: number, details: Object}>}
 */
async function quickSafetyCheck(tokenAddress) {
  console.log(`🔍 Checking safety: ${tokenAddress}`);
  
  const report = await getTokenReport(tokenAddress);
  const analysis = calculateSafetyScore(report);
  
  return {
    safe: analysis.isSafe,
    score: analysis.score,
    details: analysis
  };
}

module.exports = {
  getTokenReport,
  calculateSafetyScore,
  quickSafetyCheck
};
