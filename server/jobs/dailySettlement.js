const cron = require('node-cron');
const settlementService = require('../services/settlementService');

/**
 * Register the daily settlement cron job.
 * Runs at midnight every day (0 0 * * *).
 */
function registerDailySettlementJob() {
  cron.schedule('0 0 * * *', () => {
    console.log('[DailySettlement] Starting daily settlement...');
    try {
      const result = settlementService.executeDailySettlement();
      console.log(`[DailySettlement] Completed. Processed: ${result.processed}, Failed: ${result.failed}`);
    } catch (err) {
      console.error('[DailySettlement] Error during settlement:', err);
    }
  });

  console.log('[DailySettlement] Cron job registered (runs at midnight daily)');
}

module.exports = { registerDailySettlementJob };
