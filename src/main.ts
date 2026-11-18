import './style.css';
import { Signaling, type SignalMessage } from './signaling';

const SIGNALING_URL = 'wss://inai-col3.fishrungames.com/signaling/';
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const localVideo = $<HTMLVideoElement>('localVideo');
const remoteVideo = $<HTMLVideoElement>('remoteVideo');
const statusEl = $<HTMLSpanElement>('status');
const joinBtn = $<HTMLButtonElement>('joinBtn');
const micBtn = $<HTMLButtonElement>('micBtn');
const camBtn = $<HTMLButtonElement>('camBtn');
const hangupBtn = $<HTMLButtonElement>('hangupBtn');

let localStream: MediaStream | null = null;
let pc: RTCPeerConnection | null = null;
// ICE-кандидаты, пришедшие до установки remote description.
let pendingCandidates: RTCIceCandidateInit[] = [];
let inCall = false;

function setStatus(text: string, kind: 'idle' | 'wait' | 'ok' | 'error' = 'idle'): void {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

const signaling = new Signaling(SIGNALING_URL, {
  onOpen: () => {
    setStatus('Ожидание собеседника…', 'wait');
    // Сообщаем второму участнику (если он уже в комнате), что мы пришли.
    // Тот, кто был раньше, создаст offer.
    signaling.send({ type: 'join' });
  },
  onClose: () => {
    if (inCall) {
      // Сервер разорвал соединение (например, подключился третий участник).
      teardown();
      setStatus('Соединение с сервером закрыто', 'error');
    }
  },
  onMessage: (msg) => {
    handleSignal(msg).catch((err) => {
      console.error('[rtc] ошибка обработки', msg.type, err);
      setStatus('Ошибка: ' + (err as Error).message, 'error');
    });
  },
});

function createPeerConnection(): RTCPeerConnection {
  closePeerConnection();
  const conn = new RTCPeerConnection(RTC_CONFIG);
  pc = conn;

  localStream?.getTracks().forEach((track) => conn.addTrack(track, localStream!));

  conn.onicecandidate = (e) => {
    if (e.candidate) signaling.send({ type: 'candidate', candidate: e.candidate.toJSON() });
  };

  conn.ontrack = (e) => {
    const [stream] = e.streams;
    if (stream && remoteVideo.srcObject !== stream) remoteVideo.srcObject = stream;
  };

  conn.onconnectionstatechange = () => {
    switch (conn.connectionState) {
      case 'connecting':
        setStatus('Соединение…', 'wait');
        break;
      case 'connected':
        setStatus('Собеседник на связи', 'ok');
        break;
      case 'failed':
        setStatus('Не удалось установить соединение', 'error');
        break;
    }
  };

  return conn;
}

function closePeerConnection(): void {
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    pc = null;
  }
  pendingCandidates = [];
  remoteVideo.srcObject = null;
}

async function flushCandidates(conn: RTCPeerConnection): Promise<void> {
  for (const c of pendingCandidates) await conn.addIceCandidate(c);
  pendingCandidates = [];
}

async function handleSignal(msg: SignalMessage): Promise<void> {
  if (!inCall) return;

  switch (msg.type) {
    case 'join': {
      // Пришёл второй участник — мы инициатор звонка.
      const conn = createPeerConnection();
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      signaling.send({ type: 'offer', sdp: conn.localDescription!.toJSON() });
      break;
    }
    case 'offer': {
      const conn = createPeerConnection();
      await conn.setRemoteDescription(msg.sdp);
      await flushCandidates(conn);
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      signaling.send({ type: 'answer', sdp: conn.localDescription!.toJSON() });
      break;
    }
    case 'answer': {
      if (!pc || pc.signalingState !== 'have-local-offer') return;
      await pc.setRemoteDescription(msg.sdp);
      await flushCandidates(pc);
      break;
    }
    case 'candidate': {
      if (pc?.remoteDescription) await pc.addIceCandidate(msg.candidate);
      else pendingCandidates.push(msg.candidate);
      break;
    }
    case 'bye':
    case 'peer-left': {
      closePeerConnection();
      setStatus('Собеседник вышел. Ожидание…', 'wait');
      break;
    }
  }
}

async function join(): Promise<void> {
  joinBtn.disabled = true;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    joinBtn.disabled = false;
    setStatus('Нет доступа к камере/микрофону: ' + (err as Error).message, 'error');
    return;
  }
  localVideo.srcObject = localStream;
  inCall = true;
  micBtn.disabled = camBtn.disabled = hangupBtn.disabled = false;
  setStatus('Подключение к серверу…', 'wait');
  signaling.connect();
}

function teardown(): void {
  inCall = false;
  closePeerConnection();
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  localVideo.srcObject = null;
  joinBtn.disabled = false;
  micBtn.disabled = camBtn.disabled = hangupBtn.disabled = true;
  micBtn.textContent = 'Выключить микрофон';
  camBtn.textContent = 'Выключить камеру';
}

function hangup(): void {
  signaling.send({ type: 'bye' });
  teardown();
  signaling.close();
  setStatus('Звонок завершён');
}

function toggleTrack(kind: 'audio' | 'video', btn: HTMLButtonElement, on: string, off: string): void {
  const track = localStream?.getTracks().find((t) => t.kind === kind);
  if (!track) return;
  track.enabled = !track.enabled;
  btn.textContent = track.enabled ? off : on;
  btn.classList.toggle('off', !track.enabled);
}

joinBtn.addEventListener('click', () => void join());
hangupBtn.addEventListener('click', hangup);
micBtn.addEventListener('click', () =>
  toggleTrack('audio', micBtn, 'Включить микрофон', 'Выключить микрофон'),
);
camBtn.addEventListener('click', () =>
  toggleTrack('video', camBtn, 'Включить камеру', 'Выключить камеру'),
);
window.addEventListener('beforeunload', () => signaling.send({ type: 'bye' }));
