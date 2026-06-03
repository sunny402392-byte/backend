import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import walletRoutes from './routes/wallet.routes.js';
import logger from './logger.js';

const app = express();

app.use(cors({ origin: 'https://sendtrust.online', credentials: false }));

app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.use('/api/wallets', walletRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

export default app;
