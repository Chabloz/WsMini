import WSClientRoom from "../../websocket/WSClientRoom.js";

const ws = new WSClientRoom('ws://localhost:8889');
await ws.connect();

const createForm = document.querySelector('#room-form');
const roomsDom = document.querySelector('#room-listing tbody');
const lobbyDom = document.querySelector('the-lobby');
const roomDom = document.querySelector('the-room');
const roomName = document.querySelector('#room-name');
const nameInput = document.querySelector('#name');
const errDom = document.querySelector('error-message');
const chatDom = document.querySelector('#chat');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-form input');
const usersListDom = document.querySelector('the-users-list');
const leaveBtn = document.querySelector('#leave');

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
chatForm.addEventListener('submit', e => {
  e.preventDefault();
  curRoom.send(chatInput.value);
  chatInput.value = '';
});
leaveBtn.addEventListener('click', () => {
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
  chatDom.replaceChildren();
  roomName.textContent = room.name;
  roomDom.classList.remove('hidden');
  lobbyDom.classList.add('hidden');
  room.onMessage(onRoomMessage);
  room.onClients(onClients);
  chatInput.focus();
}

function onRoomMessage(data) {
  chatDom.insertAdjacentHTML('beforeend', `
    <p>
      <time>${new Date(data.time).toLocaleTimeString()}</time>
      <the-user>${data.user}</the-user>
      <the-msg>${data.msg}</the-msg>
    </p>
  `);
  chatDom.scrollTop = chatDom.scrollHeight;
}

function onClients(users) {
  usersListDom.replaceChildren();
  for (const data of users) {
    usersListDom.insertAdjacentHTML('beforeend', `<a-user>${data.user}</a-user>`);
  }
}