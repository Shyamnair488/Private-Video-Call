(async () => {
  const $ = (id) => document.getElementById(id);
  const status = $('status');
  const room = location.pathname.split('/').pop();
  let stream, pc, facing = 'user';
  let pendingIce = [];

  const constraints = () => ({
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  if (!navigator.mediaDevices) { status.textContent = 'Camera needs an HTTPS link (use the tunnel URL).'; return; }
  try { stream = await navigator.mediaDevices.getUserMedia(constraints()); }
  catch { status.textContent = 'Camera/mic blocked. Allow access and reload.'; return; }
  $('local').srcObject = stream;
  status.textContent = 'Waiting for the other person… tap "Copy link" and share it.';

  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  let ended = false;

  function newPC() {
    if (pc) pc.close();
    pendingIce = [];
    pc = new RTCPeerConnection({ iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' } ] });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => e.candidate && send({ type: 'ice', c: e.candidate });
    pc.ontrack = (e) => { $('remote').srcObject = e.streams[0]; status.textContent = ''; };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') status.textContent = '';
      if (pc.connectionState === 'failed') status.textContent = 'Connection failed (strict network). Try Wi-Fi on both sides.';
    };
  }

  ws.onopen = () => send({ type: 'join', room });
  ws.onmessage = async (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    try {
      if (m.type === 'full') { ended = true; status.textContent = 'This call already has 2 people.'; stream.getTracks().forEach((t) => t.stop()); }
      else if (m.type === 'peer') { newPC(); await pc.setLocalDescription(await pc.createOffer()); send({ type: 'offer', d: pc.localDescription }); }
      else if (m.type === 'offer') {
        newPC();
        await pc.setRemoteDescription(m.d);
        await pc.setLocalDescription(await pc.createAnswer());
        send({ type: 'answer', d: pc.localDescription });
        for (const candidate of pendingIce) await pc.addIceCandidate(candidate);
        pendingIce = [];
      } else if (m.type === 'answer') {
        await pc.setRemoteDescription(m.d);
        for (const candidate of pendingIce) await pc.addIceCandidate(candidate);
        pendingIce = [];
      } else if (m.type === 'ice' && pc) {
        if (pc.remoteDescription) await pc.addIceCandidate(m.c);
        else pendingIce.push(m.c);
      }
      else if (m.type === 'left') { if (pc) pc.close(); $('remote').srcObject = null; status.textContent = 'The other person left. Waiting…'; }
    } catch (e) { console.error(e); }
  };
  ws.onclose = () => { if (!ended) status.textContent = 'Disconnected. Reload to rejoin.'; };

  const toggle = (btn, kind, onT, offT) => (btn.onclick = () => {
    const tracks = stream.getTracks().filter((t) => t.kind === kind);
    const on = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = on));
    btn.textContent = on ? onT : offT; btn.classList.toggle('off', !on);
  });
  toggle($('mic'), 'audio', 'Mute', 'Unmute');
  toggle($('cam'), 'video', 'Camera off', 'Camera on');

  $('flip').onclick = async () => {
    const button = $('flip');
    button.disabled = true;
    status.textContent = 'Switching camera…';
    const oldFacing = facing;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === 'videoinput');
      if (cameras.length < 2) throw new Error('NoAlternateCamera');

      const old = stream.getVideoTracks()[0];
      const oldDeviceId = old && old.getSettings().deviceId;
      const oldIndex = cameras.findIndex((camera) => camera.deviceId === oldDeviceId);
      const nextCamera = cameras[(oldIndex + 1) % cameras.length];
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: nextCamera.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      const track = s.getVideoTracks()[0];
      if (!track) throw new Error('No video track returned');

      stream.removeTrack(old);
      stream.addTrack(track);
      const sender = pc && pc.getSenders().find((x) => x.track && x.track.kind === 'video');
      if (sender) await sender.replaceTrack(track);
      old.stop();
      const nextLabel = (nextCamera.label || '').toLowerCase();
      facing = nextLabel.includes('back') || nextLabel.includes('rear') || nextLabel.includes('environment')
        ? 'environment'
        : 'user';
      $('local').srcObject = stream;
      $('local').style.transform = facing === 'user' ? 'scaleX(-1)' : 'none';
      status.textContent = '';
    } catch (error) {
      facing = oldFacing;
      if (error.message === 'NoAlternateCamera' ||
          error.name === 'OverconstrainedError' ||
          error.name === 'ConstraintNotSatisfiedError') {
        status.textContent = 'No other camera is available on this device.';
      } else {
        status.textContent = 'Could not switch camera. Check camera permissions.';
      }
    } finally {
      button.disabled = false;
    }
  };

  $('link').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); $('link').textContent = 'Copied!'; }
    catch { prompt('Copy link:', location.href); }
    setTimeout(() => ($('link').textContent = 'Copy link'), 1500);
  };
  $('hang').onclick = () => { ended = true; ws.close(); stream.getTracks().forEach((t) => t.stop()); location.href = '/'; };
})();
