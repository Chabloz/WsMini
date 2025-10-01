import { WSServerRoomManager, WSServerRoom } from '../../../src/node.js';

const wsServer = new WSServerRoomManager({
  port: 8889,
  origins: '*',
  maxUsersByRoom: 10,
  roomClass: class extends WSServerRoom {

    onMsg(msg, clientMeta, client) {
      return {
        time: Date.now(),
        user: 'Anon. ' + clientMeta.id.slice(0, 4),
        msg,
      };
    }

    onSendClient(clientMeta) {
      return { user: 'Anon. ' + clientMeta.id.slice(0, 4) };
    }

    onCreate(name, msg = null, clientMeta = null, client = null) {
      // Some bot examples
      this.timer = setInterval(() => this.broadcastCmd('foo', { foo: 'bar' }), 5000);
      this.timer2 = setInterval(() => this.broadcast({
        time: Date.now(),
        user: 'Bot',
        msg: "I'm a bot, I send a message every 10 seconds",
      }), 10000);
    }

    onDispose() {
      // Clear the timer when the room is deleted
      clearInterval(this.timer);
      clearInterval(this.timer2);
    }

  },
});

wsServer.start();