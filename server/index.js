import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Memory stores
const merchants = new Map(); // merchantId -> { socketId, name, upiId }
const transactions = new Map(); // merchantId -> Array of transactions

// Keep track of socketId -> merchantId for clean disconnects
const socketToMerchant = new Map();

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Register Merchant
  socket.on("register-merchant", ({ merchantId, name, upiId }) => {
    if (!merchantId) return;
    
    console.log(`Merchant registered: ${name} (${merchantId}) on socket ${socket.id}`);
    
    // Map merchantId to socket info
    merchants.set(merchantId, { socketId: socket.id, name, upiId });
    socketToMerchant.set(socket.id, merchantId);
    
    // Send existing transactions back to merchant if any
    const history = transactions.get(merchantId) || [];
    socket.emit("transaction-history", history);
  });

  // Verify merchant status (requested by customer page)
  socket.on("get-merchant-info", (merchantId, callback) => {
    const merchant = merchants.get(merchantId);
    if (merchant) {
      callback({ success: true, name: merchant.name, upiId: merchant.upiId });
    } else {
      callback({ success: false, error: "Merchant is offline or invalid." });
    }
  });

  // Customer submits payment
  socket.on("submit-payment", (paymentData, callback) => {
    const { merchantId, amount, app, senderName, txId } = paymentData;
    
    console.log(`Payment submitted for ${merchantId}: ₹${amount} via ${app} from ${senderName}`);
    
    const merchant = merchants.get(merchantId);
    
    const transaction = {
      id: txId || `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`,
      amount: parseFloat(amount),
      app: app || "UPI",
      senderName: senderName || "Customer",
      timestamp: new Date().toISOString(),
      status: "SUCCESS"
    };

    // Store in history
    if (!transactions.has(merchantId)) {
      transactions.set(merchantId, []);
    }
    const merchantTxns = transactions.get(merchantId);
    merchantTxns.unshift(transaction);
    if (merchantTxns.length > 50) {
      merchantTxns.pop(); // limit to 50
    }

    if (merchant && merchant.socketId) {
      // Send live notification to merchant
      io.to(merchant.socketId).emit("payment-received", transaction);
      console.log(`Sent payment notification to merchant socket ${merchant.socketId}`);
      if (callback) callback({ success: true, transaction });
    } else {
      console.log(`Merchant ${merchantId} is offline. Payment saved to history.`);
      if (callback) callback({ success: true, error: "Merchant offline, transaction logged", transaction });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    const merchantId = socketToMerchant.get(socket.id);
    if (merchantId) {
      console.log(`Merchant offline: ${merchantId}`);
      merchants.delete(merchantId);
      socketToMerchant.delete(socket.id);
    }
  });
});

// SMS Parsing Utility
function parseSMS(text) {
  // Regexes to extract amount:
  // e.g. "credited with Rs.250.00", "Rs 250 received", "deposited ₹ 250.00", "received INR 250"
  const amtRegex = /(?:Rs\.?|INR|₹|INR\.)\s*([0-9,]+(?:\.[0-9]+)?)/i;
  const match = text.match(amtRegex);
  if (!match) return null;

  // Clean and parse amount
  const amountStr = match[1].replace(/,/g, '');
  const amount = parseFloat(amountStr);
  if (isNaN(amount)) return null;

  // Match Payment App
  let app = "UPI";
  const lowerText = text.toLowerCase();
  if (lowerText.includes("paytm")) app = "Paytm";
  else if (lowerText.includes("phonepe") || lowerText.includes("ybl") || lowerText.includes("axl")) app = "PhonePe";
  else if (lowerText.includes("gpay") || lowerText.includes("google pay") || lowerText.includes("okaxis") || lowerText.includes("okhdfcbank")) app = "GPay";
  
  // Match sender name (optional)
  let senderName = "Customer";
  const senderMatch = text.match(/(?:from|by|received from)\s+([A-Za-z\s]{3,20})(?:\s+via|\s+to|\s+on|\.|\d)/i);
  if (senderMatch && senderMatch[1]) {
    const nameStr = senderMatch[1].trim();
    // Exclude noise words
    if (!["account", "upi", "your", "my"].includes(nameStr.toLowerCase())) {
      senderName = nameStr;
    }
  }

  return { amount, app, senderName };
}

// Receive SMS notification from mobile SMS forwarder
app.post("/api/sms-webhook", (req, res) => {
  const merchantId = req.query.merchantId || req.body.merchantId;
  const smsText = req.body.text || req.body.message || req.body.body || req.body.msg;
  const sender = req.body.from || req.body.sender || "SMS Alert";

  console.log(`Received SMS Webhook for merchant ${merchantId} from ${sender}: "${smsText}"`);

  if (!merchantId) {
    return res.status(400).json({ error: "Missing merchantId parameter in query or body" });
  }
  if (!smsText) {
    return res.status(400).json({ error: "Missing SMS text/message body" });
  }

  const parsed = parseSMS(smsText);
  if (!parsed) {
    return res.status(422).json({ error: "Failed to parse transaction amount from SMS content" });
  }

  const merchant = merchants.get(merchantId);
  const transaction = {
    id: `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`,
    amount: parsed.amount,
    app: parsed.app,
    senderName: parsed.senderName,
    timestamp: new Date().toISOString(),
    status: "SUCCESS",
    isRealBankAlert: true
  };

  // Store in history
  if (!transactions.has(merchantId)) {
    transactions.set(merchantId, []);
  }
  const merchantTxns = transactions.get(merchantId);
  merchantTxns.unshift(transaction);
  if (merchantTxns.length > 50) {
    merchantTxns.pop(); // limit to 50
  }

  if (merchant && merchant.socketId) {
    // Send live notification to merchant
    io.to(merchant.socketId).emit("payment-received", transaction);
    console.log(`Forwarded parsed SMS payment to socket ${merchant.socketId}`);
  } else {
    console.log(`Merchant ${merchantId} is offline. Logged transaction to memory.`);
  }

  res.json({ success: true, transaction });
});

// Simple API status check
app.get("/api/status", (req, res) => {
  res.json({ status: "running", merchantsConnected: merchants.size });
});

// Get transactions via REST as alternative fallback
app.get("/api/transactions/:merchantId", (req, res) => {
  const history = transactions.get(req.params.merchantId) || [];
  res.json(history);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Soundbox backend running on port ${PORT}`);
});

