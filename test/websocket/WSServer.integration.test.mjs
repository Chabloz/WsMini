import { expect } from 'chai';
import sinon from 'sinon';
import WebSocket from 'ws';
import WSServer from '../../src/websocket/WSServer.mjs';
import { wait } from '../helpers/testUtils.mjs';

describe('WSServer Integration Tests', () => {
  let server;
  let sandbox;
  const TEST_PORT = 8765;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(async () => {
    if (server) {
      server.close();
      await wait(100); // Wait for server to close
    }
    sandbox.restore();
  });

  describe('Server Connection Lifecycle', () => {
    it('should accept client connections', (done) => {
      server = new WSServer({
        port: TEST_PORT,
        logLevel: 'none',
        authCallback: () => ({ role: 'user' })
      });

      // Mock the WebSocketServerOrigin to avoid actual server startup
      const mockWebSocketServer = {
        on: sandbox.spy(),
        close: sandbox.spy()
      };

      // Override the start method to use our mock
      server.start = function() {
        this.server = mockWebSocketServer;
        this.pingInterval = setInterval(() => {}, 1000);

        // Simulate connection event
        setTimeout(() => {
          const mockClient = {
            readyState: WebSocket.OPEN,
            isAlive: true,
            send: sandbox.spy(),
            close: sandbox.spy(),
            on: sandbox.spy(),
            ping: sandbox.spy(),
            terminate: sandbox.spy()
          };

          const mockRequest = {
            headers: { 'sec-websocket-protocol': '' }
          };

          this.onConnection(mockClient, mockRequest);

          expect(this.clients.size).to.equal(1);
          expect(this.clients.has(mockClient)).to.be.true;

          const metadata = this.clients.get(mockClient);
          expect(metadata).to.have.property('id');
          expect(metadata.role).to.equal('user');

          done();
        }, 10);
      };

      server.start();
    });

    it('should handle authentication failure', (done) => {
      server = new WSServer({
        port: TEST_PORT,
        logLevel: 'none',
        authCallback: () => false // Reject all connections
      });

      const mockClient = {
        readyState: WebSocket.OPEN,
        send: sandbox.spy(),
        close: sandbox.spy(),
        on: sandbox.spy()
      };

      const mockRequest = {
        headers: { 'sec-websocket-protocol': '' }
      };

      server.onConnection(mockClient, mockRequest);

      expect(mockClient.send).to.have.been.calledOnce;
      const payload = JSON.parse(mockClient.send.firstCall.args[0]);
      expect(payload).to.deep.equal({ action: 'auth-failed' });
      expect(mockClient.close).to.have.been.called;
      expect(server.clients.size).to.equal(0);

      done();
    });

    it('should handle authentication with token', (done) => {
      const authCallback = sandbox.spy((token) => {
        return token === 'valid-token' ? { userId: 'test-user' } : false;
      });

      server = new WSServer({
        port: TEST_PORT,
        logLevel: 'none',
        authCallback
      });

      const mockClient = {
        readyState: WebSocket.OPEN,
        send: sandbox.spy(),
        close: sandbox.spy(),
        on: sandbox.spy()
      };

      // Base64 encode the token
      const token = Buffer.from('valid-token').toString('base64');
      const mockRequest = {
        headers: { 'sec-websocket-protocol': `protocol1, ${token}` }
      };
      // atob is needed to decode the base64 token in the server
      global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
      global.TextDecoder = class {
        decode(bytes) {
          return Buffer.from(bytes).toString('utf8');
        }
      };
      server.onConnection(mockClient, mockRequest);

      expect(authCallback).to.have.been.calledWith('valid-token');
      expect(mockClient.send).to.have.been.calledOnce;
      const payload = JSON.parse(mockClient.send.firstCall.args[0]);
      expect(payload.action).to.equal('auth-success');
      expect(server.clients.size).to.equal(1);

      const metadata = server.clients.get(mockClient);
      expect(payload.id).to.equal(metadata.id);
      expect(metadata.userId).to.equal('test-user');

      done();
    });

    it('should handle authentication callback errors', (done) => {
      const authCallback = sandbox.spy(() => {
        throw new Error('Auth service down');
      });

      server = new WSServer({
        port: TEST_PORT,
        logLevel: 'none',
        authCallback
      });

      const logSpy = sandbox.spy(server, 'log');

      const mockClient = {
        readyState: WebSocket.OPEN,
        send: sandbox.spy(),
        close: sandbox.spy(),
        on: sandbox.spy()
      };

      const mockRequest = {
        headers: { 'sec-websocket-protocol': '' }
      };

      const result = server.onConnection(mockClient, mockRequest);

      expect(result).to.be.false;
      expect(logSpy).to.have.been.calledWith(
        sinon.match(/Error: Auth service down/),
        'error'
      );

      done();
    });
  });

  describe('Message Flow', () => {
    beforeEach(() => {
      server = new WSServer({
        port: TEST_PORT,
        logLevel: 'none'
      });
    });

    it('should broadcast messages between clients', () => {
      const client1 = {
        readyState: WebSocket.OPEN,
        send: sandbox.spy(),
        close: sandbox.spy(),
        on: sandbox.spy()
      };

      const client2 = {
        readyState: WebSocket.OPEN,
        send: sandbox.spy(),
        close: sandbox.spy(),
        on: sandbox.spy()
      };

      server.clients.set(client1, { id: '1' });
      server.clients.set(client2, { id: '2' });

      server.onMessage(client1, Buffer.from('Hello World'));

      expect(client1.send).to.have.been.calledWith('Hello World');
      expect(client2.send).to.have.been.calledWith('Hello World');
    });

    it('should handle client disconnection cleanup', () => {
      const client = {
        readyState: WebSocket.OPEN,
        send: sandbox.spy(),
        close: sandbox.spy(),
        on: sandbox.spy()
      };

      server.clients.set(client, { id: 'test-client' });
      expect(server.clients.size).to.equal(1);

      server.onClose(client);

      expect(server.clients.size).to.equal(0);
      expect(server.clients.has(client)).to.be.false;
    });
  });

  describe('Ping/Pong Mechanism', () => {
    beforeEach(() => {
      server = new WSServer({
        port: TEST_PORT,
        logLevel: 'none',
        pingTimeout: 100 // Short timeout for testing
      });
    });

    it('should mark clients as alive on pong', () => {
      const client = {
        readyState: WebSocket.OPEN,
        isAlive: false,
        send: sandbox.spy(),
        ping: sandbox.spy(),
        terminate: sandbox.spy()
      };

      server.clients.set(client, { id: 'test' });

      server.onPong(client);

      expect(client.isAlive).to.be.true;
    });

    it('should ping clients and mark them as potentially dead', () => {
      const client = {
        readyState: WebSocket.OPEN,
        isAlive: true,
        send: sandbox.spy(),
        ping: sandbox.spy(),
        terminate: sandbox.spy()
      };

      server.clients.set(client, { id: 'test' });

      server.pingManagement();

      expect(client.ping).to.have.been.called;
      expect(client.isAlive).to.be.false;
    });

    it('should terminate unresponsive clients', () => {
      const client = {
        readyState: WebSocket.OPEN,
        isAlive: false,
        send: sandbox.spy(),
        ping: sandbox.spy(),
        terminate: sandbox.spy()
      };

      server.clients.set(client, { id: 'test' });

      server.pingManagement();

      expect(client.terminate).to.have.been.called;
      expect(server.clients.has(client)).to.be.false;
    });
  });
});
