import WSClient from "../../websocket/WSClient.js";

const ws = new WSClient('ws://localhost:8887');

ws.on('close', () => console.log('Connection closed'));

await ws.connect('auth-token'); // replace with your auth token

const chatDom = document.querySelector('#chat');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-form input');
chatInput.focus();

ws.sub('chat', data => {
  chatDom.insertAdjacentHTML('beforeend', `
    <p>
      <time>${new Date(data.time).toLocaleTimeString()}</time>
      <the-user style="color: ${data.color}">
        ${data.user}
      </the-user>
      <the-msg>${data.msg}</the-msg>
    </p>
  `);
  chatDom.scrollTop = chatDom.scrollHeight;
});

chatForm.addEventListener('submit', e => {
  e.preventDefault();
  ws.pub('chat', chatInput.value);
  chatInput.value = '';
});