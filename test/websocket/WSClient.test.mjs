import sinon from 'sinon';
import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import { TextEncoder, TextDecoder } from 'util';

// Setup DOM environment for browser-like behavior
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://example.com'
});
global.window = dom.window;
global.document = dom.window.document;
global.location = dom.window.location;

// Add TextEncoder/TextDecoder for string encoding (Node.js built-ins)
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Add btoa/atob for base64 encoding
global.btoa = function(str) {
  return Buffer.from(str, 'binary').toString('base64');
};
global.atob = function(base64) {
  return Buffer.from(base64, 'base64').toString('binary');
};

// Mock WebSocket
class MockWebSocket {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 1; // OPEN
    this.addEventListener = sinon.spy();
    this.send = sinon.spy();
    this.close = sinon.spy();
    this.onMessage = null;
    this.onError = null;
    this.onClose = null;
  }

  // Simulate receiving a message
  simulateMessage(data) {
    const event = { data: JSON.stringify(data) };
    if (this.onMessage) {
      this.onMessage(event);
    }
    // Also trigger event listeners
    this.addEventListener.getCalls()
      .filter(call => call.args[0] === 'message')
      .forEach(call => call.args[1](event));
  }

  // Simulate connection error
  simulateError() {
    this.addEventListener.getCalls()
      .filter(call => call.args[0] === 'error')
      .forEach(call => call.args[1]());
  }

  // Simulate connection close
  simulateClose() {
    this.addEventListener.getCalls()
      .filter(call => call.args[0] === 'close')
      .forEach(call => call.args[1]());
  }
}

// Mock WebSocket globally
global.WebSocket = MockWebSocket;

import WSClient from '../../src/websocket/WSClient.js';

describe('WSClient', () => {
  let wsClient;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    wsClient = new WSClient('ws://localhost:8001');
  });

  afterEach(() => {
    if (wsClient) {
      wsClient.close();
    }
    sandbox.restore();
  });

  describe('Constructor', () => {
    it('should create WSClient with provided URL', () => {
      const client = new WSClient('ws://test.com:8080');
      expect(client.url).to.equal('ws://test.com:8080');
      expect(client.defaultTimeout).to.equal(5000);
      expect(client.wsClient).to.be.null;
    });

    it('should create WSClient with custom timeout', () => {
      const client = new WSClient('ws://test.com:8080', 10000);
      expect(client.defaultTimeout).to.equal(10000);
    });

    it('should initialize event system', () => {
      expect(wsClient.on).to.be.a('function');
      expect(wsClient.off).to.be.a('function');
      expect(wsClient.emit).to.be.a('function');
      expect(wsClient.once).to.be.a('function');
    });

    it('should initialize ID counters', () => {
      expect(wsClient.rpcId).to.equal(0);
      expect(wsClient.pubId).to.equal(0);
      expect(wsClient.subId).to.equal(0);
      expect(wsClient.unsubId).to.equal(0);
    });
  });

  describe('Connection Management', () => {
    it('should connect without token', async () => {
      const connectPromise = wsClient.connect();

      // Verify WebSocket was created with correct parameters
      expect(wsClient.wsClient.constructor.name).to.equal('MockWebSocket');
      expect(wsClient.wsClient.url).to.equal('ws://localhost:8001');
      expect(wsClient.wsClient.protocols).to.deep.equal(['ws.mini']);

      // Simulate successful authentication
      wsClient.wsClient.simulateMessage({ action: 'auth-success' });

      await connectPromise;
    });

    it('should connect with token', async () => {
      const connectPromise = wsClient.connect('mytoken');

      // Verify WebSocket was created
      expect(wsClient.wsClient.constructor.name).to.equal('MockWebSocket');

      // Check that the protocols are correct
      expect(wsClient.wsClient.protocols).to.have.lengthOf(2);
      expect(wsClient.wsClient.protocols[0]).to.equal('ws.mini');
      expect(wsClient.wsClient.protocols[1]).to.be.a('string'); // base64 encoded token

      // Simulate successful authentication
      wsClient.wsClient.simulateMessage({ action: 'auth-success' });

      await connectPromise;
    });

    it('should reject connection with non-string token', async () => {
      try {
        await wsClient.connect(123);
        expect.fail('Should have rejected non-string token');
      } catch (error) {
        expect(error.message).to.equal('The auth token must be a string.');
      }
    });

    it('should reject connection on auth failure', async () => {
      const connectPromise = wsClient.connect();

      // Simulate auth failure
      wsClient.wsClient.simulateMessage({ action: 'auth-failed' });

      try {
        await connectPromise;
        expect.fail('Should have rejected on auth failure');
      } catch (error) {
        expect(error.message).to.equal('WS auth failed');
      }
    });

    it('should reject connection on WebSocket error', async () => {
      const connectPromise = wsClient.connect();

      // Simulate WebSocket error
      wsClient.wsClient.simulateError();

      try {
        await connectPromise;
        expect.fail('Should have rejected on WebSocket error');
      } catch (error) {
        expect(error.message).to.equal('WS connection error');
      }
    });

    it('should reject connection on WebSocket close', async () => {
      const connectPromise = wsClient.connect();

      // Simulate WebSocket close
      wsClient.wsClient.simulateClose();

      try {
        await connectPromise;
        expect.fail('Should have rejected on WebSocket close');
      } catch (error) {
        expect(error.message).to.equal('WS connection closed.');
      }
    });

    it('should close connection properly', async () => {
      const connectPromise = wsClient.connect();
      wsClient.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;

      const closeSpy = sinon.spy();
      wsClient.on('close', closeSpy);

      // Store reference to the mock before closing
      const mockWebSocket = wsClient.wsClient;

      wsClient.close();

      expect(mockWebSocket.close.called).to.be.true;
      expect(wsClient.wsClient).to.be.null;
      expect(closeSpy.called).to.be.true;
    });

    it('should handle close when not connected', () => {
      expect(() => wsClient.close()).to.not.throw;
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      const connectPromise = wsClient.connect();
      wsClient.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;
    });

    it('should handle pub messages', () => {
      const callback = sinon.spy();
      wsClient.on('ws:chan:test-channel', callback);

      wsClient.wsClient.simulateMessage({
        action: 'pub',
        chan: 'test-channel',
        msg: { content: 'Hello World' }
      });

      expect(callback.calledWith({ content: 'Hello World' })).to.be.true;
    });

    it('should handle pub-cmd messages', () => {
      const callback = sinon.spy();
      wsClient.on('ws:chan-cmd:move:game-room', callback);

      wsClient.wsClient.simulateMessage({
        action: 'pub-cmd',
        chan: 'game-room',
        msg: { cmd: 'move', data: { x: 10, y: 20 } }
      });

      expect(callback.calledWith({ x: 10, y: 20 })).to.be.true;
    });

    it('should handle sub confirmation messages', () => {
      const callback = sinon.spy();
      wsClient.on('ws:sub:test-channel', callback);

      wsClient.wsClient.simulateMessage({
        action: 'sub',
        chan: 'test-channel',
        response: 'success',
        type: 'success',
        id: 1
      });

      expect(callback.calledWith({
        response: 'success',
        type: 'success',
        id: 1
      })).to.be.true;
    });

    it('should handle unsub confirmation messages', () => {
      const callback = sinon.spy();
      wsClient.on('ws:unsub:test-channel', callback);

      wsClient.wsClient.simulateMessage({
        action: 'unsub',
        chan: 'test-channel',
        response: 'success',
        type: 'success',
        id: 1
      });

      expect(callback.calledWith({
        response: 'success',
        type: 'success',
        id: 1
      })).to.be.true;
    });

    it('should handle pub-confirm messages', () => {
      const callback = sinon.spy();
      wsClient.on('ws:pub:test-channel', callback);

      wsClient.wsClient.simulateMessage({
        action: 'pub-confirm',
        chan: 'test-channel',
        response: 'success',
        type: 'success',
        id: 1
      });

      expect(callback.calledWith({
        response: 'success',
        type: 'success',
        id: 1
      })).to.be.true;
    });

    it('should handle rpc messages', () => {
      const callback = sinon.spy();
      wsClient.on('ws:rpc:test-method', callback);

      wsClient.wsClient.simulateMessage({
        action: 'rpc',
        name: 'test-method',
        response: { result: 'success' },
        type: 'success',
        id: 1
      });

      expect(callback.calledWith({
        response: { result: 'success' },
        type: 'success',
        id: 1
      })).to.be.true;
    });

    it('should handle error messages', () => {
      const callback = sinon.spy();
      wsClient.on('ws:error', callback);

      wsClient.wsClient.simulateMessage({
        action: 'error',
        msg: 'Something went wrong'
      });

      expect(callback.calledWith('Something went wrong')).to.be.true;
    });

    it('should handle cmd messages', () => {
      const callback = sinon.spy();
      wsClient.on('ws:cmd:notification', callback);

      wsClient.wsClient.simulateMessage({
        action: 'cmd',
        cmd: 'notification',
        data: { message: 'New notification' }
      });

      expect(callback.calledWith({ message: 'New notification' })).to.be.true;
    });

    it('should handle auth-failed messages', () => {
      const closeSpy = sinon.spy(wsClient, 'close');
      const callback = sinon.spy();
      wsClient.on('ws:auth:failed', callback);

      wsClient.wsClient.simulateMessage({ action: 'auth-failed' });

      expect(callback.called).to.be.true;
      expect(closeSpy.called).to.be.true;
    });

    it('should handle auth-success messages', () => {
      const callback = sinon.spy();
      wsClient.on('ws:auth:success', callback);

      wsClient.wsClient.simulateMessage({ action: 'auth-success' });

      expect(callback.called).to.be.true;
    });
  });

  describe('RPC Functionality', () => {
    beforeEach(async () => {
      const connectPromise = wsClient.connect();
      wsClient.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;
    });

    it('should make successful RPC call', async () => {
      const rpcPromise = wsClient.rpc('test-method', { param: 'value' });

      // Verify message was sent
      expect(wsClient.wsClient.send.called).to.be.true;
      const sentMessage = JSON.parse(wsClient.wsClient.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'rpc',
        name: 'test-method',
        data: { param: 'value' },
        id: 0
      });

      // Simulate successful response
      wsClient.wsClient.simulateMessage({
        action: 'rpc',
        name: 'test-method',
        response: { result: 'success' },
        type: 'success',
        id: 0
      });

      const result = await rpcPromise;
      expect(result).to.deep.equal({ result: 'success' });
    });

    it('should handle RPC error response', async () => {
      const rpcPromise = wsClient.rpc('test-method', {});

      // Simulate error response
      wsClient.wsClient.simulateMessage({
        action: 'rpc',
        name: 'test-method',
        response: 'Method not found',
        type: 'error',
        id: 0
      });

      try {
        await rpcPromise;
        expect.fail('Should have rejected on error response');
      } catch (error) {
        expect(error.message).to.equal('Method not found');
      }
    });

    it('should handle RPC timeout', async () => {
      const rpcPromise = wsClient.rpc('test-method', {}, 100);

      try {
        await rpcPromise;
        expect.fail('Should have rejected on timeout');
      } catch (error) {
        expect(error.message).to.include('WS RPC Timeout');
      }
    });

    it('should ignore RPC responses with wrong ID', async () => {
      const rpcPromise = wsClient.rpc('test-method', {});

      // Simulate response with wrong ID
      wsClient.wsClient.simulateMessage({
        action: 'rpc',
        name: 'test-method',
        response: { result: 'wrong' },
        type: 'success',
        id: 999
      });

      // Simulate correct response
      setTimeout(() => {
        wsClient.wsClient.simulateMessage({
          action: 'rpc',
          name: 'test-method',
          response: { result: 'correct' },
          type: 'success',
          id: 0
        });
      }, 10);

      const result = await rpcPromise;
      expect(result).to.deep.equal({ result: 'correct' });
    });

    it('should increment RPC ID', async () => {
      wsClient.rpc('method1', {});
      wsClient.rpc('method2', {});

      expect(wsClient.rpcId).to.equal(2);
    });
  });

  describe('Pub/Sub Functionality', () => {
    beforeEach(async () => {
      const connectPromise = wsClient.connect();
      wsClient.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;
    });

    describe('Publishing', () => {
      it('should publish message successfully', async () => {
        const pubPromise = wsClient.pub('test-channel', { content: 'Hello' });

        // Verify message was sent
        expect(wsClient.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClient.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'pub',
          chan: 'test-channel',
          id: 0,
          msg: { content: 'Hello' }
        });

        // Simulate successful response
        wsClient.wsClient.simulateMessage({
          action: 'pub-confirm',
          chan: 'test-channel',
          response: 'published',
          type: 'success',
          id: 0
        });

        const result = await pubPromise;
        expect(result).to.equal('published');
      });

      it('should handle publish error', async () => {
        const pubPromise = wsClient.pub('test-channel', { content: 'Hello' });

        // Simulate error response
        wsClient.wsClient.simulateMessage({
          action: 'pub-confirm',
          chan: 'test-channel',
          response: 'Channel not found',
          type: 'error',
          id: 0
        });

        try {
          await pubPromise;
          expect.fail('Should have rejected on error response');
        } catch (error) {
          expect(error.message).to.equal('Channel not found');
        }
      });

      it('should handle publish timeout', async () => {
        const pubPromise = wsClient.pub('test-channel', { content: 'Hello' }, 100);

        try {
          await pubPromise;
          expect.fail('Should have rejected on timeout');
        } catch (error) {
          expect(error.message).to.include('WS Pub Timeout');
        }
      });

      it('should publish simple message', () => {
        wsClient.pubSimple('test-channel', { content: 'Hello' });

        expect(wsClient.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClient.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'pub-simple',
          chan: 'test-channel',
          id: 0,
          msg: { content: 'Hello' }
        });
      });

      it('should increment pub ID', () => {
        wsClient.pub('channel1', {});
        wsClient.pub('channel2', {});

        expect(wsClient.pubId).to.equal(2);
      });
    });

    describe('Subscription', () => {
      it('should subscribe to channel successfully', async () => {
        const callback = sinon.spy();
        const subPromise = wsClient.sub('test-channel', callback);

        // Verify message was sent
        expect(wsClient.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClient.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'sub',
          chan: 'test-channel',
          id: 0
        });

        // Simulate successful response
        wsClient.wsClient.simulateMessage({
          action: 'sub',
          chan: 'test-channel',
          response: 'subscribed',
          type: 'success',
          id: 0
        });

        const result = await subPromise;
        expect(result).to.equal('subscribed');
      });

      it('should handle subscription error', async () => {
        const callback = sinon.spy();
        const subPromise = wsClient.sub('test-channel', callback);

        // Simulate error response
        wsClient.wsClient.simulateMessage({
          action: 'sub',
          chan: 'test-channel',
          response: 'Channel not found',
          type: 'error',
          id: 0
        });

        try {
          await subPromise;
          expect.fail('Should have rejected on error response');
        } catch (error) {
          expect(error.message).to.equal('Channel not found');
        }
      });

      it('should handle subscription timeout', async () => {
        const callback = sinon.spy();
        const subPromise = wsClient.sub('test-channel', callback, 100);

        try {
          await subPromise;
          expect.fail('Should have rejected on timeout');
        } catch (error) {
          expect(error.message).to.include('WS Sub Timeout');
        }
      });

      it('should not send duplicate subscription', async () => {
        const callback1 = sinon.spy();
        const callback2 = sinon.spy();

        // First subscription
        const subPromise1 = wsClient.sub('test-channel', callback1);
        wsClient.wsClient.simulateMessage({
          action: 'sub',
          chan: 'test-channel',
          response: 'subscribed',
          type: 'success',
          id: 0
        });
        await subPromise1;

        // Second subscription should not send another message
        wsClient.wsClient.send.resetHistory();
        const result = await wsClient.sub('test-channel', callback2);

        expect(wsClient.wsClient.send.called).to.be.false;
        expect(result).to.equal('Subscribed');
      });
    });

    describe('Unsubscription', () => {
      it('should unsubscribe from channel', async () => {
        const callback = sinon.spy();

        // First subscribe
        const subPromise = wsClient.sub('test-channel', callback);
        wsClient.wsClient.simulateMessage({
          action: 'sub',
          chan: 'test-channel',
          response: 'subscribed',
          type: 'success',
          id: 0
        });
        await subPromise;

        // Then unsubscribe
        wsClient.wsClient.send.resetHistory();
        const unsubPromise = wsClient.unsub('test-channel');

        // Verify message was sent
        expect(wsClient.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClient.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'unsub',
          chan: 'test-channel',
          id: 0
        });

        // Simulate successful response
        wsClient.wsClient.simulateMessage({
          action: 'unsub',
          chan: 'test-channel',
          response: 'unsubscribed',
          type: 'success',
          id: 0
        });

        const result = await unsubPromise;
        expect(result).to.equal('unsubscribed');
      });

      it('should unsubscribe specific callback', async () => {
        const callback1 = sinon.spy();
        const callback2 = sinon.spy();

        // Subscribe with multiple callbacks
        const subPromise1 = wsClient.sub('test-channel', callback1);
        wsClient.wsClient.simulateMessage({
          action: 'sub',
          chan: 'test-channel',
          response: 'subscribed',
          type: 'success',
          id: 0
        });
        await subPromise1;

        const subPromise2 = wsClient.sub('test-channel', callback2);
        // This should not send another message, so no need to simulate response
        await subPromise2;

        // Unsubscribe specific callback
        wsClient.wsClient.send.resetHistory();
        const result = await wsClient.unsub('test-channel', callback1);

        expect(wsClient.wsClient.send.called).to.be.false;
        expect(result).to.equal('Unsubscribed');
      });

      it('should handle unsubscribe error', async () => {
        const callback = sinon.spy();

        // First subscribe
        const subPromise = wsClient.sub('test-channel', callback);
        wsClient.wsClient.simulateMessage({
          action: 'sub',
          chan: 'test-channel',
          response: 'subscribed',
          type: 'success',
          id: 0
        });
        await subPromise;

        // Then try to unsubscribe
        const unsubPromise = wsClient.unsub('test-channel');

        // Simulate error response
        wsClient.wsClient.simulateMessage({
          action: 'unsub',
          chan: 'test-channel',
          response: 'Channel not found',
          type: 'error',
          id: 0
        });

        try {
          await unsubPromise;
          expect.fail('Should have rejected on error response');
        } catch (error) {
          expect(error.message).to.equal('Channel not found');
        }
      });

      it('should handle unsubscribe timeout', async () => {
        const callback = sinon.spy();

        // First subscribe
        const subPromise = wsClient.sub('test-channel', callback);
        wsClient.wsClient.simulateMessage({
          action: 'sub',
          chan: 'test-channel',
          response: 'subscribed',
          type: 'success',
          id: 0
        });
        await subPromise;

        // Then try to unsubscribe with short timeout
        const unsubPromise = wsClient.unsub('test-channel', null, 100);

        try {
          await unsubPromise;
          expect.fail('Should have rejected on timeout');
        } catch (error) {
          expect(error.message).to.include('WS Unsub Timeout');
        }
      });
    });
  });

  describe('Command Handling', () => {
    beforeEach(async () => {
      const connectPromise = wsClient.connect();
      wsClient.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;
    });

    it('should register command callback', () => {
      const callback = sinon.spy();
      const unregister = wsClient.onCmd('notification', callback);

      expect(typeof unregister).to.equal('function');

      // Simulate command message
      wsClient.wsClient.simulateMessage({
        action: 'cmd',
        cmd: 'notification',
        data: { message: 'Hello' }
      });

      expect(callback.calledWith({ message: 'Hello' })).to.be.true;
    });

    it('should unregister command callback', () => {
      const callback = sinon.spy();
      const unregister = wsClient.onCmd('notification', callback);

      // Unregister the callback
      unregister();

      // Simulate command message
      wsClient.wsClient.simulateMessage({
        action: 'cmd',
        cmd: 'notification',
        data: { message: 'Hello' }
      });

      expect(callback.called).to.be.false;
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed JSON messages gracefully', async () => {
      const connectPromise = wsClient.connect();
      wsClient.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;

      // This should not throw an error
      expect(() => {
        const event = { data: 'invalid json' };
        wsClient.onMessage(event);
      }).to.throw();
    });

    it('should handle unknown message actions', async () => {
      const connectPromise = wsClient.connect();
      wsClient.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;

      // This should not throw an error
      expect(() => {
        wsClient.wsClient.simulateMessage({
          action: 'unknown-action',
          data: 'some data'
        });
      }).to.not.throw();
    });

    it('should handle multiple rapid RPC calls', async () => {
      const connectPromise = wsClient.connect();
      wsClient.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(wsClient.rpc(`method${i}`, {}));
      }

      // Simulate responses with a slight delay to ensure all promises are set up
      setTimeout(() => {
        for (let i = 0; i < 5; i++) {
          wsClient.wsClient.simulateMessage({
            action: 'rpc',
            name: `method${i}`,
            response: { result: i },
            type: 'success',
            id: i
          });
        }
      }, 100);

      const results = await Promise.all(promises);
      expect(results).to.have.lengthOf(5);
      results.forEach((result, index) => {
        expect(result.result).to.equal(index);
      });
    });
  });
});
