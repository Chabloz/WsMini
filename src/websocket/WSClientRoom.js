import WSClient from './WSClient.js';

export default class WSClientRoom extends WSClient {
  prefix = '__room-';

  roomCreateOrJoin(name = null, data = {}, timeout = this.defaultTimeout) {
    return this._roomAction('createOrJoin', name, data, timeout);
  }

  roomCreate(name = null, data = {}, timeout = this.defaultTimeout) {
    return this._roomAction('create', name, data, timeout);
  }

  roomJoin(name, data = {}, timeout = this.defaultTimeout) {
    return this._roomAction('join', name, data, timeout);
  }

  _roomAction(action, name, data = {}, timeout = this.defaultTimeout) {
    const room = new Room(name, {}, this);
    const off = this.roomOnClients(name, clients => room.clients = clients);

    return this.rpc(this.prefix + action, { name, msg: data }, timeout)
      .then(resp => {
        room.meta = resp.meta;
        room.name = resp.name;
        return room;
      }).catch(e => { off(); throw e; });
  }

  roomLeave(name, timeout = this.defaultTimeout) {
    this.clear(`ws:chan:${this.prefix + name}`);
    this.clear(`ws:chan:${this.prefix + name}-clients`);
    return this.rpc(this.prefix + 'leave', { name }, timeout);
  }

  roomSend(name, data = {}) {
    this.wsClient.send(JSON.stringify({action: 'pub-room', room: name, msg: data}));
  }

  roomOnMessage(name, callback) {
    return this.on(`ws:chan:${this.prefix + name}`, callback);
  }

  roomOnRooms(callback) {
    return this.sub(this.prefix + 'list', callback);
  }

  roomOnClients(name, callback) {
    return this.on(`ws:chan:${this.prefix + name}-clients`, callback);
  }

}

class Room {

  constructor(name, meta, wsClient) {
    this.name = name;
    this.wsClient = wsClient;
    this.meta = meta;
    this.clients = [];
  }

  send(data) {
    this.wsClient.roomSend(this.name, data);
  }

  leave() {
    this.wsClient.roomLeave(this.name);
  }

  onMessage(callback) {
    return this.wsClient.roomOnMessage(this.name, callback);
  }

  onClients(callback) {
    return this.wsClient.roomOnClients(this.name, callback);
  }

}