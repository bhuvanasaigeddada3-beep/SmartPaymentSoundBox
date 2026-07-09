import React, { useState, useEffect, useRef } from "react";
import { socket, BACKEND_URL } from "../socket";
import { QRCodeSVG } from "qrcode.react";
import { speakAnnouncement, getAvailableVoices } from "../utils/speech";
import { parseSMS } from "../utils/smsParser";
import { 
  Volume2, VolumeX, ShieldAlert, CheckCircle, 
  Settings, History, QrCode, Play, Radio, Users, Copy, Check, Info, Send
} from "lucide-react";

export default function SoundboxDashboard({ merchantConfig, onBackToSetup }) {
  const { merchantId, name, upiId } = merchantConfig;
  const [isConnected, setIsConnected] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(false);
  const [speechLang, setSpeechLang] = useState("hi"); // hi, en, te
  const [selectedVoice, setSelectedVoice] = useState("");
  const [voiceList, setVoiceList] = useState([]);
  const [appStyle, setAppStyle] = useState("PhonePe"); // Paytm, PhonePe, GPay, UPI
  const [transactions, setTransactions] = useState([]);
  const [latestTxn, setLatestTxn] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Dynamic Payment Generation states
  const [txnAmount, setTxnAmount] = useState("");
  const [generatedUpiUrl, setGeneratedUpiUrl] = useState("");
  const [lastGeneratedAmount, setLastGeneratedAmount] = useState(null);
  
  // Real Bank SMS Simulator state
  const [simulatedSms, setSimulatedSms] = useState("");
  const [simStatus, setSimStatus] = useState({ type: "", message: "" });

  const notificationAudioRef = useRef(null);

  // Webhook integration URL (uses server IP rather than localhost to work on local network)
  const webhookUrl = `${BACKEND_URL}/api/sms-webhook?merchantId=${merchantId}`;
  
  // Direct customer page link
  const getCustomerLink = () => {
    try {
      const url = new URL(BACKEND_URL);
      // If backend is on local network IP, point customer link to Vite dev port 5173 on that same IP
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        return `http://${url.hostname}:5173/pay?merchantId=${merchantId}`;
      }
    } catch (e) {
      console.error("Error parsing BACKEND_URL:", e);
    }
    // Fallback to local origin (works for Netlify production or local desktop testing)
    return `${window.location.origin}/pay?merchantId=${merchantId}`;
  };

  const customerLink = getCustomerLink();

  // Initialize voices list safely
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.log("speechSynthesis not supported/initialized yet on this device.");
      return;
    }

    const voices = getAvailableVoices();
    setVoiceList(voices);
    
    // Choose appropriate default voice matching language
    if (voices.length > 0) {
      const defaultVoice = voices.find(v => v.lang.startsWith(speechLang)) || voices.find(v => v.lang.startsWith("hi")) || voices[0];
      setSelectedVoice(defaultVoice ? defaultVoice.voiceURI : "");
    }

    const handleVoicesChanged = () => {
      const updated = getAvailableVoices();
      setVoiceList(updated);
    };

    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
    }
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [speechLang]);

  // Connect socket and register merchant
  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("Connected to backend, registering merchant:", merchantId);
      socket.emit("register-merchant", { merchantId, name, upiId });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("transaction-history", (history) => {
      setTransactions(history);
    });

    socket.on("payment-received", (txn) => {
      console.log("Live payment received:", txn);
      
      setTransactions(prev => [txn, ...prev]);
      setLatestTxn(txn);

      // Play sound box alert chime
      if (notificationAudioRef.current) {
        notificationAudioRef.current.play().catch(err => console.log("Audio deferred:", err));
      }

      // Trigger announcement
      if (speakerEnabled) {
        setTimeout(() => {
          speakAnnouncement({
            amount: txn.amount,
            app: txn.app,
            language: speechLang,
            voiceURI: selectedVoice
          });
        }, 800);
      }

      // Clear highlight after 8 seconds
      setTimeout(() => {
        setLatestTxn(null);
      }, 8000);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("transaction-history");
      socket.off("payment-received");
      socket.disconnect();
    };
  }, [merchantId, name, upiId, speakerEnabled, speechLang, selectedVoice]);

  // Bind Native Android SMS Receiver event
  useEffect(() => {
    window.onNativeSmsReceived = (body, sender) => {
      console.log("SMS intercepted natively by Android WebView:", body, "from:", sender);
      
      const parsed = parseSMS(body);
      if (!parsed) {
        console.log("Could not parse transaction from native SMS content.");
        return;
      }

      const txn = {
        id: `TXN_LOCAL_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        amount: parsed.amount,
        app: parsed.app,
        senderName: parsed.senderName,
        timestamp: new Date().toISOString(),
        status: "SUCCESS",
        isRealBankAlert: true
      };

      // Add to dashboard log in real time
      setTransactions(prev => [txn, ...prev]);
      setLatestTxn(txn);

      // Play local notification chime
      if (notificationAudioRef.current) {
        notificationAudioRef.current.play().catch(e => console.log("Audio deferred:", e));
      }

      // Voice TTS speaking engine
      if (speakerEnabled) {
        setTimeout(() => {
          speakAnnouncement({
            amount: txn.amount,
            app: txn.app,
            language: speechLang,
            voiceURI: selectedVoice
          });
        }, 800);
      }

      // Hide popup alert after 8s
      setTimeout(() => {
        setLatestTxn(null);
      }, 8000);
    };

    return () => {
      window.onNativeSmsReceived = null;
    };
  }, [speakerEnabled, speechLang, selectedVoice]);

  // Generate dynamic payment link for customer
  const handleGeneratePayment = (e) => {
    e.preventDefault();
    if (!txnAmount || parseFloat(txnAmount) <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    const amtFloat = parseFloat(txnAmount);
    // standard UPI deep-link format: upi://pay?pa=address&pn=name&am=amount&cu=INR
    const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${amtFloat}&cu=INR`;
    setGeneratedUpiUrl(upiUrl);
    setLastGeneratedAmount(amtFloat);
  };

  const copyTextToClipboard = (text, setCopiedState) => {
    navigator.clipboard.writeText(text);
    setCopiedState(true);
    setTimeout(() => setCopiedState(false), 2000);
  };

  // Test speaking locally (simulation button)
  const triggerTestSpeech = () => {
    setIsTesting(true);
    if (notificationAudioRef.current) {
      notificationAudioRef.current.play().catch(e => console.log(e));
    }
    
    setTimeout(() => {
      speakAnnouncement({
        amount: 250,
        app: appStyle,
        language: speechLang,
        voiceURI: selectedVoice
      });
      setIsTesting(false);
    }, 800);
  };

  // Send simulated bank SMS via REST to our webhook endpoint
  const sendSimulatedSms = async () => {
    if (!simulatedSms.trim()) {
      setSimStatus({ type: "error", message: "Please paste a bank alert message first." });
      return;
    }

    setSimStatus({ type: "info", message: "Sending to webhook..." });

    try {
      const response = await fetch(`${BACKEND_URL}/api/sms-webhook?merchantId=${merchantId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "BANK-SMS",
          text: simulatedSms.trim()
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setSimStatus({ 
          type: "success", 
          message: `Webhook success! Parsed amount: ₹${data.transaction.amount} via ${data.transaction.app}` 
        });
        setSimulatedSms("");
      } else {
        setSimStatus({ type: "error", message: data.error || "Failed to parse amount." });
      }
    } catch (e) {
      setSimStatus({ type: "error", message: "Network error connecting to webhook endpoint." });
    }

    setTimeout(() => setSimStatus({ type: "", message: "" }), 5000);
  };

  // Preset bank SMS messages for quick testing
  const applySmsPreset = (brand) => {
    const time = new Date().toLocaleTimeString();
    if (brand === "phonepe") {
      setSimulatedSms(`PhonePe: Payment of Rs. 250 to your store is successful. Transaction ID TXN12345. Time: ${time}`);
    } else if (brand === "sbi") {
      setSimulatedSms(`Dear SBI Customer, your A/c ending XX5678 has been credited with Rs 250.00 on 09-07-26 via UPI Ref 67891234 from Ramesh. Balance Rs 5430.`);
    } else if (brand === "hdfc") {
      setSimulatedSms(`HDFC Bank: You have received Rs.250.00 in HDFC bank account on 09-07-26 via UPI from Suresh.`);
    }
  };

  return (
    <div className="dashboard-grid">
      <audio 
        ref={notificationAudioRef} 
        src="https://assets.mixkit.co/active_storage/sfx/2869/2869-200.wav" 
        preload="auto"
      />

      {/* COLUMN 1: Soundbox Speaker & Controls */}
      <div className="dashboard-card soundbox-main">
        <div className="card-header">
          <div className="merchant-identity">
            <h2>{name}</h2>
            <span className="upi-tag">{upiId}</span>
          </div>
          <div className={`status-badge ${isConnected ? "online" : "offline"}`}>
            <span className="status-dot"></span>
            {isConnected ? "Connected" : "Offline"}
          </div>
        </div>

        {/* Pulsing Speaker Animation */}
        <div className="speaker-section">
          <div className={`speaker-outer ${speakerEnabled && latestTxn ? "pulsing" : ""}`}>
            <div className={`speaker-inner ${speakerEnabled ? "active" : ""}`}>
              {speakerEnabled ? (
                <Volume2 size={48} className="speaker-icon animate-pulse" />
              ) : (
                <VolumeX size={48} className="speaker-icon offline" />
              )}
            </div>
            {speakerEnabled && latestTxn && (
              <>
                <div className="audio-wave wave-1"></div>
                <div className="audio-wave wave-2"></div>
              </>
            )}
          </div>

          <div className="speaker-controls">
            {!speakerEnabled ? (
              <button 
                className="btn btn-primary start-speaker-btn"
                onClick={() => {
                  setSpeakerEnabled(true);
                  if (notificationAudioRef.current) {
                    notificationAudioRef.current.play().then(() => {
                      notificationAudioRef.current.pause();
                      notificationAudioRef.current.currentTime = 0;
                    }).catch(e => console.log(e));
                  }
                }}
              >
                <Play size={18} />
                <span>Start Soundbox Speaker</span>
              </button>
            ) : (
              <button 
                className="btn btn-secondary stop-speaker-btn"
                onClick={() => setSpeakerEnabled(false)}
              >
                <VolumeX size={18} />
                <span>Mute Speaker</span>
              </button>
            )}
            <p className="speaker-tip">
              *Browser permissions require manual activation to allow TTS announcements.
            </p>
          </div>
        </div>

        {/* Selected Settings Summary */}
        <div className="dashboard-settings-preview">
          <div className="setting-pill">
            <Radio size={14} />
            <span>Brand: <strong>{appStyle}</strong></span>
          </div>
          <div className="setting-pill">
            <span>Lang: <strong>{speechLang === "hi" ? "हिन्दी" : speechLang === "te" ? "తెలుగు" : "English"}</strong></span>
          </div>
        </div>

        {/* Latest Transaction Highlight Alert */}
        {latestTxn && (
          <div className="latest-txn-alert animate-bounce-in">
            <div className="txn-alert-icon">
              <CheckCircle size={32} />
            </div>
            <div className="txn-alert-info">
              <span className="alert-title">{latestTxn.isRealBankAlert ? "Real Bank Credit!" : "Payment Received!"}</span>
              <span className="alert-amount">₹{latestTxn.amount}</span>
              <span className="alert-details">
                via {latestTxn.app} • {latestTxn.senderName}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* COLUMN 2: QR Generator & Dynamic Checkout Setup */}
      <div className="dashboard-card soundbox-config">
        <h3>Dynamic QR Generator</h3>
        <p className="config-help">
          Enter the customer's purchase amount to generate a prefilled payment QR.
        </p>

        {/* Generator Form */}
        <form onSubmit={handleGeneratePayment} className="setup-form" style={{ marginBottom: "1rem" }}>
          <div className="form-group" style={{ marginBottom: "0.75rem" }}>
            <label htmlFor="txnAmount">Amount (₹)</label>
            <input
              id="txnAmount"
              type="number"
              placeholder="Enter amount (e.g. 250)"
              value={txnAmount}
              onChange={(e) => setTxnAmount(e.target.value)}
              required
              min="1"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Speech Lang</label>
              <select 
                value={speechLang} 
                onChange={(e) => setSpeechLang(e.target.value)}
                className="form-select"
                style={{ padding: "0.5rem" }}
              >
                <option value="hi">Hindi (हिन्दी)</option>
                <option value="te">Telugu (తెలుగు)</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Preferred App</label>
              <select 
                value={appStyle} 
                onChange={(e) => setAppStyle(e.target.value)}
                className="form-select"
                style={{ padding: "0.5rem" }}
              >
                <option value="PhonePe">PhonePe</option>
                <option value="Paytm">Paytm</option>
                <option value="GPay">Google Pay</option>
                <option value="UPI">BHIM UPI</option>
              </select>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: "0.6rem" }}>
            <QrCode size={16} />
            <span>Generate Customer QR</span>
          </button>
        </form>

        {/* Generated QR View */}
        <div className="counter-qr-wrapper" style={{ minHeight: "180px" }}>
          {generatedUpiUrl ? (
            <>
              <div className="qr-border" style={{ padding: "0.5rem" }}>
                <QRCodeSVG 
                  value={generatedUpiUrl} 
                  size={150}
                  level={"H"}
                  includeMargin={true}
                  imageSettings={{
                    src: appStyle === "Paytm" 
                      ? "https://img.icons8.com/color/48/paytm.png" 
                      : appStyle === "PhonePe" 
                      ? "https://img.icons8.com/color/48/phonepe.png"
                      : "https://img.icons8.com/color/48/google-pay.png",
                    x: null,
                    y: null,
                    height: 20,
                    width: 20,
                    excavate: true,
                  }}
                />
              </div>
              <div className="qr-scan-instruction">
                <CheckCircle size={14} className="text-success" />
                <span>Scan to pay ₹<strong>{lastGeneratedAmount}</strong> via {appStyle}</span>
              </div>
            </>
          ) : (
            <div className="empty-qr-placeholder" style={{ border: "1px dashed var(--card-border)", borderRadius: "12px", width: "150px", height: "150px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center", padding: "1rem" }}>
              Dynamic QR will appear here
            </div>
          )}
        </div>

        <div className="customer-link-copy" style={{ marginTop: "0.5rem" }}>
          <input type="text" readOnly value={customerLink} />
          <button className="btn btn-icon" onClick={() => copyTextToClipboard(customerLink, setCopiedLink)}>
            {copiedLink ? <Check size={16} className="text-success" /> : <Copy size={16} />}
          </button>
        </div>

        {/* Local Localized Voice Dropdown for fine tuning */}
        <div className="form-group" style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>
          <label style={{ fontSize: "0.75rem" }}>Speech Voice Pitch Selector</label>
          <select 
            value={selectedVoice} 
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="form-select"
            style={{ padding: "0.4rem", fontSize: "0.8rem" }}
          >
            {voiceList.length === 0 ? (
              <option value="">System Default Voice</option>
            ) : (
              voiceList.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))
            )}
          </select>
        </div>

        <button 
          className="btn btn-secondary test-btn" 
          onClick={triggerTestSpeech}
          disabled={isTesting}
          style={{ padding: "0.4rem 1rem", fontSize: "0.8rem" }}
        >
          <Volume2 size={14} />
          <span>Local Voice Test (₹250)</span>
        </button>

        <button className="btn btn-link back-setup-btn" onClick={onBackToSetup} style={{ padding: 0, marginTop: "0.75rem" }}>
          Change Setup / QR
        </button>
      </div>

      {/* COLUMN 3: Transaction History Log & SMS Integrator */}
      <div className="dashboard-card transactions-history">
        <div className="history-header" style={{ marginBottom: "1rem" }}>
          <h3>
            <History size={16} />
            <span>Transaction Ledger</span>
          </h3>
          <span className="history-count">{transactions.length}</span>
        </div>

        {/* SMS Webhook Tester Box */}
        <div className="sms-integrator-card" style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--card-border)", borderRadius: "14px", padding: "0.85rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <Info size={14} className="text-info" />
            <h5 style={{ fontSize: "0.8rem", fontWeight: "600" }}>Linked Bank SMS Tester</h5>
          </div>
          <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.5rem", lineHeight: "1.2" }}>
            Simulate a real Bank SMS credit alert to test if the speaker reads the amount automatically:
          </p>

          <textarea
            placeholder="Paste HDFC/SBI/PhonePe credit SMS alert here..."
            value={simulatedSms}
            onChange={(e) => setSimulatedSms(e.target.value)}
            style={{ width: "100%", height: "50px", background: "rgba(0, 0, 0, 0.2)", border: "1px solid var(--card-border)", borderRadius: "8px", color: "#fff", padding: "0.4rem", fontSize: "0.75rem", fontFamily: "var(--font-primary)", resize: "none", outline: "none", marginBottom: "0.4rem" }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              <button type="button" className="quick-amt-btn" style={{ padding: "0.2rem 0.4rem", fontSize: "0.65rem" }} onClick={() => applySmsPreset("phonepe")}>PhonePe</button>
              <button type="button" className="quick-amt-btn" style={{ padding: "0.2rem 0.4rem", fontSize: "0.65rem" }} onClick={() => applySmsPreset("sbi")}>SBI</button>
              <button type="button" className="quick-amt-btn" style={{ padding: "0.2rem 0.4rem", fontSize: "0.65rem" }} onClick={() => applySmsPreset("hdfc")}>HDFC</button>
            </div>
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={sendSimulatedSms}
              style={{ padding: "0.3rem 0.6rem", borderRadius: "6px", fontSize: "0.7rem" }}
            >
              <Send size={10} />
              <span>Post SMS</span>
            </button>
          </div>

          {simStatus.message && (
            <div className={`scan-status ${simStatus.type}`} style={{ padding: "0.3rem 0.5rem", fontSize: "0.7rem", marginTop: "0.5rem" }}>
              {simStatus.message}
            </div>
          )}
        </div>

        {/* Webhook Instruction Card */}
        <div style={{ background: "rgba(147, 51, 234, 0.05)", border: "1px solid rgba(147, 51, 234, 0.15)", borderRadius: "14px", padding: "0.85rem", marginBottom: "1rem" }}>
          <h5 style={{ fontSize: "0.75rem", color: "#d8b4fe", marginBottom: "0.25rem", fontWeight: "600" }}>Hook to Real Bank Account</h5>
          <p style={{ fontSize: "0.65rem", color: "var(--text-secondary)", lineHeight: "1.3" }}>
            Install a free <strong>SMS to Webhook</strong> app from Google Play Store on the phone connected to your bank, and configure it to POST alerts to:
          </p>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
            <input 
              type="text" 
              readOnly 
              value={webhookUrl} 
              style={{ flex: 1, background: "rgba(0, 0, 0, 0.3)", border: "1px solid var(--card-border)", borderRadius: "6px", color: "var(--text-secondary)", fontSize: "0.6rem", padding: "0.3rem", outline: "none" }} 
            />
            <button 
              className="btn btn-icon" 
              style={{ padding: "0.25rem" }} 
              onClick={() => copyTextToClipboard(webhookUrl, setCopiedWebhook)}
            >
              {copiedWebhook ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {/* Transactions List */}
        <div className="transactions-list" style={{ maxHeight: "250px" }}>
          {transactions.length === 0 ? (
            <div className="empty-history" style={{ minHeight: "150px" }}>
              <Users size={24} />
              <p style={{ fontSize: "0.8rem" }}>No transactions yet</p>
              <p className="subtitle" style={{ fontSize: "0.7rem" }}>Scan QR or send test SMS to trigger speaker.</p>
            </div>
          ) : (
            transactions.map((txn) => (
              <div 
                key={txn.id} 
                className={`transaction-item ${latestTxn?.id === txn.id ? "highlighted" : ""}`}
                style={{ padding: "0.6rem 0.85rem", borderRadius: "10px" }}
              >
                <div className="txn-left">
                  <div className={`app-badge ${txn.app.toLowerCase()}`} style={{ width: "28px", height: "28px", fontSize: "0.65rem" }}>
                    {txn.app.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="txn-meta">
                    <span className="txn-sender" style={{ fontSize: "0.8rem" }}>{txn.senderName}</span>
                    <span className="txn-time" style={{ fontSize: "0.65rem" }}>
                      {new Date(txn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>
                <div className="txn-right">
                  <span className="txn-amount" style={{ fontSize: "0.95rem" }}>+₹{txn.amount}</span>
                  <span className="txn-id" style={{ fontSize: "0.55rem" }}>
                    {txn.isRealBankAlert ? "🏦 Real Bank Alert" : `ID: ${txn.id.substring(0, 8)}`}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
