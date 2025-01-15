import WSServerRoomManager from '../../websocket/WSServerRoomManager.mjs';
import WSServerError from '../../websocket/WSServerError.mjs';
import WSServerRoom from '../../websocket/WSServerRoom.mjs';

const wsServer = new WSServerRoomManager({
  port: 8889,
  origins: '*',
  maxUsersByRoom: 10, // Specifiy the maximum number of clients by room
  /*
    Specify if users can create rooms
    If false, you should code your own room creation logic in the server side
  */
  usersCanCreateRoom: true,
  /*
    Specify if users can name rooms
    If false, the server will generate an UUID for the room name
  */
  usersCanNameRoom: true,
  /*
    Specify if users can list rooms
    If false, you should code your own room listing (or room joining) logic
  */
  usersCanListRooms: true,
  /*
    Specify if users can get the list of users in a room
  */
  usersCanGetRoomUsers: true,

  /*
    Specify if user creating a room should automatically join it
  */
  autoJoinCreatedRoom: true,

  /*
    Specify if empty rooms should be automatically deleted when the last user leaves
    If false, you should code your own room deletion logic
  */
  autoDeleteEmptyRoom: true,

  /*
    Specify if the room list should be automatically sent when the number of users in a room changes
    usersCanListRooms must be true for this to work
    If false, you should code your own room list update to the clients
  */
  autoSendRoomListOnUsersChange: true,

  /*
    You can provide a custom room class extending WSServerRoom to handle room events
    This is optional, if not provided, the default WSServerRoom will be used
    all the room events are optional, you can choose which one you want to handle
  */
  roomClass: class extends WSServerRoom {

    /*
      When a room is created, this will be called before the room is added to the server

      'msg' contains additional data sent by the client
      (see the room client example to see how to send additional data)
      You can use this additional data to customize the room creation (game mode, room options, etc)

      'clientMeta' contains the client meta that created the room
      It will be null if the room is created by the server

      'client' is the websocket client that created the room
      It will be null if the room is created by the server
      You should rarely use this parameter

      Dont forget to validate the ALL client data before using it
    */
    onCreate(name, msg = null, clientMeta = null, client = null) {
      // Throw a WSServerError to reject the room creation (the client promise will then be rejected)
      if (name === 'bad-words') throw new WSServerError('Bad words are not allowed');
      // You can return an object that will be available in the room instance as this.meta
      // If you want to change the room name, you can return the name in the object
      // this will be useful if you want to sanitize the room name
      return {};
    }

    /*
      When a client joins the room, this hook will be called before the client is added to the room

      'msg' contains additional data sent by the client
      For example, for a chess game, you can send the client color (black or white)

      The object returned by this hook will be added to the client meta

      Dont forget to validate the ALL client data before using it
    */
    onJoin(msg, clientMeta, client) {
      // Throw a WSServerError to reject the client join (the client promise will then be rejected)
      // if (msg?.color !== 'black' && msg?.color !== 'white') throw new WSServerError('Invalid color');
      return { color: msg.color };
    }

    /*
      When a client sends a message to the room,
      this hook will be called before the message is broadcasted to the room clients

      'msg' contains the message sent by the client
    */
    onMsg(msg, clientMeta, client) {
      // For example, you can invalidate an illegal move in a chess game
      // The test is just an example, you should implement your own game logic
      // isInvalid = !msg.move ||
      //   !Number.isInteger(msg.move.col) ||
      //   !Number.isInteger(msg.move.row) ||
      //   msg.move.col < 0 || msg.move.col > 7 ||
      //   msg.move.row < 0 || msg.move.row > 7;
      // if (isInvalid) throw new WSServerError('Invalid move');

      // You can modify the message sent by the client
      // For example, you can add a timestamp to the message
      // This object will be sent to all clients in the room
      return {
        time: Date.now(),
        user: 'Anon. ' + clientMeta.id.slice(0, 4),
        msg,
      };
    }

    /*
      When a client leaves the room, this hook will be called before the client is removed from the room
    */
    onLeave(clientMeta, client) {

    }

    /*
      When a room is deleted, this hook will be called before the room is removed from the server
      You can use this hook to log results, save data, etc
    */
    onDispose() {

    }

    /*
      When the server is sending client metadata to any client,
      this hook will be called before the metadata is sent
      You can modify the client metadata before it is sent

      This is useful if you want to hide some client data from the client side
    */
    onSendClient(clientMeta) {
      return {
        user: 'Anon. ' + clientMeta.id.slice(0, 4),
      };
    }

    /*
      When the server is sending room metadata to any client,
      this hook will be called before the metadata is sent
      You can modify the room metadata before it is sent

      This is useful if you want to hide some room data from the client side
    */
    onSendRoom() {
      return this.meta;
    }

    /*
      When the server is sending the list of rooms to any client,
      You can modify the list of rooms before it is sent

      for example, you can hide allready full rooms or running games
    */
    static onSendRoomsList(rooms) {
      return rooms;
    }

  },
});

wsServer.start();