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
   * @param {number} [options.maxBufferedAmount=1048576] - Maximum queued outgoing bytes per client, including the next message.
   * @param {string} [options.origins='*'] - Allowed origins.
   * @param {number} [options.pingTimeout=30000] - The timeout in milliseconds for ping responses.
   * @param {number} [options.authTimeout=10000] - Maximum authentication wait in milliseconds.
   * @param {Function} [options.authCallback=(token, request, wsServer) => {}] - A callback function to authenticate new clients.
   * The function receives the auth token (if specified in the last subprotocol), the request object and the WS server instance.
   * The function MUST return a plain metadata object or false, directly or through a Promise.
   * For example, you can return {isAdmin: true} to store {isAdmin: true} in the client metadata.
   * Return {} if you don't need to store any additional information.
   * @param {string} [options.logLevel='info'] - Log level: 'none', 'error', 'warn', 'info', 'debug'.
   * @param {Object} [options.logger=null] - External logger instance (e.g., winston, pino) for logging.
   */
  constructor({
    port = 443,
    maxNbOfClients = 1000,
    maxInputSize = 100000,
    maxBufferedAmount = 1048576,
    origins = '*',
    pingTimeout = 30000,
    authTimeout = 10000,
    authCallback = (token, request, wsServer) => ({}),
    logLevel = 'info',
    logger = null,
  } = {}) {
    this.port = port;
    this.maxNbOfClients = maxNbOfClients;
    if (!Number.isInteger(maxInputSize) || maxInputSize <= 0 || maxInputSize > 2147483647) {
      throw new Error('maxInputSize must be a positive 32-bit integer');
    }
    if (!Number.isSafeInteger(maxBufferedAmount) || maxBufferedAmount <= 0) {
      throw new Error('maxBufferedAmount must be a positive safe integer');
    }
    this.maxInputSize = maxInputSize;
    this.maxBufferedAmount = maxBufferedAmount;
    if (!['none', 'error', 'warn', 'info', 'debug'].includes(logLevel)) throw new Error(`Invalid log level: ${logLevel}`);
    this.logLevel = logLevel;
    this.logLevels = { none: 0, error: 1, warn: 2, info: 3, debug: 4 };
    this.origins = origins;
    this.pingTimeout = pingTimeout;
    this.pingInterval = null;
    if (!Number.isInteger(authTimeout) || authTimeout <= 0 || authTimeout > 2147483647) {
      throw new Error('authTimeout must be a positive 32-bit integer');
    }
    this.authTimeout = authTimeout;
    this.pendingAuth = new Map();
    this.authCallback = authCallback;
    this.logger = logger;
    this.clients = new Map();
    this.server = null;
  }

  start(options = {}) {
    if (options.maxPayload !== undefined &&
        (!Number.isInteger(options.maxPayload) || options.maxPayload < 0 || options.maxPayload > 2147483647)) {
      throw new Error('maxPayload must be a non-negative 32-bit integer');
    }
    const wsOptions = {
      ...options,
      maxPayload: Math.min(this.maxInputSize, options.maxPayload || this.maxInputSize),
      origins: this.origins,
      maxNbOfClients: this.maxNbOfClients,
    };
    if (!options.server && !options.noServer) wsOptions.port = this.port;

    this.server = new WebSocketServerOrigin(wsOptions);
    this.server.on('connection', (client, request) => {
      this.onConnection(client, request).catch(error => {
        this.log(`Connection failed: ${error?.message}`, 'error');
        client.terminate();
      });
    });
    const startedServer = this.server;
    this.server.on('close', () => {
      if (this.server === startedServer) this.close();
    });
    this.pingInterval = setInterval(() => this.pingManagement(), this.pingTimeout);

    if (options.server || options.noServer) {
      this.log(`WebSocket Server started (using external HTTP server)`);
    } else {
      this.log(`WebSocket Server started on port ${this.port}`);
    }
  }

  pingManagement() {
    for (const [client, metadata] of this.clients.entries()) {
      if (client.isAlive === false) {
        this.log(`Client ${metadata?.id} is dead`);
        // Keep metadata available to onClose and channel/room departure hooks.
        client.terminate();
      } else {
        client.isAlive = false;
        client.ping();
      }
    }
  }

  close() {
    for (const [client, cancel] of this.pendingAuth) {
      cancel();
      this.pendingAuth.delete(client);
      client.terminate();
    }
    if (this.server === null) return;
    for (const client of this.clients.keys()) client.close();
    clearInterval(this.pingInterval);
    const closingServer = this.server;
    this.server = null;
    closingServer.close(() => this.log('Server closed'));
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

  async onConnection(client, request) {
    // Handle socket errors even when authentication is rejected.
    client.on('error', (error) => this.onError(client, error));

    const connectionServer = this.server;
    let cancelled = false;
    let timedOut = false;
    let timer;
    let cancel;
    const interrupted = new Promise((resolve, reject) => {
      cancel = () => {
        cancelled = true;
        reject(new Error('Authentication cancelled'));
      };
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error('Authentication timed out'));
      }, this.authTimeout);
    });
    // Attach a rejection handler before invoking user code, which may close the server.
    interrupted.catch(() => {});
    this.pendingAuth.set(client, cancel);
    client.on('close', cancel);

    let customMetadata;
    try {
      const subprotocols = request.headers['sec-websocket-protocol'];
      let token = null;
      if (typeof subprotocols === 'string') {
        const protocols = subprotocols.split(',').map(protocol => protocol.trim());
        if (protocols.length > 1) token = bytesBase64Decode(protocols[protocols.length - 1]);
      }

      customMetadata = await Promise.race([
        this.authCallback(token, request, this),
        interrupted,
      ]);
      if (cancelled || client.readyState !== WebSocket.OPEN || this.server !== connectionServer) return false;
      if (customMetadata !== false &&
          (customMetadata === null || typeof customMetadata !== 'object' ||
           ![Object.prototype, null].includes(Object.getPrototypeOf(customMetadata)))) {
        throw new Error('authCallback must return a plain object or false');
      }
    } catch (error) {
      if (!cancelled) this.log(`${error?.name ?? 'Error'}: ${error?.message ?? 'Authentication failed'}`, 'error');
      if (!cancelled && client.readyState === WebSocket.OPEN) {
        this.sendAuthFailed(client);
        if (timedOut) client.terminate();
        else client.close();
      }
      return false;
    } finally {
      clearTimeout(timer);
      client.removeListener?.('close', cancel);
      this.pendingAuth.delete(client);
    }

    if (customMetadata === false) {
      this.sendAuthFailed(client);
      client.close();
      return false;
    }

    this.createClientMetadata(client, customMetadata);
    this.log(`New client connected: ${this.clients.get(client)?.id}`);
    this.sendAuthSuccess(client);

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

  validateMessageSize(client, message) {
    if (Buffer.byteLength(message) > this.maxInputSize) {
      this.log(`Client ${this.clients.get(client)?.id} sent a message that is too large`, 'warn');
      client.close(1009, 'Message too large');
      return false;
    }
    return true;
  }

  onMessage(client, message) {
    if (!this.validateMessageSize(client, message)) return;
    this.broadcast(message.toString());
  }

  getClientSocket(id) {
    for (const [client, metadata] of this.clients.entries()) {
      if (metadata.id === id) return client;
    }
    return null;
  }

  broadcast(message) {
    for (const client of this.clients.keys()) {
      this.send(client, message);
    }
  }

  broadcastOthers(client, message) {
    for (const otherClient of this.clients.keys()) {
      if (otherClient !== client) this.send(otherClient, message);
    }
  }

  send(client, message) {
    if (client.readyState !== WebSocket.OPEN) return;
    if ((client.bufferedAmount ?? 0) + Buffer.byteLength(message) > this.maxBufferedAmount) {
      this.log(`Client ${this.clients.get(client)?.id} exceeded the outgoing buffer limit`, 'warn');
      client.terminate();
      return;
    }
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
