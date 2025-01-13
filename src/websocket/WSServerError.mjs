export default class WSServerError extends Error {

  constructor(message) {
    super(message);
    this.name = 'WSServerError';
  }

}