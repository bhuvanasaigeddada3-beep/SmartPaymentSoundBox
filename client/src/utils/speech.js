// Text to Speech Helper for UPI Soundbox with Telugu, Hindi, and English support

let voices = [];

// Load voices asynchronously
export const getAvailableVoices = () => {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return [];
  }
  voices = window.speechSynthesis.getVoices();
  return voices;
};

// Listen for voice loading changes
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    voices = window.speechSynthesis.getVoices();
  };
}

// Speak the announcement
export const speakAnnouncement = ({ amount, app, language = "hi", voiceURI = "" }) => {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    console.error("Speech synthesis not supported in this browser.");
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  let text = "";

  if (language === "hi") {
    // Hindi Templates
    const formattedApp = app === "GPay" ? "गूगल पे" : app === "PhonePe" ? "फ़ोन पे" : app === "Paytm" ? "पेटीएम" : "यू पी आई";
    text = `${formattedApp} पर ${amount} रुपये प्राप्त हुए। धन्यवाद बॉस!`;
  } else if (language === "te") {
    // Telugu Templates
    const formattedApp = app === "GPay" ? "గూగుల్ పే" : app === "PhonePe" ? "ఫోన్ పే" : app === "Paytm" ? "పేటియం" : "యూ పి ఐ";
    text = `${formattedApp} ద్వారా ${amount} రూపాయలు లభించాయి. ధన్యవాదాలు బాస్!`;
  } else {
    // English Templates
    const formattedApp = app === "GPay" ? "Google Pay" : app === "PhonePe" ? "Phone Pe" : app === "Paytm" ? "Paytm" : "UPI";
    text = `Received ${amount} rupees on ${formattedApp}. Thank you boss!`;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Set language properties
  utterance.lang = language === "hi" ? "hi-IN" : language === "te" ? "te-IN" : "en-IN";
  
  // Try to find selected voice by URI
  const allVoices = window.speechSynthesis.getVoices();
  const selectedVoice = allVoices.find((v) => v.voiceURI === voiceURI);
  
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  } else {
    // Auto-select based on language if no voice chosen
    const prefix = language === "hi" ? "hi" : language === "te" ? "te" : "en";
    const fallbackVoice = allVoices.find((v) => v.lang.startsWith(prefix));
    if (fallbackVoice) {
      utterance.voice = fallbackVoice;
    }
  }

  utterance.rate = 0.95; // Slightly slower for clear pronunciation
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
};
