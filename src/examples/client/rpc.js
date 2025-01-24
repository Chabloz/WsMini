import WSClient from "../../websocket/WSClient.js";

const ws = new WSClient('ws://localhost:8888');
await ws.connect();

const resultsDom = document.querySelector('#results');
const rpcForm = document.querySelector('#rpc-form');

rpcForm.addEventListener('submit', async (evt) => {
  evt.preventDefault();

  const n1 = Number(document.querySelector('#n1').value);
  const n2 = Number(document.querySelector('#n2').value);

  const result = await ws.rpc('add', {n1, n2});

  resultsDom.textContent = result;
  // Or with error management
  // let result;
  // ws.rpc('add', {n1, n2})
  //   .then(response => result = response)
  //   .catch(err => result = err)
  //   .finally(() => resultsDom.textContent = result);
});
