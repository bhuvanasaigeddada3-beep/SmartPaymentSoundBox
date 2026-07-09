import React, { useState, useEffect } from "react";
import SoundboxDashboard from "./components/SoundboxDashboard";
import CustomerPayment from "./components/CustomerPayment";
import QRScanner from "./components/QRScanner";
import { Store, QrCode, CreditCard, ArrowRight, Laptop, Sparkles, HelpCircle, Check } from "lucide-react";
import "./App.css";

function App() {
  const [isCustomerView, setIsCustomerView] = useState(false);
  const [merchantConfig, setMerchantConfig] = useState(null);
  
  // Setup inputs
  const [shopName, setShopName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [setupError, setSetupError] = useState("");
  
  // Check routing on mount and query changes
  useEffect(() => {
    const checkRoute = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      const isPay = path.includes("/pay") || params.has("merchantId");
      setIsCustomerView(isPay);
    };

    checkRoute();
    
    // Listen to history changes
    window.addEventListener("popstate", checkRoute);
    return () => window.removeEventListener("popstate", checkRoute);
  }, []);

  // Try loading saved config on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem("upi_soundbox_merchant");
    if (savedConfig) {
      try {
        setMerchantConfig(JSON.parse(savedConfig));
      } catch (e) {
        console.error("Error loading config", e);
      }
    }
  }, []);

  // Decode QR success
  const handleQRScanSuccess = ({ upiId: scannedUpiId, merchantName: scannedName }) => {
    setUpiId(scannedUpiId);
    if (scannedName) {
      setShopName(scannedName);
    }
    setSetupError("");
  };

  // Demo QR loading
  const loadDemoConfig = (brand) => {
    if (brand === "paytm") {
      setShopName("Gupta Kirana Store");
      setUpiId("guptastore@paytm");
    } else if (brand === "phonepe") {
      setShopName("Raj General Store");
      setUpiId("9876543210@ybl");
    } else {
      setShopName("G-Pay Demo shop");
      setUpiId("demo.merchant@okaxis");
    }
  };

  // Save config and launch dashboard
  const handleSetupSubmit = (e) => {
    e.preventDefault();
    if (!shopName.trim() || !upiId.trim()) {
      setSetupError("Shop Name and UPI ID are required.");
      return;
    }

    // UPI format validation
    const upiRegex = /^[\w.\-_]+@[\w.\-_]+$/;
    if (!upiRegex.test(upiId.trim())) {
      setSetupError("Please enter a valid UPI ID (e.g. name@bank or number@upi).");
      return;
    }

    // Generate a persistent merchant socket ID
    let uniqueId = localStorage.getItem("upi_soundbox_id");
    if (!uniqueId) {
      uniqueId = "MCH" + Math.floor(100000 + Math.random() * 900000);
      localStorage.setItem("upi_soundbox_id", uniqueId);
    }

    const config = {
      merchantId: uniqueId,
      name: shopName.trim(),
      upiId: upiId.trim()
    };

    localStorage.setItem("upi_soundbox_merchant", JSON.stringify(config));
    setMerchantConfig(config);
    setSetupError("");
  };

  // Clear config
  const handleBackToSetup = () => {
    localStorage.removeItem("upi_soundbox_merchant");
    setMerchantConfig(null);
  };

  // Render Customer Flow
  if (isCustomerView) {
    return (
      <main className="app-container customer-bg">
        <header className="app-header">
          <div className="logo-group">
            <CreditCard className="logo-icon active" />
            <h1>FastPay UPI</h1>
          </div>
        </header>
        <CustomerPayment />
      </main>
    );
  }

  // Render Merchant Dashboard
  if (merchantConfig) {
    return (
      <main className="app-container merchant-bg">
        <header className="app-header">
          <div className="logo-group">
            <Store className="logo-icon" />
            <h1>Soundbox Dashboard</h1>
          </div>
          <div className="merchant-meta-id">
            <span>Terminal ID: <strong>{merchantConfig.merchantId}</strong></span>
          </div>
        </header>
        <SoundboxDashboard 
          merchantConfig={merchantConfig} 
          onBackToSetup={handleBackToSetup} 
        />
      </main>
    );
  }

  // Render Setup Screen
  return (
    <main className="app-container setup-bg">
      <div className="setup-container animate-fade-in">
        {/* Brand Info */}
        <div className="setup-info">
          <div className="brand-badge">
            <Sparkles size={16} />
            <span>Smart UPI Speaker for Small Businesses</span>
          </div>
          <h1>Transform any device into a <span>UPI Soundbox</span></h1>
          <p>
            No need to purchase expensive hardware. Upload your PhonePe, Paytm, or GPay QR code (or paste the details), and your phone/tablet/computer will automatically speak transaction notifications out loud when a customer pays.
          </p>

          <div className="info-cards">
            <div className="info-card">
              <div className="info-icon"><QrCode size={20} /></div>
              <div>
                <h5>Automatic QR Decoding</h5>
                <p>Drag/paste your QR screenshot to instantly extract payment links.</p>
              </div>
            </div>
            <div className="info-card">
              <div className="info-icon"><Laptop size={20} /></div>
              <div>
                <h5>Zero Hardware Required</h5>
                <p>Use your spare phone, iPad, or laptop as the shop voice speaker.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Setup Form */}
        <div className="setup-card">
          <h2>Configure Merchant</h2>
          <p className="card-subtitle">Enter your UPI details or paste your payment QR image below.</p>

          <form onSubmit={handleSetupSubmit} className="setup-form">
            <div className="form-group">
              <label htmlFor="shopName">Shop / Merchant Name</label>
              <input
                id="shopName"
                type="text"
                placeholder="E.g., Gupta Kirana Store"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="upiId">UPI ID (VPA)</label>
              <input
                id="upiId"
                type="text"
                placeholder="E.g., mobile-number@ybl or shopname@paytm"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                required
              />
            </div>

            {setupError && (
              <div className="error-message">
                <span>{setupError}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary submit-setup-btn">
              <span>Launch Soundbox Dashboard</span>
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="qr-section-divider">
            <span>OR SCAN / PASTE EXISTING QR IMAGE</span>
          </div>

          {/* QR Code Paste / Scanner */}
          <QRScanner 
            onScanSuccess={handleQRScanSuccess} 
            onScanError={(err) => console.log("QR Scan issue:", err)}
          />

          {/* Demo Presets */}
          <div className="demo-presets">
            <span className="preset-label">Test with Presets:</span>
            <div className="preset-buttons">
              <button className="preset-btn paytm" onClick={() => loadDemoConfig("paytm")}>
                Paytm Style
              </button>
              <button className="preset-btn phonepe" onClick={() => loadDemoConfig("phonepe")}>
                PhonePe Style
              </button>
              <button className="preset-btn gpay" onClick={() => loadDemoConfig("gpay")}>
                Google Pay
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
