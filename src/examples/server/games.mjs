import WSServerRoomManager from '../../websocket/WSServerRoomManager.mjs';
import WSServerGameRoom from '../../websocket/WSServerGameRoom.mjs';
const TAU = Math.PI * 2;

class Player {

  constructor(x, y, angle, life) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.life = life;
    this.isFiring = false;
    this.isMov = false;
    this.isRotL = false;
    this.isRotR = false;
  }

  tick(dt) {
    if (this.isRotL) this.angle -= 0.003 * dt;
    if (this.isRotR) this.angle += 0.003 * dt;
    if (!this.isMov) return;
    this.x += Math.cos(this.angle) * 0.0002 * dt;
    this.y += Math.sin(this.angle) * 0.0002 * dt;
  }

}

const wsServer = new WSServerRoomManager({
  port: 8890,
  origins: '*',
  maxUsersByRoom: 2,
  roomClass: class extends WSServerGameRoom {
    onCreate() {
      this.world = {
        players: [
          new Player(0.1, 0.5, 0, 100),
          new Player(0.9, 0.5, TAU / 2, 100),
        ],
      };
      this.setPatchPerSec(60);
      this.startMainLoop();
    }

    onJoin() {
      return {
        player: this.world.players[this.clients.length === 0 ? 0 : 1],
      };
    }

    onCmdStart_fire(msg, {player}) {
      player.isFiring = true;
    }

    onCmdStop_fire(msg, {player}) {
      player.isFiring = false;
    }

    onCmdStart_turn(msg, {player}) {
      if (msg.dir === 'l') player.isRotL = true;
      if (msg.dir === 'r') player.isRotR = true;
    }

    onCmdStop_turn(msg, {player}) {
      if (msg.dir === 'l') player.isRotL = false;
      if (msg.dir === 'r') player.isRotR = false;
    }

    onCmdStart_move(msg, {player}) {
      player.isMov = true;
    }

    onCmdStop_move(msg, {player}) {
      player.isMov = false;
    }

    onTick(dt) {
      for (const player of this.world.players) player.tick(dt);
    }

    onPatch() {
      return this.world;
    }

    onSendClient(clientMeta) {
      return { user: 'Anon. ' + clientMeta.id.slice(0, 4) };
    }
  },
});

wsServer.start();