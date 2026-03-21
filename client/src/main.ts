const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
const contentSend = document.getElementById('content-send')!;
const contentReceive = document.getElementById('content-receive')!;

type SendStates = 'upload' | 'ready';
type ReceiveStates = 'input' | 'conn' | 'cerr' | 'ready' | 'dl' | 'derr';

tabButtons.forEach(btn =>
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => (b.dataset.active = 'false'));
    btn.dataset.active = 'true';
    contentSend.dataset.active = 'false';
    contentReceive.dataset.active = 'false';
    btn.dataset.tab === 'send' ? (contentSend.dataset.active = 'true') : (contentReceive.dataset.active = 'true');
  })
);
