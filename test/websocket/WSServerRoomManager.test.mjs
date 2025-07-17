import sinon from 'sinon';
import { expect } from 'chai';

import WSServerRoomManager from '../../src/websocket/WSServerRoomManager.mjs';
import WSServerRoom from '../../src/websocket/WSServerRoom.mjs';
import WSServerGameRoom from '../../src/websocket/WSServerGameRoom.mjs';

// Custom test room class with test command methods
class TestRoom extends WSServerRoom {
  onCmdMove(msg, clientMeta, client) {
    return { cmd: 'Move', data: msg };
  }

  onCmdTest(msg, clientMeta, client) {
    return { cmd: 'Test', data: msg };
  }
}

const createMockClient = () => {
  const client = {
    send: sinon.spy(),
    close: sinon.spy(),
    terminate: sinon.spy(),
    isAlive: true,
    readyState: 1 // WebSocket.OPEN
  };
  return client;
};

describe('WSServerRoomManager', () => {
  let server;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    server = new WSServerRoomManager({ logLevel: 'none' });
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
    sandbox.restore();
  });

  describe('Constructor', () => {
    it('should create WSServerRoomManager with default options', () => {
      expect(server.rooms).to.be.instanceOf(Map);
      expect(server.maxUsersByRoom).to.equal(10);
      expect(server.usersCanCreateRoom).to.be.true;
      expect(server.usersCanNameRoom).to.be.true;
      expect(server.usersCanListRooms).to.be.true;
      expect(server.usersCanGetRoomUsers).to.be.true;
      expect(server.roomClass).to.equal(WSServerRoom);
      expect(server.autoJoinCreatedRoom).to.be.true;
      expect(server.autoDeleteEmptyRoom).to.be.true;
      expect(server.autoSendRoomListOnUsersChange).to.be.true;
      expect(server.syncMode).to.equal('immediate');
    });

    it('should create WSServerRoomManager with game room and patch sync mode', () => {
      server = new WSServerRoomManager({ roomClass: class extends WSServerGameRoom{} , logLevel: 'none' });
      expect(server.syncMode).to.equal('patch');
    });

    it('should throw an error for invalid sync mode for game room', () => {
      expect(() => new WSServerRoomManager({ roomClass: class extends WSServerGameRoom{}, syncMode: 'immediate', logLevel: 'none' })).to.throw('Invalid sync mode for game room, must be "patch"');
    });

    it('should throw an error for patch sync mode with non-game room', () => {
      expect(() => new WSServerRoomManager({ syncMode: 'patch', logLevel: 'none' })).to.throw("Room class for 'patch' mode must be an instance of WSServerGameRoom");
    });
  });

  describe('Room Management', () => {
    it('should create a room', () => {
      const roomName = server.createRoom('test-room');
      expect(roomName).to.equal('test-room');
      expect(server.rooms.has('test-room')).to.be.true;
      const room = server.rooms.get('test-room');
      expect(room).to.have.property('chan');
      expect(room).to.have.property('chanClients');
      expect(room).to.have.property('meta');
      expect(room.manager).to.be.instanceOf(WSServerRoom);
    });

    it('should create a room with a generated name', () => {
      const roomName = server.createRoom();
      expect(roomName).to.be.a('string');
      expect(server.rooms.has(roomName)).to.be.true;
    });

    it('should not create a room if it already exists', () => {
      server.createRoom('test-room');
      const roomName = server.createRoom('test-room');
      expect(roomName).to.be.false;
    });

    it('should delete a room', () => {
      const roomName = server.createRoom('test-room');
      const result = server.deleteRoom(roomName);
      expect(result).to.be.true;
      expect(server.rooms.has('test-room')).to.be.false;
    });

    it('should not delete a non-existent room', () => {
      const result = server.deleteRoom('non-existent-room');
      expect(result).to.be.false;
    });

    it('should add a client to a room', () => {
      const roomName = server.createRoom('test-room');
      const client = createMockClient();
      const clientMeta = { id: 'client1' };
      server.clients.set(client, clientMeta);

      const result = server.addClientToRoom(roomName, clientMeta, client);
      expect(result).to.be.true;
      const room = server.rooms.get(roomName);
      expect(room.chan.clients.has(client)).to.be.true;
    });

    it('should remove a client from a room', () => {
      const roomName = server.createRoom('test-room');
      const client = createMockClient();
      const clientMeta = { id: 'client1' };
      server.clients.set(client, clientMeta);
      server.addClientToRoom(roomName, clientMeta, client);

      const result = server.removeClientFromRoom(roomName, client);
      expect(result).to.be.true;
      // Since autoDeleteEmptyRoom is true by default, the room should be deleted when empty
      expect(server.rooms.has(roomName)).to.be.false;
    });

    it('should get clients of a room', () => {
      const roomName = server.createRoom('test-room');
      const client1 = createMockClient();
      const clientMeta1 = { id: 'client1', data: 'test1' };
      server.clients.set(client1, clientMeta1);
      server.addClientToRoom(roomName, clientMeta1, client1);

      const client2 = createMockClient();
      const clientMeta2 = { id: 'client2', data: 'test2' };
      server.clients.set(client2, clientMeta2);
      server.addClientToRoom(roomName, clientMeta2, client2);

      const clients = server.getClientsOfRoom(roomName);
      expect(clients).to.be.an('array').with.lengthOf(2);
      expect(clients).to.deep.include.members([clientMeta1, clientMeta2]);
    });

    it('should check if a room is full', () => {
      server.maxUsersByRoom = 1;
      const roomName = server.createRoom('test-room');
      const client = createMockClient();
      const clientMeta = { id: 'client1' };
      server.clients.set(client, clientMeta);
      server.addClientToRoom(roomName, clientMeta, client);

      expect(server.isRoomFull(roomName)).to.be.true;
    });

    it('should get room metadata', () => {
      const roomName = server.createRoom('test-room');
      const room = server.rooms.get(roomName);
      room.meta.customData = 'test';

      const meta = server.getRoomMeta(roomName);
      expect(meta).to.deep.equal(room.meta);
    });
  });

  describe('Room Messages', () => {
    let roomName, client, clientMeta, testServer;

    beforeEach(() => {
      // Create a server with custom room class for testing commands
      testServer = new WSServerRoomManager({ roomClass: TestRoom, logLevel: 'none' });
      roomName = testServer.createRoom('test-room');
      client = createMockClient();
      clientMeta = { id: 'client1' };
      testServer.clients.set(client, clientMeta);
      testServer.addClientToRoom(roomName, clientMeta, client);
      // Reset the spy to ignore the client list update message
      client.send.resetHistory();
    });

    afterEach(() => {
      if (testServer) {
        testServer.close();
      }
    });

    it('should handle pub-room message', () => {
      const messageData = JSON.stringify({
        action: 'pub-room',
        room: 'test-room',
        msg: { content: 'Hello World' }
      });

      const result = testServer.onMessage(client, messageData);
      expect(result).to.be.true;

      // Check that message was sent to the client
      expect(client.send.called).to.be.true;
      const sentMessage = JSON.parse(client.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'pub',
        chan: '__room-test-room',
        msg: { content: 'Hello World' }
      });
    });

    it('should handle pub-room-cmd message', () => {
      const messageData = JSON.stringify({
        action: 'pub-room-cmd',
        room: 'test-room',
        cmd: 'move',
        msg: { x: 10, y: 20 }
      });

      const result = testServer.onMessage(client, messageData);
      expect(result).to.be.true;

      // Check that command was sent to the client
      expect(client.send.called).to.be.true;
      const sentMessage = JSON.parse(client.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'pub',
        chan: '__room-test-room',
        msg: { cmd: 'Move', data: { x: 10, y: 20 } }
      });
    });

    it('should reject pub-room message without msg field', () => {
      const messageData = JSON.stringify({
        action: 'pub-room',
        room: 'test-room'
      });

      const result = testServer.onMessage(client, messageData);
      expect(result).to.be.false;

      // Check that error was sent
      expect(client.send.called).to.be.true;
      const sentMessage = JSON.parse(client.send.firstCall.args[0]);
      expect(sentMessage.action).to.equal('error');
      expect(sentMessage.msg).to.equal('Invalid message');
    });

    it('should reject pub-room message without room field', () => {
      const messageData = JSON.stringify({
        action: 'pub-room',
        msg: { content: 'Hello' }
      });

      const result = testServer.onMessage(client, messageData);
      expect(result).to.be.false;

      // Check that error was sent
      expect(client.send.called).to.be.true;
      const sentMessage = JSON.parse(client.send.firstCall.args[0]);
      expect(sentMessage.action).to.equal('error');
      expect(sentMessage.msg).to.equal('Invalid room');
    });

    it('should reject pub-room message for unknown room', () => {
      const messageData = JSON.stringify({
        action: 'pub-room',
        room: 'unknown-room',
        msg: { content: 'Hello' }
      });

      const result = testServer.onMessage(client, messageData);
      expect(result).to.be.false;

      // Check that error was sent
      expect(client.send.called).to.be.true;
      const sentMessage = JSON.parse(client.send.firstCall.args[0]);
      expect(sentMessage.action).to.equal('error');
      expect(sentMessage.msg).to.equal('Unknown room');
    });

    it('should reject pub-room message from client not in room', () => {
      const otherClient = createMockClient();
      const otherClientMeta = { id: 'client2' };
      testServer.clients.set(otherClient, otherClientMeta);

      const messageData = JSON.stringify({
        action: 'pub-room',
        room: 'test-room',
        msg: { content: 'Hello' }
      });

      const result = testServer.onMessage(otherClient, messageData);
      expect(result).to.be.false;

      // Check that error was sent
      expect(otherClient.send.called).to.be.true;
      const sentMessage = JSON.parse(otherClient.send.firstCall.args[0]);
      expect(sentMessage.action).to.equal('error');
      expect(sentMessage.msg).to.equal('Client not in room');
    });

    it('should reject pub-room-cmd message without cmd field', () => {
      const messageData = JSON.stringify({
        action: 'pub-room-cmd',
        room: 'test-room',
        msg: { x: 10 }
      });

      const result = testServer.onMessage(client, messageData);
      expect(result).to.be.false;

      // Check that error was sent
      expect(client.send.called).to.be.true;
      const sentMessage = JSON.parse(client.send.firstCall.args[0]);
      expect(sentMessage.action).to.equal('error');
      expect(sentMessage.msg).to.equal('Invalid command name');
    });

    it('should reject pub-room-cmd message with invalid cmd format', () => {
      const messageData = JSON.stringify({
        action: 'pub-room-cmd',
        room: 'test-room',
        cmd: '123invalid',
        msg: { x: 10 }
      });

      const result = testServer.onMessage(client, messageData);
      expect(result).to.be.false;

      // Check that error was sent
      expect(client.send.called).to.be.true;
      const sentMessage = JSON.parse(client.send.firstCall.args[0]);
      expect(sentMessage.action).to.equal('error');
      expect(sentMessage.msg).to.equal('Invalid command name');
    });

    it('should reject pub-room-cmd message for unknown command', () => {
      const messageData = JSON.stringify({
        action: 'pub-room-cmd',
        room: 'test-room',
        cmd: 'unknownCommand',
        msg: { x: 10 }
      });

      const result = testServer.onMessage(client, messageData);
      expect(result).to.be.false;

      // Check that error was sent
      expect(client.send.called).to.be.true;
      const sentMessage = JSON.parse(client.send.firstCall.args[0]);
      expect(sentMessage.action).to.equal('error');
      expect(sentMessage.msg).to.equal('Unknown command');
    });
  });

  describe('Room Broadcasting', () => {
    let room, client1, client2, clientMeta1, clientMeta2;

    beforeEach(() => {
      const roomName = server.createRoom('test-room');
      room = server.rooms.get(roomName);

      client1 = createMockClient();
      clientMeta1 = { id: 'client1' };
      server.clients.set(client1, clientMeta1);
      server.addClientToRoom(roomName, clientMeta1, client1);

      client2 = createMockClient();
      clientMeta2 = { id: 'client2' };
      server.clients.set(client2, clientMeta2);
      server.addClientToRoom(roomName, clientMeta2, client2);

      // Reset spies to ignore the client list update messages
      client1.send.resetHistory();
      client2.send.resetHistory();
    });

    it('should broadcast room message to all clients', () => {
      const message = { content: 'Hello World' };

      const result = server.broadcastRoom(room, message);
      expect(result).to.be.true;

      // Check both clients received the message
      expect(client1.send.called).to.be.true;
      expect(client2.send.called).to.be.true;

      const sentMessage1 = JSON.parse(client1.send.firstCall.args[0]);
      const sentMessage2 = JSON.parse(client2.send.firstCall.args[0]);

      expect(sentMessage1).to.deep.equal({
        action: 'pub',
        chan: '__room-test-room',
        msg: { content: 'Hello World' }
      });
      expect(sentMessage2).to.deep.equal(sentMessage1);
    });

    it('should broadcast room message to other clients (excluding sender)', () => {
      const message = { content: 'Hello World' };

      const result = server.broadcastOtherRoom(room, message, client1);
      expect(result).to.be.true;

      // Check only client2 received the message
      expect(client1.send.called).to.be.false;
      expect(client2.send.called).to.be.true;

      const sentMessage = JSON.parse(client2.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'pub',
        chan: '__room-test-room',
        msg: { content: 'Hello World' }
      });
    });

    it('should broadcast room command to all clients', () => {
      const cmd = 'move';
      const data = { x: 10, y: 20 };

      const result = server.broadcastRoomCmd(room, cmd, data);
      expect(result).to.be.true;

      // Check both clients received the command
      expect(client1.send.called).to.be.true;
      expect(client2.send.called).to.be.true;

      const sentMessage1 = JSON.parse(client1.send.firstCall.args[0]);
      const sentMessage2 = JSON.parse(client2.send.firstCall.args[0]);

      expect(sentMessage1).to.deep.equal({
        action: 'pub-cmd',
        chan: '__room-test-room',
        msg: { cmd, data }
      });
      expect(sentMessage2).to.deep.equal(sentMessage1);
    });

    it('should broadcast room command to other clients (excluding sender)', () => {
      const cmd = 'move';
      const data = { x: 10, y: 20 };

      const result = server.broadcastRoomCmdOther(room, cmd, data, client1);
      expect(result).to.be.true;

      // Check only client2 received the command
      expect(client1.send.called).to.be.false;
      expect(client2.send.called).to.be.true;

      const sentMessage = JSON.parse(client2.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'pub-cmd',
        chan: '__room-test-room',
        msg: { cmd, data }
      });
    });

    it('should broadcast room message by room name', () => {
      const message = { content: 'Hello World' };

      const result = server.broadcastRoomName('test-room', message);
      expect(result).to.be.true;

      // Check both clients received the message
      expect(client1.send.called).to.be.true;
      expect(client2.send.called).to.be.true;
    });

    it('should broadcast room command by room name', () => {
      const cmd = 'move';
      const data = { x: 10, y: 20 };

      const result = server.broadcastRoomNameCmd('test-room', cmd, data);
      expect(result).to.be.true;

      // Check both clients received the command
      expect(client1.send.called).to.be.true;
      expect(client2.send.called).to.be.true;
    });

    it('should return false when broadcasting to non-existent room', () => {
      const message = { content: 'Hello World' };

      const result = server.broadcastRoomName('non-existent-room', message);
      expect(result).to.be.false;
    });

    it('should send room command to specific client', () => {
      const cmd = 'move';
      const data = { x: 10, y: 20 };

      server.sendRoomCmd(room, client1, cmd, data);

      // Check only client1 received the command
      expect(client1.send.called).to.be.true;
      expect(client2.send.called).to.be.false;

      const sentMessage = JSON.parse(client1.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'pub-cmd',
        chan: '__room-test-room',
        msg: { cmd, data }
      });
    });

    it('should return false when sending to client not in room', () => {
      const otherClient = createMockClient();
      const cmd = 'move';
      const data = { x: 10, y: 20 };

      const result = server.sendRoomCmd(room, otherClient, cmd, data);
      expect(result).to.be.false;
    });
  });

  describe('Client Cleanup on Close', () => {
    it('should remove client from all rooms when client disconnects', () => {
      const client = createMockClient();
      const clientMeta = { id: 'test-client' };
      server.clients.set(client, clientMeta);

      // Create multiple rooms and add client to them
      server.createRoom('room1');
      server.createRoom('room2');
      server.addClientToRoom('room1', clientMeta, client);
      server.addClientToRoom('room2', clientMeta, client);

      // Verify client is in both rooms
      expect(server.getClientsOfRoom('room1')).to.have.length(1);
      expect(server.getClientsOfRoom('room2')).to.have.length(1);

      // Simulate client disconnect
      server.onClose(client);

      // Verify client is removed from both rooms
      expect(server.getClientsOfRoom('room1')).to.have.length(0);
      expect(server.getClientsOfRoom('room2')).to.have.length(0);
    });

    it('should handle client disconnect when client is not in any rooms', () => {
      const client = createMockClient();
      const clientMeta = { id: 'test-client' };
      server.clients.set(client, clientMeta);

      // Should not throw error
      expect(() => server.onClose(client)).to.not.throw();
    });
  });

  describe('Server Cleanup', () => {
    it('should clear all rooms when server closes', () => {
      server.createRoom('room1');
      server.createRoom('room2');

      expect(server.rooms.size).to.equal(2);

      server.close();

      expect(server.rooms.size).to.equal(0);
    });
  });

  describe('Room Messaging by Name', () => {
    let client1, client2, room;

    beforeEach(() => {
      client1 = createMockClient();
      client2 = createMockClient();
      const clientMeta1 = { id: 'client1' };
      const clientMeta2 = { id: 'client2' };
      server.clients.set(client1, clientMeta1);
      server.clients.set(client2, clientMeta2);

      server.createRoom('test-room');
      room = server.rooms.get('test-room');
      server.addClientToRoom('test-room', clientMeta1, client1);
      server.addClientToRoom('test-room', clientMeta2, client2);

      // Reset spy calls after room setup
      client1.send.resetHistory();
      client2.send.resetHistory();
    });

    it('should send message to specific client by room name', () => {
      const message = { content: 'Hello client1' };

      const result = server.sendRoomName('test-room', client1, message);
      expect(result).to.be.true;

      expect(client1.send.called).to.be.true;
      expect(client2.send.called).to.be.false;

      const sentMessage = JSON.parse(client1.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'pub',
        chan: '__room-test-room',
        msg: message
      });
    });

    it('should return false when sending to non-existent room', () => {
      const message = { content: 'Hello' };

      const result = server.sendRoomName('non-existent-room', client1, message);
      expect(result).to.be.false;
    });

    it('should return false when sending to client not in room', () => {
      const otherClient = createMockClient();
      const message = { content: 'Hello' };

      const result = server.sendRoomName('test-room', otherClient, message);
      expect(result).to.be.false;
    });

    it('should send message to specific client using room object', () => {
      const message = { content: 'Hello client2' };

      const result = server.sendRoom(room, client2, message);
      expect(result).to.be.true;

      expect(client1.send.called).to.be.false;
      expect(client2.send.called).to.be.true;

      const sentMessage = JSON.parse(client2.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'pub',
        chan: '__room-test-room',
        msg: message
      });
    });

    it('should return false when sending to client not in room using room object', () => {
      const otherClient = createMockClient();
      const message = { content: 'Hello' };

      const result = server.sendRoom(room, otherClient, message);
      expect(result).to.be.false;
    });
  });

  describe('Room Commands by Name', () => {
    let client1, client2, room;

    beforeEach(() => {
      client1 = createMockClient();
      client2 = createMockClient();
      const clientMeta1 = { id: 'client1' };
      const clientMeta2 = { id: 'client2' };
      server.clients.set(client1, clientMeta1);
      server.clients.set(client2, clientMeta2);

      server.createRoom('test-room');
      room = server.rooms.get('test-room');
      server.addClientToRoom('test-room', clientMeta1, client1);
      server.addClientToRoom('test-room', clientMeta2, client2);

      // Reset spy calls after room setup
      client1.send.resetHistory();
      client2.send.resetHistory();
    });

    it('should send command to specific client by room name', () => {
      const cmd = 'move';
      const data = { x: 10, y: 20 };

      const result = server.sendRoomNameCmd('test-room', client1, cmd, data);
      expect(result).to.be.true;

      expect(client1.send.called).to.be.true;
      expect(client2.send.called).to.be.false;

      const sentMessage = JSON.parse(client1.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'pub-cmd',
        chan: '__room-test-room',
        msg: { cmd, data }
      });
    });

    it('should send command with empty data by room name', () => {
      const cmd = 'reset';

      const result = server.sendRoomNameCmd('test-room', client1, cmd);
      expect(result).to.be.true;

      expect(client1.send.called).to.be.true;

      const sentMessage = JSON.parse(client1.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'pub-cmd',
        chan: '__room-test-room',
        msg: { cmd, data: {} }
      });
    });

    it('should return false when sending command to non-existent room', () => {
      const cmd = 'move';
      const data = { x: 10, y: 20 };

      const result = server.sendRoomNameCmd('non-existent-room', client1, cmd, data);
      expect(result).to.be.false;
    });

    it('should return false when sending command to client not in room', () => {
      const otherClient = createMockClient();
      const cmd = 'move';
      const data = { x: 10, y: 20 };

      const result = server.sendRoomNameCmd('test-room', otherClient, cmd, data);
      expect(result).to.be.false;
    });

    it('should send command to specific client using room object', () => {
      const cmd = 'jump';
      const data = { height: 5 };

      const result = server.sendRoomCmd(room, client2, cmd, data);
      expect(result).to.be.true;

      expect(client1.send.called).to.be.false;
      expect(client2.send.called).to.be.true;

      const sentMessage = JSON.parse(client2.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'pub-cmd',
        chan: '__room-test-room',
        msg: { cmd, data }
      });
    });

    it('should send command with empty data using room object', () => {
      const cmd = 'stop';

      const result = server.sendRoomCmd(room, client1, cmd);
      expect(result).to.be.true;

      expect(client1.send.called).to.be.true;

      const sentMessage = JSON.parse(client1.send.firstCall.args[0]);
      expect(sentMessage).to.deep.equal({
        action: 'pub-cmd',
        chan: '__room-test-room',
        msg: { cmd, data: {} }
      });
    });

    it('should return false when sending command to client not in room using room object', () => {
      const otherClient = createMockClient();
      const cmd = 'move';
      const data = { x: 10, y: 20 };

      const result = server.sendRoomCmd(room, otherClient, cmd, data);
      expect(result).to.be.false;
    });
  });
});
