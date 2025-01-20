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

let curRoom = null;

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
  if (!curRoom || e.repeat) return;
  if (e.code === 'Space') curRoom.sendCmd('start_fire');
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') curRoom.sendCmd('start_turn', {dir: 'l'});
  if (e.code === 'ArrowRight' || e.code === 'KeyD') curRoom.sendCmd('start_turn', {dir: 'r'});
  if (e.code === 'ArrowUp' || e.code === 'KeyW') curRoom.sendCmd('start_move');
});

document.addEventListener('keyup', e => {
  if (!curRoom) return;
  if (e.code === 'Space') curRoom.sendCmd('stop_fire');
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') curRoom.sendCmd('stop_turn', {dir: 'l'});
  if (e.code === 'ArrowRight' || e.code === 'KeyD') curRoom.sendCmd('stop_turn', {dir: 'r'});
  if (e.code === 'ArrowUp' || e.code === 'KeyW') curRoom.sendCmd('stop_move');
});

leaveBtn.addEventListener('click', async () => {
  curRoom.leave();
  curRoom = null;
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

function showRoom(room) {
  curRoom = room;
  roomName.textContent = room.name;
  roomDom.classList.remove('hidden');
  lobbyDom.classList.add('hidden');
  room.onMessage(onWorldUpdate);
  room.onClients(onClients);
}

function onWorldUpdate(world) {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  for (const player of world.players) {
    drawPlayer(player);
  }
}

function onClients(users) {
  usersListDom.replaceChildren();
  for (const data of users) {
    usersListDom.insertAdjacentHTML('beforeend', `<a-user>${data.user}</a-user>`);
  }
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