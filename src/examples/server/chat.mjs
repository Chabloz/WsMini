import WSServerPubSub from '../../websocket/WSServerPubSub.mjs';

const wsServer = new WSServerPubSub({
  port: 8887,
  origins: '*',
});

wsServer.addChannel('chat', {
  hookPub: (msg, user) => {
    return {
      time: Date.now(),
      user: 'Anon. ' + user.id.slice(0, 4),
      msg,
    };
  },
});

wsServer.start();