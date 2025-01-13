export default class WSServerRoom {

    constructor(wsServer) {
      this.wsServer = wsServer;
    }

    onCreate(name, msg = null, clientMeta = null, client = null) {
      return {};
    }

    onJoin(msg, roomMeta, clientMeta, client) {
      return {};
    }

    onLeave(roomMeta, clientMeta, client) {

    }

    onDispose(roomMeta) {

    }

    onMsg(msg, roomMeta, clientMeta, client) {
      return msg;
    }

    onSendClient(clientMeta) {
      return clientMeta;
    }

    onSendRoom(roomMeta) {
      return roomMeta;
    }

    static onSendRoomsList(rooms) {
      return rooms;
    }

}