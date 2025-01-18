import WSServerRoomManager from '../../websocket/WSServerRoomManager.mjs';
import WSServerGameRoom from '../../websocket/WSServerGameRoom.mjs';

const wsServer = new WSServerRoomManager({
  port: 8890,
  origins: '*',
  maxUsersByRoom: 10,
  roomClass: class extends WSServerGameRoom {
    onCreate() {
      // Init the World
      this.world = {};
      // Start the main loop
      this.setPatchPerSec(1);
      this.startMainLoop();
    }

    onMsg(msg, clientMeta, client) {
      // validate and store clients inputs
    }

    onTick(deltaTime, elapsedTime) {
      // Apply the clients inputs to the World (using deltaTime for an accurate simulation)
      this.world = {
        time: Date.now(),
        user: 'Server',
        msg: 'World Update',
      };
    }

    onPatch(deltaTime, elapsedTime) {
      return this.world;
    }

    onSendClient(clientMeta) {
      return { user: 'Anon. ' + clientMeta.id.slice(0, 4) };
    }
  },
});

wsServer.start();