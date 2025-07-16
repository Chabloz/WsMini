import { expect } from 'chai';
import sinon from 'sinon';
import WebSocketServerOrigin from '../../src/websocket/WebSocketServerOrigin.mjs';
import { createMockRequest } from '../helpers/testUtils.mjs';

describe('WebSocketServerOrigin', () => {
  let server;
  let mockSocket;
  let mockCallback;

  beforeEach(() => {
    mockSocket = {
      write: sinon.spy(),
      destroy: sinon.spy()
    };
    mockCallback = sinon.spy();
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
    sinon.restore();
  });

  describe('Constructor', () => {
    it('should create server with valid origins array', () => {
      const options = {
        origins: ['http://localhost:3000', 'https://example.com'],
        maxNbOfClients: 10,
        noServer: true // Prevent actual server startup
      };

      server = new WebSocketServerOrigin(options);
      expect(server.options.origins).to.deep.equal(['http://localhost:3000', 'https://example.com']);
      expect(server.options.maxNbOfClients).to.equal(10);
    });

    it('should create server with single origin string', () => {
      const options = {
        origins: 'http://localhost:3000',
        maxNbOfClients: 10,
        noServer: true // Prevent actual server startup
      };

      server = new WebSocketServerOrigin(options);
      expect(server.options.origins).to.deep.equal(['http://localhost:3000']);
    });

    it('should throw error when origins option is missing', () => {
      const options = {
        maxNbOfClients: 10,
        noServer: true
      };

      expect(() => new WebSocketServerOrigin(options)).to.throw('Missing origins option');
    });

    it('should throw error when origins option is invalid type', () => {
      const options = {
        origins: 123,
        maxNbOfClients: 10,
        noServer: true
      };

      expect(() => new WebSocketServerOrigin(options)).to.throw('Invalid origins option');
    });

    it('should throw error when origins option is null', () => {
      const options = {
        origins: null,
        maxNbOfClients: 10,
        noServer: true
      };

      expect(() => new WebSocketServerOrigin(options)).to.throw('Missing origins option');
    });

    it('should throw error when maxNbOfClients option is missing', () => {
      const options = {
        origins: ['http://localhost:3000'],
        noServer: true
      };

      expect(() => new WebSocketServerOrigin(options)).to.throw('Missing maxNbOfClients option');
    });

    it('should throw error when maxNbOfClients is not an integer', () => {
      const options = {
        origins: ['http://localhost:3000'],
        maxNbOfClients: 'invalid',
        noServer: true
      };

      expect(() => new WebSocketServerOrigin(options)).to.throw('Invalid maxNbOfClients option');
    });

    it('should throw error when maxNbOfClients is zero', () => {
      const options = {
        origins: ['http://localhost:3000'],
        maxNbOfClients: 0,
        noServer: true
      };

      expect(() => new WebSocketServerOrigin(options)).to.throw('Missing maxNbOfClients option');
    });

    it('should throw error when maxNbOfClients is negative', () => {
      const options = {
        origins: ['http://localhost:3000'],
        maxNbOfClients: -1,
        noServer: true
      };

      expect(() => new WebSocketServerOrigin(options)).to.throw('Invalid maxNbOfClients option');
    });

    it('should throw error when maxNbOfClients is float', () => {
      const options = {
        origins: ['http://localhost:3000'],
        maxNbOfClients: 10.5,
        noServer: true
      };

      expect(() => new WebSocketServerOrigin(options)).to.throw('Invalid maxNbOfClients option');
    });
  });

  describe('handleUpgrade', () => {
    beforeEach(() => {
      server = new WebSocketServerOrigin({
        origins: ['http://localhost:3000', 'https://example.com'],
        maxNbOfClients: 2,
        noServer: true // Prevent actual server startup
      });

      // Mock the parent handleUpgrade method
      sinon.stub(Object.getPrototypeOf(WebSocketServerOrigin.prototype), 'handleUpgrade').returns('parent-result');
    });

    it('should reject request with invalid origin', () => {
      const request = createMockRequest({
        headers: { origin: 'http://malicious.com' }
      });

      const result = server.handleUpgrade(request, mockSocket, Buffer.from(''), mockCallback);

      expect(mockSocket.write).to.have.been.calledWith('HTTP/1.1 403 Forbidden\r\n\r\n');
      expect(mockSocket.destroy).to.have.been.called;
      expect(result).to.be.undefined;
    });

    it('should reject request with no origin header', () => {
      const request = createMockRequest({
        headers: {}
      });

      // Set up server to not allow empty origins
      server.options.origins = ['http://localhost:3000']; // No wildcard

      const result = server.handleUpgrade(request, mockSocket, Buffer.from(''), mockCallback);

      expect(mockSocket.write).to.have.been.calledWith('HTTP/1.1 403 Forbidden\r\n\r\n');
      expect(mockSocket.destroy).to.have.been.called;
      expect(result).to.be.undefined;
    });

    it('should reject request when server is full', () => {
      const request = createMockRequest({
        headers: { origin: 'http://localhost:3000' }
      });

      // Mock clients to be at capacity
      server.clients = new Set(['client1', 'client2']);

      const result = server.handleUpgrade(request, mockSocket, Buffer.from(''), mockCallback);

      expect(mockSocket.write).to.have.been.calledWith('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      expect(mockSocket.destroy).to.have.been.called;
      expect(result).to.be.undefined;
    });

    it('should call parent handleUpgrade with valid origin and available capacity', () => {
      const request = createMockRequest({
        headers: { origin: 'http://localhost:3000' }
      });

      // Mock clients to be under capacity
      server.clients = new Set(['client1']);

      const result = server.handleUpgrade(request, mockSocket, Buffer.from(''), mockCallback);

      expect(mockSocket.write).to.not.have.been.called;
      expect(mockSocket.destroy).to.not.have.been.called;
      expect(Object.getPrototypeOf(WebSocketServerOrigin.prototype).handleUpgrade)
        .to.have.been.calledWith(request, mockSocket, Buffer.from(''), mockCallback);
      expect(result).to.equal('parent-result');
    });

    it('should handle undefined origin header', () => {
      const request = createMockRequest({
        headers: { origin: undefined }
      });

      // Set up server to allow empty origins
      server.options.origins = ['*'];

      const result = server.handleUpgrade(request, mockSocket, Buffer.from(''), mockCallback);

      expect(mockSocket.write).to.not.have.been.called;
      expect(mockSocket.destroy).to.not.have.been.called;
      expect(Object.getPrototypeOf(WebSocketServerOrigin.prototype).handleUpgrade)
        .to.have.been.calledWith(request, mockSocket, Buffer.from(''), mockCallback);
    });
  });

  describe('checkOrigin', () => {
    beforeEach(() => {
      server = new WebSocketServerOrigin({
        origins: ['http://localhost:3000', 'https://example.com', 'http://localhost:8080'],
        maxNbOfClients: 10,
        noServer: true // Prevent actual server startup
      });
    });

    it('should return true for exact origin match', () => {
      console.log('Server origins:', server.options.origins);
      console.log('Test 1:', server.checkOrigin('http://localhost:3000'));
      console.log('Test 2:', server.checkOrigin('https://example.com'));
      console.log('Test 3:', server.checkOrigin('http://localhost:8080'));

      expect(server.checkOrigin('http://localhost:3000')).to.be.true;
      expect(server.checkOrigin('https://example.com')).to.be.true;
      expect(server.checkOrigin('http://localhost:8080')).to.be.true;
    });

    it('should return false for non-matching origin', () => {
      expect(server.checkOrigin('http://malicious.com')).to.be.false;
      expect(server.checkOrigin('https://different.com')).to.be.false;
    });

    it('should return true for wildcard origin', () => {
      server.options.origins = ['*'];
      expect(server.checkOrigin('http://any.com')).to.be.true;
      expect(server.checkOrigin('https://any.com')).to.be.true;
      expect(server.checkOrigin('')).to.be.true;
    });

    it('should handle empty origin string', () => {
      expect(server.checkOrigin('')).to.be.false;
    });

    it('should handle undefined origin', () => {
      expect(server.checkOrigin(undefined)).to.be.false;
    });

    it('should handle null origin', () => {
      expect(server.checkOrigin(null)).to.be.false;
    });

    it('should match origin without protocol when allowed origin has no protocol', () => {
      server.options.origins = ['localhost:3000'];
      expect(server.checkOrigin('http://localhost:3000')).to.be.true;
      expect(server.checkOrigin('https://localhost:3000')).to.be.true;
      // ws:// protocol is not stripped, so it won't match
      expect(server.checkOrigin('ws://localhost:3000')).to.be.false;
    });

    it('should match origin without port when allowed origin has no port', () => {
      server.options.origins = ['http://localhost'];
      expect(server.checkOrigin('http://localhost:3000')).to.be.true;
      expect(server.checkOrigin('http://localhost:8080')).to.be.true;
      expect(server.checkOrigin('http://localhost:80')).to.be.true;
    });

    it('should match origin without protocol and port when allowed origin has neither', () => {
      server.options.origins = ['localhost'];
      expect(server.checkOrigin('http://localhost:3000')).to.be.true;
      expect(server.checkOrigin('https://localhost:8080')).to.be.true;
      // ws:// protocol is not stripped, so it won't match
      expect(server.checkOrigin('ws://localhost')).to.be.false;
    });

    it('should not match different hostname even without protocol/port', () => {
      server.options.origins = ['localhost'];
      expect(server.checkOrigin('http://different.com:3000')).to.be.false;
      expect(server.checkOrigin('https://example.com')).to.be.false;
    });

    it('should match exact origin when allowed origin has protocol but no port', () => {
      server.options.origins = ['http://localhost'];
      expect(server.checkOrigin('http://localhost:3000')).to.be.true;
      expect(server.checkOrigin('https://localhost:3000')).to.be.false; // Different protocol
    });

    it('should handle multiple allowed origins with different formats', () => {
      server.options.origins = ['*', 'http://localhost:3000', 'example.com', 'ws://secure.com:8080'];

      expect(server.checkOrigin('http://any.com')).to.be.true; // Wildcard
      expect(server.checkOrigin('http://localhost:3000')).to.be.true; // Exact match
      expect(server.checkOrigin('https://example.com:8080')).to.be.true; // Domain without protocol/port
      expect(server.checkOrigin('ws://secure.com:8080')).to.be.true; // Exact match with protocol and port
    });

    it('should handle origin with trailing slash', () => {
      server.options.origins = ['http://localhost:3000'];
      expect(server.checkOrigin('http://localhost:3000/')).to.be.false; // Should not match with trailing slash
    });

    it('should handle origin with path', () => {
      server.options.origins = ['http://localhost:3000'];
      expect(server.checkOrigin('http://localhost:3000/path')).to.be.false; // Should not match with path
    });

    it('should handle complex port matching scenarios', () => {
      server.options.origins = ['localhost:3000'];
      expect(server.checkOrigin('http://localhost:3000')).to.be.true;
      expect(server.checkOrigin('https://localhost:3000')).to.be.true;
      // ws:// protocol is not stripped, so it won't match
      expect(server.checkOrigin('ws://localhost:3000')).to.be.false;
      expect(server.checkOrigin('wss://localhost:3000')).to.be.false;
      expect(server.checkOrigin('localhost:3000')).to.be.true;
    });

    it('should handle protocol-specific matching', () => {
      server.options.origins = ['http://localhost:3000'];
      expect(server.checkOrigin('http://localhost:3000')).to.be.true;
      expect(server.checkOrigin('https://localhost:3000')).to.be.false; // Different protocol
      expect(server.checkOrigin('ws://localhost:3000')).to.be.false; // Different protocol
    });
  });
});
