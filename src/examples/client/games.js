/*
 Simple example of a multiplayer game using the WebSocket API

 You should look first at the server code to understand the game loop and the server's logic
 Look at simpler examples like the chat and rooms examples to understand the WebSocket API first
*/
import WSClientRoom from "../../websocket/WSClientRoom.js";
const createForm = document.querySelector('#room-form');
const roomsDom = document.querySelector('#room-listing tbody');
const lobbyDom = document.querySelector('the-lobby');
const roomDom = document.querySelector('the-room');
const roomName = document.querySelector('#room-name');
const nameInput = document.querySelector('#name');
const errDom = document.querySelector('error-message');
const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const usersListDom = document.querySelector('the-users-list');
const leaveBtn = document.querySelector('#leave');

const ws = new WSClientRoom('ws://localhost:8890');
createForm.querySelector('button').classList.add('hidden');
errDom.textContent = 'Connecting to server...';
/*
  The connect method returns a promise that will resolve when the connection is established
  You can catch the error if the connection fails. The connection failed if:
  - The server is not running
  - The server is full
  - The authentication failed (not using authentication in this example)
*/
await ws.connect().catch(err => {
  errDom.textContent = 'Cannot connect to server. Try again later.';
  throw err;
});
errDom.textContent = '';
createForm.querySelector('button').classList.remove('hidden');

let room = null;

/*
  This constant will store the game World state and the last World state
  to interpolate the player positions between each patch from the server.
  The delay is the same as the server's patch rate to have a smooth rendering.

  You are not forced to interpolate, you can just draw the player positions
  But if you do not, you should patch the world at a high rate (for example 60 per second)
  to have a smooth rendering (see the server code for more details)
  In this example we patch the world at 20 patch per second (50ms the default value)
*/
const game = {
  prevWorld: null,
  curWorld: null,
  lastUpdateTime: 0,
  delay: 50  // [ms], must be the same as server's patch rate (default 50ms)
};

/*
  The following is nearly the same as the rooms example
  you can look at the rooms example to see how it works.
  Jump directly to line 83.
*/
nameInput.focus();

await ws.roomOnRooms(rooms => {
  roomsDom.replaceChildren();
  for (const room of rooms) {
    roomsDom.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${room.name}</td>
        <td>${room.nbUsers} / ${room.maxUsers}</td>
        <td><button data-game="${room.name}">Join</button></td>
      </tr>
    `);
  }
});

createForm.addEventListener('submit', (e) => joinOrCreateRoom(e, nameInput.value));
roomsDom.addEventListener('click', e => {
  if (e.target.tagName != 'BUTTON') return;
  joinOrCreateRoom(e, e.target.dataset.game);
});

/*
  Adding keyboard events to send commands to the server.
  Usually you would send commands on keydown and stop the command on keyup.
  Here we use key.code to have a better compatibility with different keyboard layouts.
*/
document.addEventListener('keydown', e => {
  if (!room || e.repeat) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') room.sendCmd('start_turn', {dir: 'l'});
  if (e.code === 'ArrowRight' || e.code === 'KeyD') room.sendCmd('start_turn', {dir: 'r'});
  if (e.code === 'ArrowUp' || e.code === 'KeyW') room.sendCmd('start_move', {back: false});
  if (e.code === 'ArrowDown' || e.code === 'KeyS') room.sendCmd('start_move', {back: true});
});

document.addEventListener('keyup', e => {
  if (!room) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') room.sendCmd('stop_turn', {dir: 'l'});
  if (e.code === 'ArrowRight' || e.code === 'KeyD') room.sendCmd('stop_turn', {dir: 'r'});
  if (e.code === 'ArrowUp' || e.code === 'KeyW') room.sendCmd('stop_move', {back: false});
  if (e.code === 'ArrowDown' || e.code === 'KeyS') room.sendCmd('stop_move', {back: true});
});

/*
  On leave, we switch back to the lobby and clear the canvas
*/
leaveBtn.addEventListener('click', async () => {
  room.leave();
  room = null;

  // Clear the canvas, this is better than clearRect because it is responsive
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  roomDom.classList.add('hidden');
  lobbyDom.classList.remove('hidden');
});

function joinOrCreateRoom(evt, roomName) {
  evt.preventDefault();
  ws.roomCreateOrJoin(roomName)
    .then(showRoom)
    .catch(err => {
      errDom.textContent = err.message;
      setTimeout(() => errDom.textContent = '', 3000);
    });
}

/*
  When joining a game, we add a handler to update the world state
*/
function showRoom(theRoom) {
  room = theRoom;
  roomName.textContent = room.name;
  roomDom.classList.remove('hidden');
  lobbyDom.classList.add('hidden');
  // The server will send the world state at the patch rate (see the server code for more details)
  room.onMessage(updateWorld);
  // The server will send the client list when a user is joining or leaving the room (or is disconnected)
  room.onClients(onClients);
}

function onClients(users) {
  // we just replace the users list with the new list
  usersListDom.replaceChildren();
  for (const data of users) {
    usersListDom.insertAdjacentHTML('beforeend', `<a-user>${data.user}</a-user>`);
  }
}

/*
  We store two world states to interpolate the player positions between each patch from the server.
  This way we can store the previous world state and the current world state without any reference between them.
  We store the timestamp of the current world state to calculate the delta time between each tick.
*/
function updateWorld(world) {
  game.prevWorld = game.curWorld;
  game.curWorld = world;
  game.lastUpdateTime = performance.now();
}

/*
  We use a simple linear interpolation to smooth the player positions
*/
function lerp(start, end, t) {
  return start + (end - start) * t;
}

/*
  Clamp a value between a min and a max
  We need to normalize the interpolation progress between 0 and 1
*/
function clamp(val, min = 0, max = 1) {
  return Math.min(max, Math.max(min, val));
}

/*
  This returns the interpolated world state.
  If there is no previous world state, we return the current world state.
  (Nothing to interpolate at the first frame)
*/
function getInterpolatedWorld() {
  if (!game.prevWorld) return game.curWorld;

  // We calculate the progress (between 0 and 1) of the interpolation
  const now = performance.now();
  const dt = now - game.lastUpdateTime;
  const progress = clamp(dt / game.delay);

  return {
    ...game.curWorld,
    // On this small example we only interpolate the player positions
    players: game.curWorld.players.map((_, ind) => getInterpolatedPlayer(ind, progress)),
  };
}

function getInterpolatedPlayer(ind, progress) {
  const player = game.curWorld.players[ind];
  const prevPlayer = game.prevWorld.players[ind];
  return {
    ...player,
    // Only position is interpolated,
    // but on a real game you should interpolate the angle and other properties
    x: lerp(prevPlayer.x, player.x, progress),
    y: lerp(prevPlayer.y, player.y, progress)
  };
}

/*
  Draw the player on the canvas
  We use no libraries to keep the example simple and just use the 2D canvas API

  In this example, the data is normalized between 0 and 1,
  so we need to denormalize the values to the canvas size.

  Canvas ratio is 1:1 (square), see the CSS for more details.
  This will ensure that the velocity is the same in all directions.
*/
function drawPlayer(player) {
  // Body
  ctx.fillStyle = player.color;
  ctx.strokeStyle = player.color;
  ctx.beginPath();
  ctx.arc(player.x * canvas.width, player.y * canvas.height, 10, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Eyes
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(player.x * canvas.width + 5 * Math.cos(player.angle - .7), player.y * canvas.height + 5 * Math.sin(player.angle - .7), 3, 0, Math.PI * 2);
  ctx.arc(player.x * canvas.width + 5 * Math.cos(player.angle + .7), player.y * canvas.height + 5 * Math.sin(player.angle + .7), 3, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  // Pupils
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(player.x * canvas.width + 5 * Math.cos(player.angle - .7), player.y * canvas.height + 5 * Math.sin(player.angle - .7), 1, 0, Math.PI * 2);
  ctx.arc(player.x * canvas.width + 5 * Math.cos(player.angle + .7), player.y * canvas.height + 5 * Math.sin(player.angle + .7), 1, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
}

/*
 Main draw loop
 We does not calculate the delta time because we interpolate the player positions.
 To see a very good explanation of the anatomy of a game loop, see: https://www.isaacsukin.com/news/2015/01/detailed-explanation-javascript-game-loops-and-timing
 You'll find the "real" game loop in the WSServerGameRoom class.
*/
function draw() {
  requestAnimationFrame(draw);
  if (!game?.curWorld) return;

  // Clear the canvas, this is better than clearRect because it is responsive
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  for (const player of getInterpolatedWorld().players) {
    drawPlayer(player);
  }
}

requestAnimationFrame(draw);
