import { io } from "socket.io-client";

// Get backend URL dynamically. In dev it is usually localhost:5000.
// In production or on local network (e.g. mobile testing), we use the host IP.
const getBackendUrl = () => {
  const hostname = window.location.hostname;
  // If we are accessing via local network IP (e.g. 192.168.x.x), connect to port 5000 on that same IP
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return `http://${hostname}:5000`;
  }
  return "http://localhost:5000";
};

export const BACKEND_URL = getBackendUrl();
export const socket = io(BACKEND_URL, {
  autoConnect: false // Connect manually when setting up the merchant/customer
});
