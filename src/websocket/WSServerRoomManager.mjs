import WSServerPubSub from "./WSServerPubSub.mjs";
import WSServerError from "./WSServerError.mjs";
import WSServerRoom from "./WSServerRoom.mjs";

import crypto from 'crypto';
import WSServerGameRoom from "./WSServerGameRoom.mjs";

export default class WSServerRoomManager extends WSServerPubSub {
  rooms = new Map();
  prefix = '__room-';
  actionsRoom = ['pub-room', 'pub-room-cmd'];
  syncModes = ['immediate', 'immediate-other', 'patch'];

  constructor({
    maxUsersByRoom = 10,

    usersCanCreateRoom = true,
    usersCanNameRoom = true,
    usersCanListRooms = true,
    usersCanGetRoomUsers = true,

    roomClass = WSServerRoom,

    autoJoinCreatedRoom = true,
    autoDeleteEmptyRoom = true,
    autoSendRoomListOnUsersChange = true,

    syncMode = null,

    port = 8887,
    maxNbOfClients = 1000,
    maxInputSize = 100000, // 100kb
    logLevel = 'info',
    origins = '*',
    pingTimeout = 30000,
    authCallback = (token, request, wsServer) => ({}),
  } = {}) {
    if (!roomClass.prototype instanceof WSServerRoom) throw new Error('Invalid room class');

    super({ port, maxNbOfClients, maxInputSize, logLevel, origins, pingTimeout, authCallback });

    this.maxUsersByRoom = maxUsersByRoom;

    this.usersCanCreateRoom = usersCanCreateRoom;
    this.usersCanNameRoom = usersCanNameRoom;
    this.usersCanListRooms = usersCanListRooms;
    this.usersCanGetRoomUsers = usersCanGetRoomUsers;

    this.roomClass = roomClass;

    this.autoJoinCreatedRoom = autoJoinCreatedRoom;
    this.autoDeleteEmptyRoom = autoDeleteEmptyRoom;
    this.autoSendRoomListOnUsersChange = autoSendRoomListOnUsersChange;

    const isGameRoom = this.roomClass.prototype instanceof WSServerGameRoom;

    if (syncMode === null) syncMode = isGameRoom ? 'patch' : 'immediate';
    if (!this.syncModes.includes(syncMode)) throw new Error('Invalid sync mode');
    if (isGameRoom && syncMode !== 'patch') throw new Error('Invalid sync mode for game room, must be "patch"');
    this.syncMode = syncMode;
    if (this.syncMode === 'patch' && !(this.roomClass.prototype instanceof WSServerGameRoom)) {
      throw new Error("Room class for 'patch' mode must be an instance of WSServerGameRoom");
    }

    if (this.usersCanCreateRoom) {
      this.clientCreateRoom = this.clientCreateRoom.bind(this);
      this.addRpc(this.prefix + 'create', this.clientCreateRoom);
    }

    this.clientJoinRoom = this.clientJoinRoom.bind(this);
    this.addRpc(this.prefix + 'join', this.clientJoinRoom);

    this.clientCreateOrJoinRoom = this.clientCreateOrJoinRoom.bind(this);
    this.addRpc(this.prefix + 'createOrJoin', this.clientCreateOrJoinRoom);

    this.clientLeaveRoom = this.clientLeaveRoom.bind(this);
    this.addRpc(this.prefix + 'leave', this.clientLeaveRoom);

    this.addChannel(this.prefix + 'list', {
      usersCanPub: false,
      usersCanSub: this.usersCanListRooms,
    });

    if (this.usersCanListRooms) {
      this.clientListRooms = this.clientListRooms.bind(this);
      this.addRpc(this.prefix + 'list', this.clientListRooms);
    }
  }

  isActionValid(action) {
    return super.isActionValid(action) || this.actionsRoom.includes(action);
  }

  onMessage(client, message) {
    const data = super.onMessage(client, message);
    if (typeof data === 'boolean') return data;
    if (this.actionsRoom.includes(data.action)) {
      return this.manageRoomActions(client, data);
    }
    return data;
  }

  manageRoomActions(client, data) {
    if (data.action === 'pub-room' || data.action === 'pub-room-cmd') {
      if (typeof data?.msg === 'undefined') return this.sendError(client, 'Invalid message');
      if (typeof data?.room !== 'string') return this.sendError(client, 'Invalid room');
      if (!this.rooms.has(data.room)) return this.sendError(client, 'Unknown room');

      const room = this.rooms.get(data.room);
      if (!room.chan.clients.has(client)) return this.sendError(client, 'Client not in room');
      const clientMeta = this.clients.get(client);

      let toCall = 'onMsg';
      if (data.action === 'pub-room-cmd') {
        if (typeof data?.cmd !== 'string') return this.sendError(client, 'Invalid command name');
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(data.cmd)) return this.sendError(client, 'Invalid command name');
        data.cmd = data.cmd.charAt(0).toUpperCase() + data.cmd.slice(1);
        toCall = `onCmd${data.cmd}`;
        if (typeof room.manager[toCall] != 'function') return this.sendError(client, 'Unknown command');
      }

      try {
        var msg = room.manager[toCall](data.msg, clientMeta, client);
      } catch (e) {
        if (!(e instanceof WSServerError)) this.log(e.name + ': ' + e.message, 'error');
        const response = e instanceof WSServerError ? e.message : 'Server error';
        return this.sendError(client, response);
      }

      if (this.syncMode === 'immediate') {
        return this.broadcastRoom(room, msg);
      }
      if (this.syncMode === 'immediate-other') {
        return this.broadcastOtherRoom(room, msg, client);
      }
    }
    return false;
  }

  clientListRooms(data, clientMeta, client) {
    return this.prepareRoomList();
  }

  clientLeaveRoom(data, clientMeta, client) {
    if (!data.name || typeof data.name !== 'string') throw new WSServerError('Invalid room name');
    data.name = data.name.trim();
    if (!this.rooms.has(data.name)) throw new WSServerError('Room not found');

    const room = this.rooms.get(data.name);
    if (!room.chan.clients.has(client)) throw new WSServerError('Client not in room');

    return this.removeClientFromRoom(data.name, client);
  }

  clientCreateOrJoinRoom(data, clientMeta, client) {
    if (this.usersCanCreateRoom && typeof data?.name === 'string' && this.rooms.has(data.name)) {
      return this.clientJoinRoom(data, clientMeta, client);
    }
    return this.clientCreateRoom(data, clientMeta, client);
  }

  clientJoinRoom(data, clientMeta, client) {
    if (!data.name || typeof data.name !== 'string') throw new WSServerError('Invalid room name');
    data.name = data.name.trim();
    if (!this.rooms.has(data.name)) throw new WSServerError('Room not found');
    const room = this.rooms.get(data.name);
    if (room.chan.clients.size >= room.maxUsers) throw new WSServerError('Room is full');
    if (room.chan.clients.has(client)) throw new WSServerError('Client already in room');

    try {
      var meta = room.manager.onJoin(data.msg, clientMeta, client);
    } catch (e) {
      if (!(e instanceof WSServerError)) this.log(e.name + ': ' + e.message, 'error');
      const response = e instanceof WSServerError ? e.message : 'Server error';
      throw new WSServerError(response);
    }

    if (meta === false) throw new WSServerError('Room join aborted');
    if (typeof meta !== 'object') meta = {};

    Object.assign(clientMeta, meta);

    this.addClientToRoom(data.name, clientMeta, client);

    let roomMeta = {};
    try {
      roomMeta = room.manager.onSendRoom();
      if (typeof roomMeta !== 'object') roomMeta = {};
    } catch (e) {
      this.log(e.name + ': ' + e.message, 'error');
    }
    const response = { name: room.name, meta: roomMeta };
    if (this.usersCanGetRoomUsers) response.clients = this.prepareRoomClients(room);
    return response;
  }

  clientCreateRoom(data, clientMeta, client) {
    if (this.usersCanNameRoom && data?.name) {
      if (typeof data.name !== 'string') throw new WSServerError('Invalid room name');
      data.name = data.name.trim();
      if (this.rooms.has(data.name)) throw new WSServerError('Room already exists');
    } else {
      data.name = null;
    }

    const roomInstance = new this.roomClass(data.name, this);
    try {
      var meta = roomInstance.onCreate(data.name, data.msg, clientMeta, client);
    } catch (e) {
      if (!(e instanceof WSServerError)) this.log(e.name + ': ' + e.message, 'error');
      const response = e instanceof WSServerError ? e.message : 'Server error';
      throw new WSServerError(response);
    }

    if (meta === false) throw new WSServerError('Room creation aborted');
    if (typeof meta !== 'object') meta = {};
    if (meta.name && typeof meta.name === 'string') data.name = meta.name;

    const roomName = this.createRoom(data.name ?? null);
    const room = this.rooms.get(roomName);
    room.manager = roomInstance;
    room.manager.name = roomName;
    Object.assign(room.meta, meta);

    if (this.autoJoinCreatedRoom) {
      try {
        var metaUser = room.manager.onJoin(data.msg, clientMeta, client);
      } catch (e) {
        if (!(e instanceof WSServerError)) this.log(e.name + ': ' + e.message, 'error');
        const response = e instanceof WSServerError ? e.message : 'Server error';
        this.deleteRoom(roomName);
        throw new WSServerError(response);
      }

      if (metaUser === false) {
        this.deleteRoom(roomName);
        throw new WSServerError('Room join aborted');
      }
      if (typeof metaUser !== 'object') metaUser = {};

      Object.assign(clientMeta, metaUser);
      this.addClientToRoom(roomName, clientMeta, client);
    }

    let roomMeta = {};
    try {
      roomMeta = room.manager.onSendRoom(room.meta);
      if (typeof roomMeta !== 'object') roomMeta = {};
    } catch (e) {
      this.log(e.name + ': ' + e.message, 'error');
    }

    this.pubRoomList();
    const response = { name: roomName, meta: roomMeta };
    if (this.usersCanGetRoomUsers) response.clients = this.prepareRoomClients(room);
    return response;
  }

  getClientsOfRoom(roomName) {
    const clients = [];
    if (!this.rooms.has(roomName)) return clients;

    const room = this.rooms.get(roomName);
    for (const client of room.chan.clients) {
      clients.push(this.clients.get(client));
    }
    return clients;
  }

  isRoomFull(roomName) {
    if (!this.rooms.has(roomName)) return false;
    const room = this.rooms.get(roomName);
    return room.chan.clients.size >= room.maxUsers;
  }

  getRoomMeta(roomName) {
    if (!this.rooms.has(roomName)) return false;
    return this.rooms.get(roomName).meta;
  }

  addClientToRoom(roomName, clientMeta, client) {
    const room = this.rooms.get(roomName);
    const chan = room.chan;
    const chanClients = room.chanClients;
    if (chan.clients.has(client)) return false;

    this.log('Client ' + clientMeta.id + ' joined room ' + roomName);
    chan.clients.add(client);
    if (this.usersCanGetRoomUsers) chanClients.clients.add(client);
    this.pubRoomClients(room);
    if (this.autoSendRoomListOnUsersChange) this.pubRoomList();
    return true;
  }

  removeClientFromRoom(roomName, client) {
    if (!this.rooms.has(roomName)) return false;
    const room = this.rooms.get(roomName);
    const chan = room.chan;
    const chanClients = room.chanClients;
    if (!chan.clients.has(client)) return false;

    const clientMeta = this.clients.get(client);
    try {
      room.manager.onLeave(clientMeta, client);
    } catch (e) {
      this.log(e.name + ': ' + e.message, 'error');
    }
    if (clientMeta) this.log('Client ' + clientMeta.id + ' left room ' + roomName);
    chan.clients.delete(client);
    chanClients.clients.delete(client);
    this.pubRoomClients(room);
    if (!this.autoDeleteEmptyRoom || chan.clients.size > 0) {
      if (this.autoSendRoomListOnUsersChange) this.pubRoomList();
      return true;
    }
    return this.deleteRoom(roomName);
  }

  deleteRoom(roomName) {
    if (!this.rooms.has(roomName)) return false;
    const room = this.rooms.get(roomName);

    try {
      room.manager.onDispose();
    } catch (e) { this.log(e.name + ': ' + e.message); }

    this.log('Room deleted: ' + roomName);
    room.manager.dispose();
    this.rooms.delete(roomName);
    this.pubRoomList();
    this.channels.delete(this.prefix + roomName + '-clients');
    return this.channels.delete(this.prefix + roomName);
  }

  createRoom(roomName = null, withHook = false) {
    roomName = roomName ?? crypto.randomUUID();
    if (this.rooms.has(roomName)) return false;

    let meta = {};
    let managerInstance = new this.roomClass(roomName, this);
    if (withHook) {
      try {
        meta = managerInstance.onCreate(roomName, null, null, null);
      } catch (e) {
        if (!(e instanceof WSServerError)) this.log(e.name + ': ' + e.message, 'error');
        meta = false;
      }
      if (meta === false) {
        this.log('Room creation aborted');
        return false;
      }
      if (typeof meta !== 'object') meta = {};
      if (meta.name && typeof meta.name === 'string') roomName = meta.name;
    }

    const chanName = this.prefix + roomName;
    const chanNameClients = this.prefix + roomName + '-clients';
    this.addChannel(chanName, { usersCanPub: false, usersCanSub: false });
    this.addChannel(chanNameClients, { usersCanPub: false, usersCanSub: false });

    this.rooms.set(roomName, {
      name: roomName,
      chan: this.channels.get(chanName),
      chanClients: this.channels.get(chanNameClients),
      maxUsers: this.maxUsersByRoom,
      meta: { name: roomName, ...meta },
      manager: managerInstance,
    });

    this.log('Room created: ' + roomName);

    if (withHook) this.pubRoomList();

    return roomName;
  }

  onClose(client) {
    for (const room of this.rooms.values()) {
      this.removeClientFromRoom(room.name, client);
    }
    super.onClose(client);
  }

  close() {
    this.rooms.clear();
    super.close();
  }

  preparePubMessage(room, msg) {
    return JSON.stringify({
      action: 'pub',
      chan: this.prefix + room.name,
      msg
    });
  }

  preparePubCmd(room, cmd, data = {}) {
    return JSON.stringify({
      action: 'pub-cmd',
      chan: this.prefix + room.name,
      msg : { cmd, data }
    });
  }

  prepareRoomList() {
    let rooms = [];
    for (const room of this.rooms.values()) {
      let meta = {};
      try {
        meta = room.manager.onSendRoom(room.meta);
        if (typeof meta !== 'object') meta = {};
      } catch (e) { this.log(e.name + ': ' + e.message, 'error'); }

      rooms.push({
        name: room.name,
        meta,
        nbUsers: room.chan.clients.size,
        maxUsers: room.maxUsers
      });
    }

    try {
      const roomsListHook = this.roomClass.onSendRoomsList(rooms);
      if (Array.isArray(roomsListHook)) rooms = roomsListHook;
    } catch (e) { this.log(e.name + ': ' + e.message, 'error'); }

    return rooms;
  }

  pubRoomList() {
    const roomsList = this.prepareRoomList();
    this.pub(this.prefix + 'list', roomsList);
  }

  prepareRoomClients(room) {
    const clients = [];
    for (const client of room.chan.clients) {
      let clientMeta = {};
      try {
        clientMeta = room.manager.onSendClient(this.clients.get(client));
        if (typeof clientMeta !== 'object') clientMeta = {};
      } catch (e) { this.log(e.name + ': ' + e.message, 'error'); }
      clients.push(clientMeta);
    }
    return clients;
  }

  pubRoomClients(room) {
    const clients = this.prepareRoomClients(room);
    return this.pub(this.prefix + room.name + '-clients', clients);
  }

  sendRoomName(roomName, client, msg) {
    if (!this.rooms.has(roomName)) return false;
    const room = this.rooms.get(roomName);
    this.sendRoom(room, client, msg);
  }

  sendRoom(room, client, msg) {
    if (!room.chan.clients.has(client)) return false;
    const message = this.preparePubMessage(room, msg);
    return this.send(client, message);
  }

  broadcastRoomName(roomName, msg) {
    if (!this.rooms.has(roomName)) return false;
    const room = this.rooms.get(roomName);
    return this.broadcastRoom(room, msg);
  }

  broadcastRoom(room, msg) {
    const message = this.preparePubMessage(room, msg);
    for (const client of room.chan.clients) {
      this.send(client, message);
    }
    return true;
  }

  broadcastOtherRoom(room, msg, client) {
    const message = this.preparePubMessage(room, msg);
    for (const other of room.chan.clients) {
      if (other === client) continue;
      this.send(other, message);
    }
    return true;
  }

  sendRoomNameCmd(roomName, client, cmd, data = {}) {
    if (!this.rooms.has(roomName)) return false;
    const room = this.rooms.get(roomName);
    this.sendRoomCmd(room, client, cmd, data);
  }

  sendRoomCmd(room, client, cmd, data = {}) {
    if (!room.chan.clients.has(client)) return false;
    const message = this.preparePubCmd(room, cmd, data);
    return this.send(client, message);
  }

  broadcastRoomNameCmd(roomName, cmd, data = {}) {
    if (!this.rooms.has(roomName)) return false;
    const room = this.rooms.get(roomName);
    return this.broadcastRoomCmd(room, cmd, data);
  }

  broadcastRoomCmd(room, cmd, data = {}) {
    const message = this.preparePubCmd(room, cmd, data);
    for (const client of room.chan.clients) {
      this.send(client, message);
    }
    return true;
  }

  broadcastRoomCmdOther(room, cmd, data = {}, client) {
    const message = this.preparePubCmd(room, cmd, data);
    for (const other of room.chan.clients) {
      if (other === client) continue;
      this.send(other, message);
    }
    return true;
  }

}