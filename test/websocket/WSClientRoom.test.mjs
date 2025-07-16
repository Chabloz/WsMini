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

import WSClientRoom from '../../src/websocket/WSClientRoom.js';

describe('WSClientRoom', () => {
  let wsClientRoom;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    wsClientRoom = new WSClientRoom('ws://localhost:8001');
  });

  afterEach(() => {
    if (wsClientRoom) {
      wsClientRoom.close();
    }
    sandbox.restore();
  });

  describe('Constructor', () => {
    it('should inherit from WSClient', () => {
      expect(wsClientRoom).to.be.instanceOf(WSClientRoom);
      expect(wsClientRoom.url).to.equal('ws://localhost:8001');
      expect(wsClientRoom.prefix).to.equal('__room-');
      expect(wsClientRoom.unregisterCmdListener).to.be.instanceOf(Map);
    });

    it('should initialize with default prefix', () => {
      expect(wsClientRoom.prefix).to.equal('__room-');
    });

    it('should initialize unregisterCmdListener as empty Map', () => {
      expect(wsClientRoom.unregisterCmdListener.size).to.equal(0);
    });
  });

  describe('Room Actions', () => {
    beforeEach(async () => {
      const connectPromise = wsClientRoom.connect();
      wsClientRoom.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;
    });

    describe('roomCreateOrJoin', () => {
      it('should create or join room with name', async () => {
        const roomPromise = wsClientRoom.roomCreateOrJoin('test-room', { welcome: 'message' });

        // Verify RPC call was made
        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'rpc',
          name: '__room-createOrJoin',
          data: { name: 'test-room', msg: { welcome: 'message' } },
          id: 0
        });

        // Simulate successful response
        wsClientRoom.wsClient.simulateMessage({
          action: 'rpc',
          name: '__room-createOrJoin',
          response: {
            name: 'test-room',
            meta: { capacity: 10 },
            clients: ['client1', 'client2']
          },
          type: 'success',
          id: 0
        });

        const room = await roomPromise;
        expect(room.name).to.equal('test-room');
        expect(room.meta).to.deep.equal({ capacity: 10 });
        expect(room.clients).to.deep.equal(['client1', 'client2']);
      });

      it('should create or join room without name', async () => {
        const roomPromise = wsClientRoom.roomCreateOrJoin();

        // Verify RPC call was made
        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'rpc',
          name: '__room-createOrJoin',
          data: { name: null, msg: {} },
          id: 0
        });

        // Simulate successful response
        wsClientRoom.wsClient.simulateMessage({
          action: 'rpc',
          name: '__room-createOrJoin',
          response: {
            name: 'generated-room-123',
            meta: { capacity: 10 },
            clients: []
          },
          type: 'success',
          id: 0
        });

        const room = await roomPromise;
        expect(room.name).to.equal('generated-room-123');
        expect(room.meta).to.deep.equal({ capacity: 10 });
        expect(room.clients).to.deep.equal([]);
      });
    });

    describe('roomCreate', () => {
      it('should create room with name', async () => {
        const roomPromise = wsClientRoom.roomCreate('new-room', { type: 'game' });

        // Verify RPC call was made
        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'rpc',
          name: '__room-create',
          data: { name: 'new-room', msg: { type: 'game' } },
          id: 0
        });

        // Simulate successful response
        wsClientRoom.wsClient.simulateMessage({
          action: 'rpc',
          name: '__room-create',
          response: {
            name: 'new-room',
            meta: { type: 'game' },
            clients: []
          },
          type: 'success',
          id: 0
        });

        const room = await roomPromise;
        expect(room.name).to.equal('new-room');
        expect(room.meta).to.deep.equal({ type: 'game' });
      });
    });

    describe('roomJoin', () => {
      it('should join existing room', async () => {
        const roomPromise = wsClientRoom.roomJoin('existing-room', { userId: 123 });

        // Verify RPC call was made
        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'rpc',
          name: '__room-join',
          data: { name: 'existing-room', msg: { userId: 123 } },
          id: 0
        });

        // Simulate successful response
        wsClientRoom.wsClient.simulateMessage({
          action: 'rpc',
          name: '__room-join',
          response: {
            name: 'existing-room',
            meta: { capacity: 5 },
            clients: ['client1', 'client2']
          },
          type: 'success',
          id: 0
        });

        const room = await roomPromise;
        expect(room.name).to.equal('existing-room');
        expect(room.meta).to.deep.equal({ capacity: 5 });
        expect(room.clients).to.deep.equal(['client1', 'client2']);
      });
    });

    describe('roomLeave', () => {
      it('should leave room and clean up listeners', async () => {
        // First join a room to set up listeners
        const roomPromise = wsClientRoom.roomCreateOrJoin('test-room');
        wsClientRoom.wsClient.simulateMessage({
          action: 'rpc',
          name: '__room-createOrJoin',
          response: {
            name: 'test-room',
            meta: {},
            clients: []
          },
          type: 'success',
          id: 0
        });
        await roomPromise;

        // Add some command listeners
        const callback1 = sinon.spy();
        const callback2 = sinon.spy();
        wsClientRoom.roomOnCmd('test-room', 'move', callback1);
        wsClientRoom.roomOnCmd('test-room', 'attack', callback2);

        // Reset send history
        wsClientRoom.wsClient.send.resetHistory();

        // Leave the room
        const leavePromise = wsClientRoom.roomLeave('test-room');

        // Verify RPC call was made
        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'rpc',
          name: '__room-leave',
          data: { name: 'test-room' },
          id: 1
        });

        // Simulate successful response
        wsClientRoom.wsClient.simulateMessage({
          action: 'rpc',
          name: '__room-leave',
          response: 'left',
          type: 'success',
          id: 1
        });

        const result = await leavePromise;
        expect(result).to.equal('left');

        // Verify listeners were cleaned up
        expect(wsClientRoom.unregisterCmdListener.has('test-room')).to.be.false;
      });
    });
  });

  describe('Room Communication', () => {
    beforeEach(async () => {
      const connectPromise = wsClientRoom.connect();
      wsClientRoom.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;
    });

    describe('roomSend', () => {
      it('should send message to room', () => {
        wsClientRoom.roomSend('game-room', { action: 'move', x: 10, y: 20 });

        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'pub-room',
          room: 'game-room',
          msg: { action: 'move', x: 10, y: 20 }
        });
      });

      it('should send message with empty data', () => {
        wsClientRoom.roomSend('game-room');

        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'pub-room',
          room: 'game-room',
          msg: {}
        });
      });
    });

    describe('roomSendCmd', () => {
      it('should send command to room', () => {
        wsClientRoom.roomSendCmd('game-room', 'move', { x: 10, y: 20 });

        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'pub-room-cmd',
          cmd: 'move',
          room: 'game-room',
          msg: { x: 10, y: 20 }
        });
      });

      it('should send command with empty data', () => {
        wsClientRoom.roomSendCmd('game-room', 'ping');

        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'pub-room-cmd',
          cmd: 'ping',
          room: 'game-room',
          msg: {}
        });
      });
    });
  });

  describe('Room Event Listeners', () => {
    beforeEach(async () => {
      const connectPromise = wsClientRoom.connect();
      wsClientRoom.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;
    });

    describe('roomOnMessage', () => {
      it('should register message listener for room', () => {
        const callback = sinon.spy();
        const unregister = wsClientRoom.roomOnMessage('game-room', callback);

        expect(typeof unregister).to.equal('function');

        // Simulate room message
        wsClientRoom.wsClient.simulateMessage({
          action: 'pub',
          chan: '__room-game-room',
          msg: { content: 'Hello from room' }
        });

        expect(callback.calledWith({ content: 'Hello from room' })).to.be.true;
      });
    });

    describe('roomOnCmd', () => {
      it('should register command listener for room', () => {
        const callback = sinon.spy();
        const unregister = wsClientRoom.roomOnCmd('game-room', 'move', callback);

        expect(typeof unregister).to.equal('function');

        // Simulate room command
        wsClientRoom.wsClient.simulateMessage({
          action: 'pub-cmd',
          chan: '__room-game-room',
          msg: { cmd: 'move', data: { x: 10, y: 20 } }
        });

        expect(callback.calledWith({ x: 10, y: 20 })).to.be.true;

        // Verify listener was registered for cleanup
        expect(wsClientRoom.unregisterCmdListener.has('game-room')).to.be.true;
        expect(wsClientRoom.unregisterCmdListener.get('game-room')).to.have.lengthOf(1);
      });

      it('should manage multiple command listeners for same room', () => {
        const callback1 = sinon.spy();
        const callback2 = sinon.spy();

        wsClientRoom.roomOnCmd('game-room', 'move', callback1);
        wsClientRoom.roomOnCmd('game-room', 'attack', callback2);

        expect(wsClientRoom.unregisterCmdListener.get('game-room')).to.have.lengthOf(2);
      });
    });

    describe('roomOnRooms', () => {
      it('should get room list and subscribe to updates', async () => {
        const callback = sinon.spy();
        const roomsPromise = wsClientRoom.roomOnRooms(callback);

        // Verify RPC call was made
        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'rpc',
          name: '__room-list',
          data: {},
          id: 0
        });

        // Verify subscription was also made
        expect(wsClientRoom.wsClient.send.calledTwice).to.be.true;
        const subMessage = JSON.parse(wsClientRoom.wsClient.send.secondCall.args[0]);
        expect(subMessage).to.deep.equal({
          action: 'sub',
          chan: '__room-list',
          id: 0
        });

        // Simulate successful RPC response
        wsClientRoom.wsClient.simulateMessage({
          action: 'rpc',
          name: '__room-list',
          response: ['room1', 'room2', 'room3'],
          type: 'success',
          id: 0
        });

        // Simulate subscription response
        wsClientRoom.wsClient.simulateMessage({
          action: 'sub',
          chan: '__room-list',
          response: 'subscribed',
          type: 'success',
          id: 0
        });

        await roomsPromise;
        expect(callback.calledWith(['room1', 'room2', 'room3'])).to.be.true;
      });
    });

    describe('roomOnClients', () => {
      it('should register client list listener for room', () => {
        const callback = sinon.spy();
        const unregister = wsClientRoom.roomOnClients('game-room', callback);

        expect(typeof unregister).to.equal('function');

        // Simulate clients update
        wsClientRoom.wsClient.simulateMessage({
          action: 'pub',
          chan: '__room-game-room-clients',
          msg: ['client1', 'client2', 'client3']
        });

        expect(callback.calledWith(['client1', 'client2', 'client3'])).to.be.true;
      });
    });
  });

  describe('Room Class', () => {
    let room;
    let mockClient;

    beforeEach(async () => {
      const connectPromise = wsClientRoom.connect();
      wsClientRoom.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;

      // Create a room
      const roomPromise = wsClientRoom.roomCreateOrJoin('test-room');
      wsClientRoom.wsClient.simulateMessage({
        action: 'rpc',
        name: '__room-createOrJoin',
        response: {
          name: 'test-room',
          meta: { capacity: 10 },
          clients: ['client1', 'client2']
        },
        type: 'success',
        id: 0
      });
      room = await roomPromise;
    });

    describe('Constructor', () => {
      it('should create room with correct properties', () => {
        expect(room.name).to.equal('test-room');
        expect(room.meta).to.deep.equal({ capacity: 10 });
        expect(room.clients).to.deep.equal(['client1', 'client2']);
        expect(room.wsClient).to.equal(wsClientRoom);
      });

      it('should register close listener', () => {
        const roomOffSpy = sinon.spy(wsClientRoom, '_roomOff');

        // Simulate client close
        wsClientRoom.emit('close');

        expect(roomOffSpy.calledWith('test-room')).to.be.true;
      });
    });

    describe('send', () => {
      it('should send message through wsClient', () => {
        wsClientRoom.wsClient.send.resetHistory();

        room.send({ action: 'move', x: 10, y: 20 });

        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'pub-room',
          room: 'test-room',
          msg: { action: 'move', x: 10, y: 20 }
        });
      });
    });

    describe('sendCmd', () => {
      it('should send command through wsClient', () => {
        wsClientRoom.wsClient.send.resetHistory();

        room.sendCmd('move', { x: 10, y: 20 });

        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'pub-room-cmd',
          cmd: 'move',
          room: 'test-room',
          msg: { x: 10, y: 20 }
        });
      });

      it('should send command with empty data', () => {
        wsClientRoom.wsClient.send.resetHistory();

        room.sendCmd('ping');

        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'pub-room-cmd',
          cmd: 'ping',
          room: 'test-room',
          msg: {}
        });
      });
    });

    describe('leave', () => {
      it('should leave room through wsClient', () => {
        wsClientRoom.wsClient.send.resetHistory();

        room.leave();

        expect(wsClientRoom.wsClient.send.called).to.be.true;
        const sentMessage = JSON.parse(wsClientRoom.wsClient.send.firstCall.args[0]);
        expect(sentMessage).to.deep.equal({
          action: 'rpc',
          name: '__room-leave',
          data: { name: 'test-room' },
          id: 1
        });
      });
    });

    describe('onMessage', () => {
      it('should register message listener through wsClient', () => {
        const callback = sinon.spy();
        const unregister = room.onMessage(callback);

        expect(typeof unregister).to.equal('function');

        // Simulate room message
        wsClientRoom.wsClient.simulateMessage({
          action: 'pub',
          chan: '__room-test-room',
          msg: { content: 'Hello' }
        });

        expect(callback.calledWith({ content: 'Hello' })).to.be.true;
      });
    });

    describe('onCmd', () => {
      it('should register command listener through wsClient', () => {
        const callback = sinon.spy();
        const unregister = room.onCmd('move', callback);

        expect(typeof unregister).to.equal('function');

        // Simulate room command
        wsClientRoom.wsClient.simulateMessage({
          action: 'pub-cmd',
          chan: '__room-test-room',
          msg: { cmd: 'move', data: { x: 10, y: 20 } }
        });

        expect(callback.calledWith({ x: 10, y: 20 })).to.be.true;
      });
    });

    describe('onClients', () => {
      it('should call callback with current clients and register listener', () => {
        const callback = sinon.spy();
        const unregister = room.onClients(callback);

        expect(typeof unregister).to.equal('function');
        expect(callback.calledWith(['client1', 'client2'])).to.be.true;

        // Simulate clients update
        wsClientRoom.wsClient.simulateMessage({
          action: 'pub',
          chan: '__room-test-room-clients',
          msg: ['client1', 'client2', 'client3']
        });

        expect(callback.calledWith(['client1', 'client2', 'client3'])).to.be.true;
      });
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      const connectPromise = wsClientRoom.connect();
      wsClientRoom.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;
    });

    describe('_roomOff', () => {
      it('should clean up all listeners for room', () => {
        // Set up some listeners
        const callback1 = sinon.spy();
        const callback2 = sinon.spy();
        const unregister1 = wsClientRoom.roomOnCmd('test-room', 'move', callback1);
        const unregister2 = wsClientRoom.roomOnCmd('test-room', 'attack', callback2);

        // Verify listeners were registered
        expect(wsClientRoom.unregisterCmdListener.has('test-room')).to.be.true;
        expect(wsClientRoom.unregisterCmdListener.get('test-room')).to.have.lengthOf(2);

        // Clean up
        wsClientRoom._roomOff('test-room');

        // Verify listeners were cleaned up
        expect(wsClientRoom.unregisterCmdListener.has('test-room')).to.be.false;
      });

      it('should handle cleanup when no listeners exist', () => {
        expect(() => wsClientRoom._roomOff('nonexistent-room')).to.not.throw;
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const connectPromise = wsClientRoom.connect();
      wsClientRoom.wsClient.simulateMessage({ action: 'auth-success' });
      await connectPromise;
    });

    it('should handle room creation errors', async () => {
      const roomPromise = wsClientRoom.roomCreate('existing-room');

      // Simulate error response
      wsClientRoom.wsClient.simulateMessage({
        action: 'rpc',
        name: '__room-create',
        response: 'Room already exists',
        type: 'error',
        id: 0
      });

      try {
        await roomPromise;
        expect.fail('Should have rejected on error response');
      } catch (error) {
        expect(error.message).to.equal('Room already exists');
      }
    });

    it('should handle room join errors', async () => {
      const roomPromise = wsClientRoom.roomJoin('nonexistent-room');

      // Simulate error response
      wsClientRoom.wsClient.simulateMessage({
        action: 'rpc',
        name: '__room-join',
        response: 'Room not found',
        type: 'error',
        id: 0
      });

      try {
        await roomPromise;
        expect.fail('Should have rejected on error response');
      } catch (error) {
        expect(error.message).to.equal('Room not found');
      }
    });

    it('should handle room leave errors', async () => {
      const leavePromise = wsClientRoom.roomLeave('nonexistent-room');

      // Simulate error response
      wsClientRoom.wsClient.simulateMessage({
        action: 'rpc',
        name: '__room-leave',
        response: 'Room not found',
        type: 'error',
        id: 0
      });

      try {
        await leavePromise;
        expect.fail('Should have rejected on error response');
      } catch (error) {
        expect(error.message).to.equal('Room not found');
      }
    });
  });
});
