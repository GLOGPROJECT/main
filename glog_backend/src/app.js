require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  exposedHeaders: ['X-Search-Fallback'],
}));

app.use(express.json());
app.use(cookieParser());

app.use('/api', require('./routes/index'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const { startStreakSyncScheduler } = require('./cron/streakCron');
startStreakSyncScheduler();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});
