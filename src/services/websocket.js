/**
 * Z-DRONE WebSocket Manager
 * Manages persistent WebSocket connections to the backend with auto-reconnect.
 */

const BASE_WS_URL = (import.meta.env.VITE_API_URL || 'http://13.200.250.121:8000')
  .replace('https://', 'wss://')
  .replace('http://', 'ws://');

class ZDroneWebSocket {
  constructor(path, onMessage, options = {}) {
    this.url = `${BASE_WS_URL}${path}`;
    this.onMessage = onMessage;
    this.reconnectDelay = options.reconnectDelay || 3000;
    this.maxRetries = options.maxRetries || 20;
    this.retryCount = 0;
    this.ws = null;
    this.pingInterval = null;
    this.shouldReconnect = true;
    this.connect();
  }

  connect() {
    console.log(`[WS] Connecting to ${this.url}...`);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log(`[WS] Connected: ${this.url}`);
      this.retryCount = 0;
      // Send ping every 30s to keep connection alive
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send('ping');
        }
      }, 30000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'pong') {
          this.onMessage(data);
        }
      } catch {
        // non-JSON message, ignore
      }
    };

    this.ws.onerror = (error) => {
      console.warn(`[WS] Error on ${this.url}:`, error);
    };

    this.ws.onclose = () => {
      clearInterval(this.pingInterval);
      if (this.shouldReconnect && this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(`[WS] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.retryCount})...`);
        setTimeout(() => this.connect(), this.reconnectDelay);
      } else {
        console.warn(`[WS] Connection to ${this.url} closed permanently.`);
      }
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    clearInterval(this.pingInterval);
    this.ws?.close();
  }
}

/**
 * Create a telemetry WebSocket subscription.
 * @param {function} onTelemetry - Callback with { drone_id, data, timestamp }
 * @returns {function} cleanup function to disconnect
 */
export function subscribeTelemetry(onTelemetry) {
  const ws = new ZDroneWebSocket('/ws/telemetry', (msg) => {
    if (msg.type === 'telemetry') {
      onTelemetry(msg);
    }
  });
  return () => ws.disconnect();
}

/**
 * Create an alerts WebSocket subscription.
 * @param {function} onAlert - Callback with alert object
 * @returns {function} cleanup function to disconnect
 */
export function subscribeAlerts(onAlert) {
  const ws = new ZDroneWebSocket('/ws/alerts', (msg) => {
    if (msg.type === 'alert') {
      onAlert(msg.alert);
    }
  });
  return () => ws.disconnect();
}
