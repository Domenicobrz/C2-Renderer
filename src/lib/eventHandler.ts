type Callback = (args: any) => void;

export class EventHandler {
  #listenersMap: { [key: string]: Callback[] };

  constructor() {
    this.#listenersMap = {};
  }

  fireEvent(name: string, args?: any) {
    const callbacks = this.#listenersMap[name];
    if (!callbacks) return;

    callbacks.forEach((callback) => {
      callback(args);
    });
  }

  addEventListener(name: string, callback: Callback) {
    if (!this.#listenersMap[name]) {
      this.#listenersMap[name] = [];
    }

    this.#listenersMap[name].push(callback);
  }

  removeEventListener(name: string, callback: Callback) {
    if (!this.#listenersMap[name]) return;

    const callbacks = this.#listenersMap[name];

    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }
}
