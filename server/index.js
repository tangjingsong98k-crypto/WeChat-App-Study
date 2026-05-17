const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const userRoutes = require('./routes/user');
const treeRoutes = require('./routes/tree');
const cardRoutes = require('./routes/card');
const rankingRoutes = require('./routes/ranking');
const testRoutes = require('./routes/test');
app.use('/api/user', userRoutes);
app.use('/api/tree', treeRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/test', testRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// Start server
if (require.main === module) {
  const { registerDailySettlementJob } = require('./jobs/dailySettlement');
  const os = require('os');

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    // 打印局域网 IP，方便真机调试时配置
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`局域网地址: http://${iface.address}:${PORT}`);
        }
      }
    }
  });

  // Register cron jobs
  registerDailySettlementJob();
}

module.exports = app;
