import WSClientRoom from "../../websocket/WSClientRoom.js";

const ws = new WSClientRoom('ws://localhost:8889');
await ws.connect();

const createForm = document.querySelector('#room-form');
const roomsDom = document.querySelector('#room-listing tbody');
const nameInput = document.querySelector('#name');
const errDom = document.querySelector('error-message');
nameInput.focus();

await ws.roomOnRooms(rooms => {
  roomsDom.replaceChildren();
  for (const room of rooms) {
    roomsDom.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${room.name}</td>
        <td>${room.nbPlayers} / ${room.maxPlayers}</td>
        <td><button data-game="${room.name}">TODO</button></td>
      </tr>
    `);
  }
});

createForm.addEventListener('submit', e => {
  e.preventDefault();
  ws.roomCreate(nameInput.value, { color: 'black' }).catch(err => {
      errDom.textContent = err.message;
      setTimeout(() => {errDom.textContent = ''}, 3000);
  });
});