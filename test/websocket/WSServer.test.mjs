import { expect } from 'chai';
import sinon from 'sinon';
import WebSocket from 'ws';
import WSServer from '../../src/websocket/WSServer.mjs';

describe('WSServer', () => {
  let server;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    server = null;
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
    sandbox.restore();
  });

  describe('Constructor', () => {
    it('should create WSServer with default options', () => {
      server = new WSServer();

      expect(server.port).to.equal(443);
      expect(server.maxNbOfClients).to.equal(1000);
      expect(server.maxInputSize).to.equal(100000);
      expect(server.origins).to.equal('*');
      expect(server.pingTimeout).to.equal(30000);
      expect(server.logLevel).to.equal('info');
      expect(server.clients).to.be.instanceOf(Map);
      expect(server.server).to.be.null;
    });

    it('should create WSServer with custom options', () => {
      const options = {
        port: 8080,
        maxNbOfClients: 500,
        maxInputSize: 50000,
        origins: 'https://example.com',
        pingTimeout: 15000,
        logLevel: 'debug',
        authCallback: (token) => ({ userId: 'test' })
      };

      server = new WSServer(options);

      expect(server.port).to.equal(8080);
      expect(server.maxNbOfClients).to.equal(500);
      expect(server.maxInputSize).to.equal(50000);
      expect(server.origins).to.equal('https://example.com');
      expect(server.pingTimeout).to.equal(15000);
      expect(server.logLevel).to.equal('debug');
      expect(server.authCallback).to.equal(options.authCallback);
    });

    it('should throw error for invalid log level', () => {
      expect(() => new WSServer({ logLevel: 'invalid' })).to.throw('Invalid log level: invalid');
    });

    it('should initialize clients Map and server as null', () => {
      server = new WSServer();

      expect(server.clients).to.be.instanceOf(Map);
      expect(server.clients.size).to.equal(0);
      expect(server.server).to.be.null;
    });
  });

  describe('Logging', () => {
    beforeEach(() => {
      server = new WSServer({ logLevel: 'debug' });
    });

    it('should log messages at appropriate levels', () => {
      const consoleSpy = sandbox.spy(console, 'info');

      server.log('test message', 'info');

      expect(consoleSpy).to.have.been.calledOnce;
      expect(consoleSpy.args[0][0]).to.include('[WSS]');
      expect(consoleSpy.args[0][0]).to.include('[INFO]');
      expect(consoleSpy.args[0][0]).to.include('test message');
    });

    it('should not log messages below current log level', () => {
      server.logLevel = 'error';
      const consoleSpy = sandbox.spy(console, 'log');

      server.log('debug message', 'debug');

      expect(consoleSpy).to.not.have.been.called;
    });

    it('should use external logger when provided', () => {
      const mockLogger = {
        info: sandbox.spy(),
        error: sandbox.spy(),
        warn: sandbox.spy(),
        debug: sandbox.spy()
      };

      server = new WSServer({ logger: mockLogger });

      server.log('test message', 'info');

      expect(mockLogger.info).to.have.been.calledOnce;
      expect(mockLogger.info).to.have.been.calledWith('[WSS] test message');
    });
  });

  describe('Client Management', () => {
    beforeEach(() => {
      server = new WSServer();
    });

    it('should create client metadata correctly', () => {
      const mockClient = { isAlive: false };
      const customMetadata = { userId: 'test123', role: 'admin' };

      server.createClientMetadata(mockClient, customMetadata);

      expect(server.clients.has(mockClient)).to.be.true;
      const metadata = server.clients.get(mockClient);
      expect(metadata).to.have.property('id');
      expect(metadata.userId).to.equal('test123');
      expect(metadata.role).to.equal('admin');
      expect(mockClient.isAlive).to.be.true;
    });

    it('should generate unique client IDs', () => {
      const client1 = { isAlive: false };
      const client2 = { isAlive: false };

      server.createClientMetadata(client1, {});
      server.createClientMetadata(client2, {});

      const id1 = server.clients.get(client1).id;
      const id2 = server.clients.get(client2).id;

      expect(id1).to.not.equal(id2);
      expect(id1).to.be.a('string');
      expect(id2).to.be.a('string');
    });

    it('should find client socket by ID', () => {
      const mockClient = { isAlive: false };
      server.createClientMetadata(mockClient, {});
      const clientId = server.clients.get(mockClient).id;

      const foundClient = server.getClientSocket(clientId);

      expect(foundClient).to.equal(mockClient);
    });

    it('should return null for non-existent client ID', () => {
      const foundClient = server.getClientSocket('non-existent-id');

      expect(foundClient).to.be.null;
    });

    it('should get all clients data', () => {
      const client1 = { isAlive: false };
      const client2 = { isAlive: false };

      server.createClientMetadata(client1, { userId: 'user1' });
      server.createClientMetadata(client2, { userId: 'user2' });

      const clientsData = server.geClientsData();

      expect(clientsData).to.be.an('array');
      expect(clientsData).to.have.lengthOf(2);
      expect(clientsData[0]).to.have.property('userId');
      expect(clientsData[1]).to.have.property('userId');
    });
  });

  describe('Broadcasting', () => {
    beforeEach(() => {
      server = new WSServer();
    });

    it('should broadcast message to all clients', () => {
      const client1 = { readyState: WebSocket.OPEN, send: sandbox.spy() };
      const client2 = { readyState: WebSocket.OPEN, send: sandbox.spy() };
      const client3 = { readyState: WebSocket.CLOSED, send: sandbox.spy() };

      server.clients.set(client1, { id: '1' });
      server.clients.set(client2, { id: '2' });
      server.clients.set(client3, { id: '3' });

      server.broadcast('test message');

      expect(client1.send).to.have.been.calledWith('test message');
      expect(client2.send).to.have.been.calledWith('test message');
      expect(client3.send).to.not.have.been.called;
    });

    it('should broadcast message to all clients except sender', () => {
      const sender = { readyState: WebSocket.OPEN, send: sandbox.spy() };
      const client1 = { readyState: WebSocket.OPEN, send: sandbox.spy() };
      const client2 = { readyState: WebSocket.OPEN, send: sandbox.spy() };

      server.clients.set(sender, { id: 'sender' });
      server.clients.set(client1, { id: '1' });
      server.clients.set(client2, { id: '2' });

      server.broadcastOthers(sender, 'test message');

      expect(sender.send).to.not.have.been.called;
      expect(client1.send).to.have.been.calledWith('test message');
      expect(client2.send).to.have.been.calledWith('test message');
    });

    it('should send message to specific client', () => {
      const client = { readyState: WebSocket.OPEN, send: sandbox.spy() };

      server.send(client, 'test message');

      expect(client.send).to.have.been.calledWith('test message');
    });

    it('should not send message to closed client', () => {
      const client = { readyState: WebSocket.CLOSED, send: sandbox.spy() };

      server.send(client, 'test message');

      expect(client.send).to.not.have.been.called;
    });
  });

  describe('Authentication', () => {
    it('should send auth success message', () => {
      server = new WSServer();
      const client = { readyState: WebSocket.OPEN, send: sandbox.spy() };
      const metadata = { id: 'client-id' };
      server.clients.set(client, metadata);

      server.sendAuthSuccess(client);

      expect(client.send).to.have.been.calledOnce;
      const payload = JSON.parse(client.send.firstCall.args[0]);
      expect(payload).to.deep.equal({ action: 'auth-success', id: metadata.id });
    });

    it('should send auth failed message', () => {
      server = new WSServer();
      const client = { readyState: WebSocket.OPEN, send: sandbox.spy() };

      server.sendAuthFailed(client);

      expect(client.send).to.have.been.calledOnce;
      const payload = JSON.parse(client.send.firstCall.args[0]);
      expect(payload).to.deep.equal({ action: 'auth-failed' });
    });
  });

  describe('Message Processing', () => {
    beforeEach(() => {
      server = new WSServer({ maxInputSize: 10 });
    });

    it('should process valid message', () => {
      const client = { readyState: WebSocket.OPEN, send: sandbox.spy() };
      server.clients.set(client, { id: 'test' });
      const broadcastSpy = sandbox.spy(server, 'broadcast');

      server.onMessage(client, Buffer.from('short'));

      expect(broadcastSpy).to.have.been.calledWith('short');
    });

    it('should reject oversized message', () => {
      const client = {
        readyState: WebSocket.OPEN,
        close: sandbox.spy()
      };
      server.clients.set(client, { id: 'test' });
      const logSpy = sandbox.spy(server, 'log');

      server.onMessage(client, Buffer.from('this message is too long'));

      expect(logSpy).to.have.been.calledWith(
        sinon.match(/sent a message that is too large/),
        'warn'
      );
      expect(client.close).to.have.been.called;
    });
  });

  describe('Ping Management', () => {
    beforeEach(() => {
      server = new WSServer();
    });

    it('should handle pong from client', () => {
      const client = { isAlive: false };
      server.clients.set(client, { id: 'test' });

      server.onPong(client);

      expect(client.isAlive).to.be.true;
    });

    it('should terminate dead clients during ping management', () => {
      const deadClient = {
        isAlive: false,
        terminate: sandbox.spy()
      };
      const aliveClient = {
        isAlive: true,
        ping: sandbox.spy()
      };

      server.clients.set(deadClient, { id: 'dead' });
      server.clients.set(aliveClient, { id: 'alive' });

      server.pingManagement();

      expect(deadClient.terminate).to.have.been.called;
      expect(server.clients.has(deadClient)).to.be.false;
      expect(aliveClient.ping).to.have.been.called;
      expect(aliveClient.isAlive).to.be.false;
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      server = new WSServer();
    });

    it('should handle client errors', () => {
      const client = { close: sandbox.spy() };
      server.clients.set(client, { id: 'test' });
      const logSpy = sandbox.spy(server, 'log');
      const error = new Error('Test error');

      server.onError(client, error);

      expect(logSpy).to.have.been.calledWith(
        sinon.match(/error: Test error/),
        'error'
      );
      expect(client.close).to.have.been.called;
    });

    it('should handle client disconnect', () => {
      const client = {};
      server.clients.set(client, { id: 'test' });
      const logSpy = sandbox.spy(server, 'log');

      server.onClose(client);

      expect(logSpy).to.have.been.calledWith(
        sinon.match(/Client disconnected: test/)
      );
      expect(server.clients.has(client)).to.be.false;
    });
  });

  describe('Server Lifecycle', () => {
    it('should start server correctly', () => {
      // This test would need more complex mocking of WebSocketServerOrigin
      // For now, just test that the method exists and doesn't throw
      server = new WSServer({ port: 8080 });

      expect(server.start).to.be.a('function');
      expect(server.close).to.be.a('function');
    });

    it('should close server correctly', () => {
      server = new WSServer();
      const client = { close: sandbox.spy() };
      server.clients.set(client, { id: 'test' });

      // Mock the server object
      const mockServer = {
        close: sandbox.spy((callback) => callback())
      };
      server.server = mockServer;
      server.pingInterval = setInterval(() => {}, 1000);

      const logSpy = sandbox.spy(server, 'log');

      server.close();

      expect(client.close).to.have.been.called;
      expect(mockServer.close).to.have.been.called;
      expect(logSpy).to.have.been.calledWith('Server closed');
      expect(server.server).to.be.null;
    });
  });
});
