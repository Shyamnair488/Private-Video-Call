function randomId() {
  const a = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
document.getElementById('start').onclick = () => { location.href = '/room/' + randomId(); };
