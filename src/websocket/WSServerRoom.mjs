import WSServerRoomManager from "./WSServerRoomManager.mjs";

export default class WSServerRoom {

    /**
     * @param {string} name
     * @param {WSServerRoomManager} wsServer
     *
    */
    constructor(name, wsServer) {
      this.wsServer = wsServer;
      this.name = name;
    }

    get clients() {
      return this.wsServer.getClientsOfRoom(this.name);
    }

    get meta() {
      return this.wsServer.getRoomMeta(this.name);
    }

    isFull() {
      return this.wsServer.isRoomFull(this.name);
    }

    onCreate(name, msg = null, clientMeta = null, client = null) {
      return {};
    }

    onJoin(msg, clientMeta, client) {
      return {};
    }

    onLeave(clientMeta, client) {

    }

    onDispose() {

    }

    onMsg(msg, clientMeta, client) {
      return msg;
    }

    onSendClient(clientMeta) {
      return clientMeta;
    }

    onSendRoom() {
      return this.meta;
    }

    broadcast(msg, client = null) {
      this.wsServer.broadcastRoomName(this.name, msg, client);
    }

    static onSendRoomsList(rooms) {
      return rooms;
    }

}