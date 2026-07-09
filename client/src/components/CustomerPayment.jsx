import React, { useState, useEffect } from "react";
import { socket } from "../socket";
import { QRCodeSVG } from "qrcode.react";
import { 
  CreditCard, Smartphone, CheckCircle, AlertCircle, 
  ArrowLeft, ShoppingBag, Loader2, ArrowRight
} from "lucide-react";

export default function CustomerPayment() {
  const [merchantId, setMerchantId] = useState("");
  const [merchantInfo, setMerchantInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Form states
  const [amount, setAmount] = useState("");
  const [senderName, setSenderName] = useState("");
  const [selectedApp, setSelectedApp] = useState("UPI"); // PhonePe, Paytm, GPay, UPI
  
  // Payment flow states
  const [paymentStatus, setPaymentStatus] = useState("idle"); // idle, processing, success, failed
  const [countdown, setCountdown] = useState(3);

  // Retrieve merchantId from URL search params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("merchantId");
    if (id) {
      setMerchantId(id);
    } else {
      setError("No merchant specified in the link. Please scan the QR code again.");
      setLoading(false);
    }
  }, []);

  // Fetch merchant info from server
  useEffect(() => {
    if (!merchantId) return;

    socket.connect();

    socket.on("connect", () => {
      console.log("Connected to server, fetching merchant info for:", merchantId);
      socket.emit("get-merchant-info", merchantId, (response) => {
        setLoading(false);
        if (response.success) {
          setMerchantInfo(response);
        } else {
          setError(response.error || "Merchant is currently offline or unavailable.");
        }
      });
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, [merchantId]);

  // Handle Quick Amount selections
  const addQuickAmount = (val) => {
    const current = parseFloat(amount) || 0;
    setAmount((current + val).toString());
  };

  // Generate real UPI deep link URI
  const generateUPILink = () => {
    if (!merchantInfo) return "";
    const nameEncoded = encodeURIComponent(merchantInfo.name);
    const amt = parseFloat(amount) || 0;
    // Standard UPI spec: upi://pay?pa=address&pn=name&am=amount&cu=INR
    let link = `upi://pay?pa=${merchantInfo.upiId}&pn=${nameEncoded}&cu=INR`;
    if (amt > 0) {
      link += `&am=${amt}`;
    }
    return link;
  };

  // Execute payment simulation
  const handlePaymentSubmit = (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      alert("Please enter a valid payment amount.");
      return;
    }

    setPaymentStatus("processing");

    // Simulate standard payment loading delay (e.g. UPI bank processing)
    setTimeout(() => {
      const paymentPayload = {
        merchantId,
        amount: parseFloat(amount),
        app: selectedApp,
        senderName: senderName.trim() || "Customer",
        txId: `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`
      };

      // Submit payment status to server
      socket.emit("submit-payment", paymentPayload, (res) => {
        if (res && res.success) {
          setPaymentStatus("success");
        } else {
          setPaymentStatus("failed");
          setError("Failed to register transaction with soundbox.");
        }
      });
    }, 2000);
  };

  if (loading) {
    return (
      <div className="customer-loading">
        <Loader2 className="animate-spin" size={48} />
        <p>Loading shop details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-error">
        <AlertCircle size={48} className="text-danger" />
        <h3>Unable to Load Shop</h3>
        <p>{error}</p>
        <button 
          className="btn btn-primary" 
          onClick={() => window.location.reload()}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="customer-checkout-container">
      {paymentStatus === "idle" && (
        <div className="checkout-card animate-fade-in">
          {/* Shop Header */}
          <div className="checkout-header">
            <div className="shop-avatar">
              <ShoppingBag size={24} />
            </div>
            <div className="shop-details">
              <h2>{merchantInfo.name}</h2>
              <span className="upi-badge-verified">Verified Merchant ID: {merchantInfo.upiId}</span>
            </div>
          </div>

          <form onSubmit={handlePaymentSubmit} className="checkout-form">
            {/* Amount Field */}
            <div className="amount-input-group">
              <label htmlFor="amount">Enter Amount</label>
              <div className="amount-wrapper">
                <span className="currency-symbol">₹</span>
                <input
                  id="amount"
                  type="number"
                  pattern="[0-9]*"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  min="1"
                  max="100000"
                />
              </div>
              
              {/* Quick Add Buttons */}
              <div className="quick-amounts">
                {[10, 50, 100, 200, 500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className="quick-amt-btn"
                    onClick={() => addQuickAmount(val)}
                  >
                    +₹{val}
                  </button>
                ))}
                <button
                  type="button"
                  className="quick-amt-btn reset"
                  onClick={() => setAmount("")}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Customer Details */}
            <div className="form-group">
              <label htmlFor="senderName">Your Name (Optional)</label>
              <input
                id="senderName"
                type="text"
                placeholder="E.g., Ramesh Kumar"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                maxLength={30}
              />
              <span className="form-tip">This will be shown on the shopkeeper's screen.</span>
            </div>

            {/* Select App Trigger */}
            <div className="form-group">
              <label>Select Payment App</label>
              <div className="app-grid">
                {[
                  { id: "Paytm", name: "Paytm-App", icon: "https://img.icons8.com/color/48/paytm.png" },
                  { id: "PhonePe", name: "PhonePe-App", icon: "https://img.icons8.com/color/48/phonepe.png" },
                  { id: "GPay", name: "GooglePay-App", icon: "https://img.icons8.com/color/48/google-pay.png" },
                  { id: "UPI", name: "Other UPI", icon: "https://img.icons8.com/color/48/bhim.png" }
                ].map((app) => (
                  <div
                    key={app.id}
                    className={`app-selector-card ${selectedApp === app.id ? "selected" : ""}`}
                    onClick={() => setSelectedApp(app.id)}
                  >
                    <img src={app.icon} alt={app.name} />
                    <span>{app.id}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="action-section">
              {/* If on mobile, they can click to launch real UPI app.
                  Since we are mock testing, we also generate the QR for it. */}
              {amount && parseFloat(amount) > 0 && (
                <a
                  href={generateUPILink()}
                  className="btn btn-secondary mobile-upi-link"
                >
                  <Smartphone size={18} />
                  <span>Open Selected UPI App to Pay</span>
                </a>
              )}

              <button type="submit" className="btn btn-primary pay-now-btn">
                <span>Confirm Payment (Simulate Pay)</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Processing Screen */}
      {paymentStatus === "processing" && (
        <div className="processing-card animate-scale-in">
          <Loader2 className="animate-spin spinner" size={64} />
          <h2>Processing Payment</h2>
          <p>Sending secure payment signal to {merchantInfo.name} Soundbox...</p>
          <div className="processing-details">
            <span>Amount: <strong>₹{amount}</strong></span>
            <span>App: <strong>{selectedApp}</strong></span>
          </div>
        </div>
      )}

      {/* Success Screen */}
      {paymentStatus === "success" && (
        <div className="success-receipt-card animate-bounce-in">
          <div className="success-icon-wrapper">
            <CheckCircle size={72} />
          </div>
          <h2>Payment Successful!</h2>
          <p className="success-subtitle">The soundbox has spoken the receipt.</p>

          <div className="receipt-box">
            <div className="receipt-row">
              <span className="label">Paid To</span>
              <span className="value bold">{merchantInfo.name}</span>
            </div>
            <div className="receipt-row">
              <span className="label">Amount</span>
              <span className="value amount">₹{amount}</span>
            </div>
            <div className="receipt-row">
              <span className="label">Sender</span>
              <span className="value">{senderName || "Customer"}</span>
            </div>
            <div className="receipt-row">
              <span className="label">Method</span>
              <span className="value">{selectedApp} UPI</span>
            </div>
            <div className="receipt-row">
              <span className="label">Status</span>
              <span className="value text-success bold">COMPLETED</span>
            </div>
          </div>

          <button 
            className="btn btn-primary"
            onClick={() => {
              setAmount("");
              setSenderName("");
              setPaymentStatus("idle");
            }}
          >
            Make Another Payment
          </button>
        </div>
      )}
    </div>
  );
}
