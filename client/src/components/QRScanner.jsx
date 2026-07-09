import React, { useState, useEffect } from "react";
import jsQR from "jsqr";
import { Upload, Clipboard, CheckCircle, AlertCircle } from "lucide-react";

export default function QRScanner({ onScanSuccess, onScanError }) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: null, message: "" });

  // Handle pasting image from clipboard
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processQRFile(file);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const processQRFile = (file) => {
    setLoading(true);
    setStatus({ type: "info", message: "Processing image..." });

    const reader = new FileReader();
    reader.onload = (event) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = image.width;
        canvas.height = image.height;
        context.drawImage(image, 0, 0, image.width, image.height);

        try {
          const imageData = context.getImageData(0, 0, image.width, image.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code && code.data) {
            parseUPILink(code.data);
          } else {
            setStatus({
              type: "error",
              message: "Could not find a valid QR code in the image. Please try another screenshot/image.",
            });
            if (onScanError) onScanError("No QR code found");
          }
        } catch (err) {
          console.error(err);
          setStatus({ type: "error", message: "Error processing image data." });
        }
        setLoading(false);
      };
      image.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const parseUPILink = (url) => {
    console.log("Decoded QR data:", url);
    // UPI formats: upi://pay?pa=merchant@upi&pn=MerchantName&...
    if (url.startsWith("upi://pay")) {
      try {
        const urlParams = new URLSearchParams(url.split("?")[1]);
        const upiId = urlParams.get("pa");
        const merchantName = urlParams.get("pn") || "My Shop";

        if (upiId) {
          setStatus({ type: "success", message: `Successfully loaded UPI: ${upiId}` });
          onScanSuccess({ upiId, merchantName, rawUrl: url });
        } else {
          setStatus({ type: "error", message: "QR does not contain a valid UPI address (pa parameter)." });
        }
      } catch (e) {
        setStatus({ type: "error", message: "Failed to parse UPI details from QR link." });
      }
    } else {
      setStatus({
        type: "error",
        message: "This is not a standard UPI QR. Ensure it is a payment QR.",
      });
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processQRFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      processQRFile(e.target.files[0]);
    }
  };

  return (
    <div className="qr-scanner-container">
      <div
        className={`qr-dropzone ${dragActive ? "active" : ""} ${loading ? "loading" : ""}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById("qr-file-input").click()}
      >
        <input
          id="qr-file-input"
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileInput}
        />
        
        <div className="dropzone-content">
          <Upload size={36} className="dropzone-icon" />
          <p className="dropzone-title">Upload or Paste QR Code</p>
          <p className="dropzone-subtitle">
            Drag & drop, browse, or press <strong>Ctrl + V</strong> to paste screenshot
          </p>
        </div>
      </div>

      {status.message && (
        <div className={`scan-status ${status.type}`}>
          {status.type === "success" && <CheckCircle size={18} />}
          {status.type === "error" && <AlertCircle size={18} />}
          <span>{status.message}</span>
        </div>
      )}
    </div>
  );
}
