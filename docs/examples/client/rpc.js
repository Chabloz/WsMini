import { WSClient } from "../../../src/browser.js";

const ws = new WSClient('ws://localhost:8888');
await ws.connect();

const resultsDom = document.querySelector('#results');
const rpcForm = document.querySelector('#rpc-form');

rpcForm.addEventListener('submit', async (evt) => {
  evt.preventDefault();

  const n1 = Number(document.querySelector('#n1').value);
  const n2 = Number(document.querySelector('#n2').value);

  let result = null;
  ws.rpc('add', {n1, n2})
    .then(response => result = response)
    .catch(err => result = err)
    .finally(() => resultsDom.textContent = result);

  // Or without error handling:
  // resultsDom.textContent = await ws.rpc('add', {n1, n2});
});

// Example of listening to a command sent by the server
ws.onCmd('foo', (data) => console.log('Received foo command:', data));
