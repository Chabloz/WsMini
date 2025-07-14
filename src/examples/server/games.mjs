import WSServerRoomManager from '../../websocket/WSServerRoomManager.mjs';
import WSServerGameRoom from '../../websocket/WSServerGameRoom.mjs';
import WSServerError from '../../websocket/WSServerError.mjs';
/*
  Very simple game server example
  - No real game logic, just a simple simulation of players moving around
  - 4 players per room
  - Players can move forward, backward, rotate left and right
  - Players can create, join and leave rooms
  - Rooms will automatically close when all players leave
*/

/*
 Helper function to clamp a value between a min and max
 All positions values are normalized between 0 and 1
 Clients will be responsible to denormalize them to the canvas size
*/
function clamp(val, min = 0, max = 1) {
  return Math.min(max, Math.max(min, val));
}

/*
  Each player has a position (x, y), angle (in radian) and a color
  The player can be in one of the following states:
  - isTaken: if the player is taken by a client
  - isMovF: if the player is moving forward
  - isMovB: if the player is moving backward
  - isRotL: if the player is rotating left
  - isRotR: if the player is rotating right

  The room loop will call the 'tick' method for each player
*/
class Player {

  constructor(x, y, angle, color) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.color = color;
    this.resetState();
  }

  resetState() {
    this.isTaken = false;
    this.isMovF = false;
    this.isMovB = false;
    this.isRotL = false;
    this.isRotR = false
  }

  /*
   * This will recieved the delta time from the room loop
   * By default dt is ~16.666 ms (60 tick per second)
   * but you can change it in the 'onCreate' method of the room
   * Always use dt to make the game frame rate independent
   */
  tick(dt) {
    if (this.isRotL) this.angle -= 0.003 * dt;
    if (this.isRotR) this.angle += 0.003 * dt;
    const deltaX = Math.cos(this.angle) * 0.0002 * dt;
    const deltaY = Math.sin(this.angle) * 0.0002 * dt;
    if (this.isMovF) {
      this.x += deltaX;
      this.y += deltaY;
    }
    if (this.isMovB) {
      this.x -= deltaX;
      this.y -= deltaY;
    }
    this.x = clamp(this.x);
    this.y = clamp(this.y);
  }
}

const wsServer = new WSServerRoomManager({
  port: 8890, // For production use 443 (the default port for WSS)
  origins: '*', // For convenience, but you should restrict it to your domain
  maxUsersByRoom: 4,
  maxNbOfClients: 100, // This will allow 25 rooms (100 / 4 players per room)
  roomClass: class extends WSServerGameRoom {
    /*
      This method will be called when a new room is created.
      You can use it to initialize the world state, set the tick rate, patch rate, etc.
      The roomName will be the name of the room, it can be used to identify the room
      or to validate the room creation.
      You can also use it to set the room meta data (like the room name, description, etc)
      that will be sent to the clients when they request the room list or room details.
      To set the room meta data, return an object with the meta data properties at the end of this method.
      The room meta data will be empty by default if you don't return anything.
    */
    onCreate(roomName) {
      // Always validate the data from the client
      if (!/^[a-zA-Z0-9-_]+$/.test(roomName)) {
        throw new WSServerError('Only alphanumeric, - and _ are allowed');
      };
      // Initialize the world as you see fit
      this.world = {
        players: [
          new Player(0.1, 0.5, 0, 'tomato'),
          new Player(0.9, 0.5, Math.PI, 'dodgerblue'),
          new Player(0.5, 0.1, Math.PI / 2, 'limegreen'),
          new Player(0.5, 0.9, -Math.PI / 2, 'gold'),
        ],
      };
      // You can start the main loop here or wait a specific event and start it later
      // You can change the tick rate if you want
      // this.setSimulationPerSec(60); //60 is the default (~16.6666ms)
      // and the patch rate (the rate for sending the world state to the clients)
      this.setPatchPerSec(60); // 20 is the default (50ms), but we put it to 60 to have a smoother experience with the "game with no interpolation" example
      this.startMainLoop();
    }

    /*
      This method will be called when a client joins a room.
      You can use it to initialize the client state, find a player slot, etc.
      The clientMeta will contain the client meta data (like the user name, etc)
      You can return an object here. It will be added to the client meta.
    */
    onJoin(msg, clientMeta, client) {
      // When a client joins the room, we need to find a 'player slot' for him
      // (taking the first available player instance)
      let player;
      for (const p of this.world.players) {
        if (p.isTaken) continue
        p.isTaken = true;
        player = p;
        break;
      }
      return { player };
    }

    onLeave({player}, client) {
      // When a client leaves the room, we need to free the player slot
      // and reset the player state
      // we don't reset the position, but you can do it if you want
      player.resetState();
    }

    /*
      You can define custom commands. Prefix all your commands methods with 'onCmd'.
      The rest of the method name must match the command name (the first letter will be uppercased automatically).
      Look at the client code to see how to send a command to the server it will be something like:
      room.sendCmd('start_turn', {dir: 'l'})
      Do not update the world directly in a command method, you should update the world in the 'tick' method.
      Here we use the player instance to activate or deactivate a state.
      The state will be used in the 'tick' method to update the player position and angle.
    */
    onCmdStart_turn(msg, { player }) {
      if (msg.dir === 'l') player.isRotL = true;
      if (msg.dir === 'r') player.isRotR = true;
    }

    onCmdStop_turn(msg, { player }) {
      if (msg.dir === 'l') player.isRotL = false;
      if (msg.dir === 'r') player.isRotR = false;
    }

    onCmdStart_move(msg, { player }) {
      if (msg.back) player.isMovB = true;
      if (!msg.back) player.isMovF = true;
    }

    onCmdStop_move(msg, { player }) {
      if (msg.back) player.isMovB = false;
      if (!msg.back) player.isMovF = false;
    }

    /*
      This tick method will be called at the simulation rate you set in the 'onCreate' method
      dt will be the delta time between each tick, 60 tick per second by default (~16.6666ms)
      You can use it to update the world state. Here we update the player positions and angles
      calling the 'tick' method of each player instanc with the delta time
    */
    onTick(dt) {
      for (const player of this.world.players) player.tick(dt);
    }

    /*
      This method will be called at the patch rate you set in the 'onCreate' method.
      20 patch per second by default (50ms).
      You should use it to send the world state to the clients.
      You can modify the world state before sending it to the clients
      or add some extra data (timming, etc) to the world state.
      For this simple example, we just send the world state as it is.
    */
    onPatch() {
      return this.world;
    }

    /*
      This method will be called when the the server is sending the client list of a room.
      You can modify the client meta data before sending it to the client.
      Here we only return the user name (Anon. + the first 4 characters of the client id),
      because we don't have a real user system. Look at the "onAuthCallback" method
      of the chat example to see how to implement it to your needs.
    */
    onSendClient(clientMeta) {
      return { user: 'Anon. ' + clientMeta.id.slice(0, 4) };
    }
  },
});

wsServer.start();