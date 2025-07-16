import { expect } from 'chai';
import sinon from 'sinon';
import WebSocket from 'ws';

/**
 * Helper function to create a mock WebSocket client
 */
export function createMockClient(options = {}) {
  return {
    readyState: options.readyState || WebSocket.OPEN,
    isAlive: options.isAlive !== undefined ? options.isAlive : true,
    send: sinon.spy(),
    close: sinon.spy(),
    terminate: sinon.spy(),
    ping: sinon.spy(),
    on: sinon.spy(),
    ...options
  };
}

/**
 * Helper function to create a mock request object
 */
export function createMockRequest(options = {}) {
  return {
    headers: {
      'sec-websocket-protocol': options.protocol || '',
      ...options.headers
    },
    url: options.url || '/',
    method: options.method || 'GET',
    ...options
  };
}

/**
 * Helper function to create a mock logger
 */
export function createMockLogger() {
  return {
    info: sinon.spy(),
    error: sinon.spy(),
    warn: sinon.spy(),
    debug: sinon.spy(),
    log: sinon.spy()
  };
}

/**
 * Helper function to wait for async operations
 */
export function wait(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper function to create a test server with common configuration
 */
export async function createTestServer(options = {}) {
  const defaultOptions = {
    port: 8080 + Math.floor(Math.random() * 1000), // Random port to avoid conflicts
    logLevel: 'none', // Suppress logs during tests
    ...options
  };

  const WSServer = (await import('../../src/websocket/WSServer.mjs')).default;
  return new WSServer(defaultOptions);
}

// Common assertions
export const assertions = {
  /**
   * Assert that a client has specific metadata
   */
  hasClientMetadata(server, client, expectedMetadata) {
    expect(server.clients.has(client)).to.be.true;
    const metadata = server.clients.get(client);

    Object.keys(expectedMetadata).forEach(key => {
      expect(metadata).to.have.property(key, expectedMetadata[key]);
    });
  },

  /**
   * Assert that a message was sent to a client
   */
  messageSent(client, expectedMessage) {
    expect(client.send).to.have.been.calledWith(expectedMessage);
  },

  /**
   * Assert that a client was closed
   */
  clientClosed(client) {
    expect(client.close).to.have.been.called;
  }
};
