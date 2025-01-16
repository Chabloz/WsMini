import  { WebSocketServer } from 'ws';

export default class WebSocketServerOrigin extends WebSocketServer {

  constructor(options, callback) {
    super(options, callback);
    if (!this.options?.origins) {
      throw new Error('Missing origins option');
    }
    if (typeof this.options.origins !== 'string' && !Array.isArray(this.options.origins)) {
      throw new Error('Invalid origins option');
    }
    if (typeof this.options.origins === 'string') {
      this.options.origins = [this.options.origins];
    }
    // Max clients
    if (!this.options?.maxNbOfClients) {
      throw new Error('Missing maxNbOfClients option');
    }
    // Must be a int greater than 0
    if (!Number.isInteger(this.options.maxNbOfClients) || this.options.maxNbOfClients <= 0) {
      throw new Error('Invalid maxNbOfClients option');
    }
  }

  log(message) {
    if (!this.options?.verbose) return;
    console.log(`[WSS] ${message}`);
  }

  handleUpgrade(request, socket, head, callback) {
    // Validate origin
    if (!this.checkOrigin(request.headers?.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    // Check if server is full
    if (this.clients.size >= this.options.maxNbOfClients) {
      this.log('Server is full');
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    return super.handleUpgrade(request, socket, head, callback);
  }

  checkOrigin(origin) {
    for (const allowedOrigin of this.options.origins) {
      if (allowedOrigin === '*') return true;
      if (!allowedOrigin.startsWith('http')) { // if allowedOrigin accept any protocol
        origin = origin.replace(/(https?:\/\/)?/, '');
      }
      if (!allowedOrigin.match(/:\d+$/)) { // if allowedOrigin accept any port
        origin = origin.replace(/:\d+$/, '');
      }
      if (origin === allowedOrigin) return true;
    }
    return false;
  }

}