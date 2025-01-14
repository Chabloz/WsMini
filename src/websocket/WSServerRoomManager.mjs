import WSServerPubSub from "./WSServerPubSub.mjs";
import WSServerError from "./WSServerError.mjs";
import WSServerRoom from "./WSServerRoom.mjs";

import crypto from 'crypto';

export default class WSServerRoomManager extends WSServerPubSub {
  rooms = new Map();
  prefix = '__room-';
  actionsRoom = ['pub-room'];
  syncModes = ['immediate', 'immediate-other', 'patch'];

  constructor({
    maxPlayersByRoom = 10,

    usersCanCreateRoom = true,
    usersCanNameRoom = true,
    usersCanListRooms = true,
    usersCanGetRoomPlayers = true,

    roomClass = WSServerRoom,

    autoJoinCreatedRoom = true,
    autoDeleteEmptyRoom = true,

    syncMode = null,

    port = 8887,
    maxNbOfClients = 1000,
    maxInputSize = 1000000,
    verbose = true,
    origins = 'http://localhost:5173',
    pingTimeout = 30000,
    authCallback = (headers, wsServer) => {},
  } = {}) {
    if (!roomClass.prototype instanceof WSServerRoom) throw new Error('Invalid room class');

    super({ port, maxNbOfClients, maxInputSize, verbose, origins, pingTimeout, authCallback });

    this.maxPlayersByRoom = maxPlayersByRoom;

    this.usersCanCreateRoom = usersCanCreateRoom;
    this.usersCanNameRoom = usersCanNameRoom;
    this.usersCanListRooms = usersCanListRooms;
    this.usersCanGetRoomPlayers = usersCanGetRoomPlayers;

    this.roomClass = roomClass;

    this.autoJoinCreatedRoom = autoJoinCreatedRoom;
    this.autoDeleteEmptyRoom = autoDeleteEmptyRoom;

    if (syncMode === null) syncMode = this.syncModes[0];
    if (!this.syncModes.includes(syncMode)) throw new Error('Invalid sync mode');
    this.syncMode = syncMode;

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
    if (data.action === 'pub-room') {
      if (typeof data?.msg === 'undefined') return this.sendError(client, 'Invalid message');
      if (typeof data?.room !== 'string') return this.sendError(client, 'Invalid room');
      if (!this.rooms.has(data.room)) return this.sendError(client, 'Unknown room');

      const room = this.rooms.get(data.room);
      if (!room.chan.clients.has(client)) return this.sendError(client, 'Client not in room');

      const clientMeta = this.clients.get(client);
      try {
        var msg = room.manager.onMsg(data.msg, room.meta, clientMeta, client);
      } catch (e) {
        if (!(e instanceof WSServerError)) this.log(e.name + ': ' + e.message);
        const response = e instanceof WSServerError ? e.message : 'Server error';
        return this.sendError(client, response);
      }

      if (this.syncMode === 'immediate') {
        return this.broadcastRoom(room, msg, client);
      }
      if (this.syncMode === 'immediate-other') {
        return this.broadcastOtherRoom(room, msg, client);
      }
      if (this.syncMode === 'patch') {
        this.log('TODO: patch world state');
        return true;
      }
    }
    return false;
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
    if (room.chan.clients.size >= room.maxPlayers) throw new WSServerError('Room is full');
    if (room.chan.clients.has(client)) throw new WSServerError('Client already in room');

    try {
      var meta = room.manager.onJoin(data.msg, room.meta, clientMeta, client);
    } catch (e) {
      if (!(e instanceof WSServerError)) this.log(e.name + ': ' + e.message);
      const response = e instanceof WSServerError ? e.message : 'Server error';
      throw new WSServerError(response);
    }

    if (meta === false) throw new WSServerError('Room join aborted');
    if (typeof meta !== 'object') meta = {};

    Object.assign(clientMeta, meta);

    this.addClientToRoom(data.name, clientMeta, client);

    let roomMeta = {};
    try {
      roomMeta = room.manager.onSendRoom(room.meta);
      if (typeof roomMeta !== 'object') roomMeta = {};
    } catch (e) {
      this.log(e.name + ': ' + e.message);
    }

    return { name: room.name, meta: roomMeta };
  }

  clientCreateRoom(data, clientMeta, client) {
    if (this.usersCanNameRoom && data?.name) {
      if (typeof data.name !== 'string') throw new WSServerError('Invalid room name');
      data.name = data.name.trim();
      if (this.rooms.has(data.name)) throw new WSServerError('Room already exists');
    } else {
      data.name = null;
    }

    const roomInstance = new this.roomClass(this);
    try {
      var meta = roomInstance.onCreate(data.name, data.msg, clientMeta, client);
    } catch (e) {
      if (!(e instanceof WSServerError)) this.log(e.name + ': ' + e.message);
      const response = e instanceof WSServerError ? e.message : 'Server error';
      throw new WSServerError(response);
    }

    if (meta === false) throw new WSServerError('Room creation aborted');
    if (typeof meta !== 'object') meta = {};
    if (meta.name && typeof meta.name === 'string') data.name = meta.name;

    const roomName = this.createRoom(data.name ?? null);
    const room = this.rooms.get(roomName);
    room.manager = roomInstance;
    Object.assign(room.meta, meta);

    if (this.autoJoinCreatedRoom) {
      try {
        var metaUser = room.manager.onJoin(data.msg, room.meta, clientMeta, client);
      } catch (e) {
        if (!(e instanceof WSServerError)) this.log(e.name + ': ' + e.message);
        const response = e instanceof WSServerError ? e.message : 'Server error';
        this.deleteRoom(roomName);
        throw new WSServerError(response);
      }

      if (metaUser === false) {
        this.deleteRoom(roomName);
        throw new WSServerError('Room join aborted');
      }
      if (typeof metaUser !== 'object') meta = {};

      Object.assign(clientMeta, meta);
      this.addClientToRoom(roomName, clientMeta, client);
    }

    let roomMeta = {};
    try {
      roomMeta = room.manager.onSendRoom(room.meta);
      if (typeof roomMeta !== 'object') roomMeta = {};
    } catch (e) {
      this.log(e.name + ': ' + e.message);
    }

    this.pubRoomList();
    return { name: roomName, meta: roomMeta };
  }

  addClientToRoom(roomName, clientMeta, client) {
    const room = this.rooms.get(roomName);
    const chan = room.chan;
    const chanClients = room.chanClients;
    if (chan.clients.has(client)) return false;

    this.log('Client ' + clientMeta.id + ' joined room ' + roomName);
    chan.clients.add(client);
    if (this.usersCanGetRoomPlayers) chanClients.clients.add(client);
    this.pubRoomClients(room);
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
      room.manager.onLeave(room.meta, clientMeta, client);
    } catch (e) {
      this.log(e.name + ': ' + e.message);
    }

    this.log('Client ' + clientMeta.id + ' left room ' + roomName);
    chan.clients.delete(client);
    chanClients.clients.delete(client);
    this.pubRoomClients(room);
    if (!this.autoDeleteEmptyRoom || chan.clients.size > 0) return true;
    return this.deleteRoom(roomName);
  }

  deleteRoom(roomName) {
    if (!this.rooms.has(roomName)) return false;
    const room = this.rooms.get(roomName);

    try {
      room.manager.onDispose(room.meta);
    } catch (e) { this.log(e.name + ': ' + e.message); }

    this.log('Room deleted: ' + roomName);
    this.rooms.delete(roomName);
    this.pubRoomList();
    this.channels.delete(this.prefix + roomName + '-clients');
    return this.channels.delete(this.prefix + roomName);
  }

  createRoom(roomName = null, withHook = false) {
    roomName = roomName ?? crypto.randomUUID();
    if (this.rooms.has(roomName)) return false;

    let meta = {};
    let managerInstance = new this.roomClass(this);
    if (withHook) {
      try {
        meta = managerInstance.onCreate(roomName, null, null, null, this);
      } catch (e) { meta = false; }
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
      maxPlayers: this.maxPlayersByRoom,
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

  prepareBroadcastMessage(room, client, msg) {
    let clientMeta = {};
    try {
      clientMeta = room.manager.onSendClient(this.clients.get(client));
      if (typeof clientMeta !== 'object') clientMeta = {};
    } catch (e) {
      this.log(e.name + ': ' + e.message);
    }

    return JSON.stringify({
      action: 'pub',
      chan: this.prefix + room.name,
      msg: {
        client: clientMeta,
        data: msg,
      },
    });
  }

  pubRoomList() {
    let roomsList = [];
    for (const room of this.rooms.values()) {
      let roomMeta = {};
      try {
        roomMeta = room.manager.onSendRoom(room.meta);
        if (typeof roomMeta !== 'object') roomMeta = {};
      } catch (e) { this.log(e.name + ': ' + e.message); }

      roomsList.push({
        name: room.name,
        meta: roomMeta,
        nbPlayers: room.chan.clients.size,
        maxPlayers: room.maxPlayers
      });
    }

    try {
      const roomsListHook = this.roomClass.onSendRoomsList(roomsList);
      if (Array.isArray(roomsListHook)) roomsList = roomsListHook;
    } catch (e) { this.log(e.name + ': ' + e.message); }

    this.pub(this.prefix + 'list', roomsList);
  }

  pubRoomClients(room) {
    const clients = [];
    for (const client of room.chan.clients) {
      let clientMeta = {};
      try {
        clientMeta = room.manager.onSendClient(this.clients.get(client));
        if (typeof clientMeta !== 'object') clientMeta = {};
      } catch (e) { this.log(e.name + ': ' + e.message); }
      clients.push(clientMeta);
    }
    return this.pub(this.prefix + room.name + '-clients', clients);
  }

  broadcastRoom(room, msg, client) {
    const message = this.prepareBroadcastMessage(room, client, msg);
    for (const other of room.chan.clients) {
      this.send(other, message);
    }
    return true;
  }

  broadcastOtherRoom(room, msg, client) {
    const message = this.prepareBroadcastMessage(room, client, msg);
    for (const other of room.chan.clients) {
      if (other === client) continue;
      this.send(other, message);
    }
    return true;
  }

}