import WSServerPubSub from '../../websocket/WSServerPubSub.mjs';

function authCallback(token) {
  //  return false to deny the connection
  if (token != 'auth-token') return false; // replace with your auth logic
  // On the auth callback, you can return metadata about the user
  return {
    color: `hsl(${Math.floor(Math.random() * 360)}, 100%, 50%)`,
  };
}

const wsServer = new WSServerPubSub({
  port: 8887,
  origins: '*',
  authCallback,
});

wsServer.addChannel('chat', {
  // This hook is called before the message is broadcasted to the channel
  // You can modify the message before it is sent to all subscribers
  // 'user' contains the metadata of the user that published the message
  hookPub: (msg, user) => ({
    time: Date.now(),
    user: 'Anon. ' + user.id.slice(0, 4),
    color: user.color,
    msg,
  }),
});

// This is a bot that sends a message to the chat channel every 5 seconds
// The hook will not be called for this message
// (hookPub is only called for messages published by clients)
setInterval(() => {
  wsServer.pub('chat', {
    time: Date.now(),
    user: 'Bot',
    color: 'tomato',
    msg: 'Bot message',
  });
}, 5000);

wsServer.start();