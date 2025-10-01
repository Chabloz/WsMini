import WebSocketServerOrigin from "./WebSocketServerOrigin.mjs";
import WebSocket from 'ws';
import crypto from 'crypto';
import { bytesBase64Decode } from "./String.mjs";

export default class WSServer {

  /**
   * Constructor for setting up the server with specific options.
   *
   * @param {Object} options - Configuration options.
   * @param {number} [options.port=443] - The port number to run the server on.
   * @param {number} [options.maxNbOfClients=1000] - Maximum number of allowed clients.
   * @param {number} [options.maxInputSize=100000] - Maximum size of input messages in bytes. (default: 100KB)
   * @param {string} [options.origins='*'] - Allowed origins.
   * @param {number} [options.pingTimeout=30000] - The timeout in milliseconds for ping responses.
   * @param {Function} [options.authCallback=(token, request, wsServer) => {}] - A callback function to authenticate new clients.
   * The function receives the auth token (if specified in the last subprotocol), the request object and the WS server instance.
   * The function MUST return an object to store in client metadata or false to reject the connection.
   * For example, you can return {isAdmin: true} to store {isAdmin: true} in the client metadata.
   * Return {} if you don't need to store any additional information.
   * @param {string} [options.logLevel='info'] - Log level: 'none', 'error', 'warn', 'info', 'debug'.
   * @param {Object} [options.logger=null] - External logger instance (e.g., winston, pino) for logging.
   */
  constructor({
    port = 443,
    maxNbOfClients = 1000,
    maxInputSize = 100000,
    origins = '*',
    pingTimeout = 30000,
    authCallback = (token, request, wsServer) => ({}),
    logLevel = 'info',
    logger = null,
  } = {}) {
    this.port = port;
    this.maxNbOfClients = maxNbOfClients;
    this.maxInputSize = maxInputSize;
    if (!['none', 'error', 'warn', 'info', 'debug'].includes(logLevel)) throw new Error(`Invalid log level: ${logLevel}`);
    this.logLevel = logLevel;
    this.logLevels = { none: 0, error: 1, warn: 2, info: 3, debug: 4 };
    this.origins = origins;
    this.pingTimeout = pingTimeout;
    this.pingInterval = null;
    this.authCallback = authCallback;
    this.logger = logger;
    this.clients = new Map();
    this.server = null;
  }

  start() {
    this.server = new WebSocketServerOrigin({
      port: this.port,
      origins: this.origins,
      maxNbOfClients: this.maxNbOfClients,
    });
    this.server.on('connection', (client, request) => this.onConnection(client, request));
    this.server.on('close', () => this.close());
    this.pingInterval = setInterval(() => this.pingManagement(), this.pingTimeout);
    this.log(`WebSocket Server started on port ${this.port}`);
  }

  pingManagement() {
    for (const [client, metadata] of this.clients.entries()) {
      if (client.isAlive === false) {
        this.log(`Client ${metadata?.id} is dead`);
        client.terminate();
        this.clients.delete(client);
      } else {
        client.isAlive = false;
        client.ping();
      }
    }
  }

  close() {
    if (this.server === null) return;
    for (const client of this.clients.keys()) client.close();
    clearInterval(this.pingInterval);
    this.server.close(() => this.log('Server closed'));
    this.server = null;
  }

  createClientMetadata(client, customMetadata) {
    this.clients.set(client, {
      id: crypto.randomUUID(),
      ...customMetadata,
    });
    client.isAlive = true;
  }

  log(message, level = 'info') {
    const currentLevel = this.logLevels[this.logLevel];
    const messageLevel = this.logLevels[level] || 0;

    if (messageLevel > currentLevel) return;

    const date = new Date().toISOString();
    const logLevel = level.toUpperCase();

    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[WSS] ${message}`);
    } else {
      const consoleMethod = console[level] || console.log;
      consoleMethod(`[WSS][${date}][${logLevel}] ${message}`);
    }
  }

  onConnection(client, request) {
    // Leverage the subprotocol to receive the authentication token
    const subprotocols = request.headers['sec-websocket-protocol'];
    let token = null;
    if (typeof subprotocols == 'string') {
      const subprotArr = subprotocols.replaceAll(', ', ',').split(',');
      if (subprotArr.length > 1) {
        token = subprotArr[subprotArr.length - 1];
        token = bytesBase64Decode(token);
      }
    }

    try {
      var customMetadata = this.authCallback(token, request, this);
    } catch (e) {
      this.log(e.name + ': ' + e.message, 'error');
      return false;
    }

    if (customMetadata === false) {
      this.sendAuthFailed(client);
      client.close();
      return;
    }

    if (customMetadata === null || typeof customMetadata !== 'object') {
      customMetadata = {};
    }

    this.createClientMetadata(client, customMetadata);
    this.log(`New client connected: ${this.clients.get(client)?.id}`);
    this.sendAuthSuccess(client);

    client.on('error', (error) => this.onError(client, error));
    client.on('message', (message) => this.onMessage(client, message));
    client.on('close', () => this.onClose(client));
    client.on('pong', () => this.onPong(client));
  }

  onPong(client) {
    client.isAlive = true;
  }

  onClose(client) {
    this.log(`Client disconnected: ${this.clients.get(client)?.id}`);
    this.clients.delete(client);
  }

  onError(client, error) {
    this.log(`Client ${this.clients.get(client)?.id} error: ${error?.message}`, 'error');
    client.close();
  }

  onMessage(client, message) {
    message = message.toString();
    if (message.length > this.maxInputSize) {
      this.log(`Client ${this.clients.get(client)?.id} sent a message that is too large`, 'warn');
      client.close();
      return;
    }
    this.broadcast(message);
  }

  getClientSocket(id) {
    for (const [client, metadata] of this.clients.entries()) {
      if (metadata.id === id) return client;
    }
    return null;
  }

  broadcast(message) {
    for (const client of this.clients.keys()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  broadcastOthers(client, message) {
    for (const otherClient of this.clients.keys()) {
      if (otherClient !== client && otherClient.readyState === WebSocket.OPEN) {
        otherClient.send(message);
      }
    }
  }

  send(client, message) {
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(message);
  }

  sendAuthFailed(client) {
    this.send(client, JSON.stringify({ action: 'auth-failed' }));
  }

  sendAuthSuccess(client) {
    const metadata = this.clients.get(client) ?? {};
    this.send(client, JSON.stringify({ action: 'auth-success', id: metadata.id ?? null }));
  }

  geClientsData() {
    return Array.from(this.clients.values());
  }

}