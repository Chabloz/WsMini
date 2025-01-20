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
await ws.connect().catch(err => {
  errDom.textContent = 'Cannot connect to server. Try again later.';
  throw err;
});
errDom.textContent = '';
createForm.querySelector('button').classList.remove('hidden');

let room = null;
const game = {
  prevWorld: null,
  curWorld: null,
  lastUpdateTime: 0,
  interpolationDelay: 50  // [ms], must be the same as server's patch rate
};

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

document.addEventListener('keydown', e => {
  if (!room || e.repeat) return;
  if (e.code === 'Space') game.sendCmd('start_fire');
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') room.sendCmd('start_turn', {dir: 'l'});
  if (e.code === 'ArrowRight' || e.code === 'KeyD') room.sendCmd('start_turn', {dir: 'r'});
  if (e.code === 'ArrowUp' || e.code === 'KeyW') room.sendCmd('start_move');
});

document.addEventListener('keyup', e => {
  if (!room) return;
  if (e.code === 'Space') room.sendCmd('stop_fire');
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') room.sendCmd('stop_turn', {dir: 'l'});
  if (e.code === 'ArrowRight' || e.code === 'KeyD') room.sendCmd('stop_turn', {dir: 'r'});
  if (e.code === 'ArrowUp' || e.code === 'KeyW') room.sendCmd('stop_move');
});

leaveBtn.addEventListener('click', async () => {
  room.leave();
  room = null;
  roomDom.classList.add('hidden');
  lobbyDom.classList.remove('hidden');
});

function joinOrCreateRoom(evt, roomName) {
  evt.preventDefault();
  ws.roomCreateOrJoin(roomName)
    .then(showRoom)
    .catch(err => {
      errDom.textContent = err.message;
      setTimeout(() => {errDom.textContent = ''}, 3000);
    });
}

function showRoom(theRoom) {
  room = theRoom;
  roomName.textContent = room.name;
  roomDom.classList.remove('hidden');
  lobbyDom.classList.add('hidden');
  room.onMessage(updateWorld);
  room.onClients(onClients);
}

function onClients(users) {
  usersListDom.replaceChildren();
  for (const data of users) {
    usersListDom.insertAdjacentHTML('beforeend', `<a-user>${data.user}</a-user>`);
  }
}

function updateWorld(world) {
  game.prevWorld = game.curWorld;
  game.curWorld = structuredClone(world);
  game.curWorld.timestamp = performance.now();
  game.lastUpdateTime = performance.now();
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function clamp(val, min = 0, max = 1) {
  return Math.min(max, Math.max(min, val));
}

function getInterpolatedWorld() {
  if (!game.prevWorld) return game.curWorld;

  const now = performance.now();
  const dt = now - game.lastUpdateTime;
  const alpha = clamp(dt / game.interpolationDelay);

  return {
    ...game.curWorld,
    players: game.curWorld.players.map((_, ind) => getInterpolatedPlayer(ind, alpha)),
  };
}

function getInterpolatedPlayer(ind, alpha) {
  const player = game.curWorld.players[ind];
  const prevPlayer = game.prevWorld.players[ind];
  return {
    ...player,
    x: lerp(prevPlayer.x, player.x, alpha),
    y: lerp(prevPlayer.y, player.y, alpha)
  };
}

function drawPlayer(player) {
  ctx.fillStyle = player.color;
  ctx.strokeStyle = player.color;
  ctx.beginPath();
  ctx.arc(player.x * canvas.width, player.y * canvas.height, 10, 0, Math.PI * 2);
  ctx.moveTo(player.x * canvas.width, player.y * canvas.height);
  ctx.lineTo(
    player.x * canvas.width + 20 * Math.cos(player.angle),
    player.y * canvas.height + 20 * Math.sin(player.angle)
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function draw() {
  requestAnimationFrame(draw);
  if (!game?.curWorld) return;

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  for (const player of getInterpolatedWorld().players) {
    drawPlayer(player);
  }
}
requestAnimationFrame(draw);