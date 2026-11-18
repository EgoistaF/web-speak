// Сообщения, которыми обмениваются клиенты через signaling-сервер.
// Сервер просто пересылает всё второму участнику, а сам шлёт только 'peer-left'.
export type SignalMessage =
  | { type: 'join' }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'bye' }
  | { type: 'peer-left' };

type Handlers = {
  onMessage: (msg: SignalMessage) => void;
  onOpen: () => void;
  onClose: () => void;
};

export class Signaling {
  private ws: WebSocket | null = null;

  constructor(private readonly url: string, private readonly handlers: Handlers) {}

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => this.handlers.onOpen();
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.handlers.onClose();
    };
    ws.onerror = (e) => console.error('[signaling] error', e);
    ws.onmessage = async (event) => {
      const raw = event.data instanceof Blob ? await event.data.text() : String(event.data);
      try {
        const msg = JSON.parse(raw) as SignalMessage;
        if (msg && typeof msg.type === 'string') this.handlers.onMessage(msg);
      } catch {
        console.warn('[signaling] не JSON:', raw);
      }
    };
  }

  send(msg: SignalMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}
