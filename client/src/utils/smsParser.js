// Client-side Local SMS Parser for APK

export function parseSMS(text) {
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
