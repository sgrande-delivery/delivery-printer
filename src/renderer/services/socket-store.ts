import constants from 'constants/constants';
import { io, Socket } from 'socket.io-client';

type SocketSnapshot = {
  socket: Socket | null;
  isConnected: boolean;
};

type SocketListener = () => void;

type Auth = { [key: string]: string };

export class SocketStore {
  private socket: Socket | null = null;
  private isConnected = false;
  private listeners = new Set<SocketListener>();
  private auth: Auth | undefined;

  private snapshot: SocketSnapshot = {
    socket: this.socket,
    isConnected: this.isConnected,
  };

  constructor(private readonly namespace: string) {}

  private update(nextSocket: Socket | null, nextIsConnected: boolean) {
    if (this.snapshot.socket === nextSocket && this.snapshot.isConnected === nextIsConnected) {
      return;
    }

    this.snapshot = {
      socket: nextSocket,
      isConnected: nextIsConnected,
    };
  }

  connect(id?: string) {
    if (this.socket) {
      return;
    }

    const url = `${constants.WS_BASE_URL}/${this.namespace}`;

    if (id) {
      this.setAuth(id);
    }

    const socket = io(url, {
      autoConnect: true,
      withCredentials: true,
      transports: ['websocket'],
      auth: this.auth,
      query: {
        app: 'admin',
      },
    });

    socket.on('connect', () => {
      this.isConnected = true;
      this.update(this.socket, this.isConnected);
      this.emit();
    });

    socket.on('disconnect', () => {
      this.isConnected = false;
      this.update(this.socket, this.isConnected);
      this.emit();
    });

    this.socket = socket;
    this.update(this.socket, this.isConnected);
    this.emit();
  }

  private setAuth(id: string) {
    this.auth = {
      'x-restaurant-uuid': id,
    };
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  getSnapshot(): SocketSnapshot {
    return this.snapshot;
  }

  subscribe(listener: SocketListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.isConnected = false;
    this.update(this.socket, this.isConnected);
    this.emit();
  }
}
