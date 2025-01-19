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

    onCmdFire(msg, clientMeta, client) {
      // Handle a custom command
      console.log('User ' + clientMeta.id.slice(0, 4) + ' send "Fire" cmd', msg);
    }

    onMsg(msg, clientMeta, client) {
      // handle a all other messages
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