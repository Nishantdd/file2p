const tabButtons = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
const contentSend = document.getElementById("content-send")!;
const contentReceive = document.getElementById("content-receive")!;

tabButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => (b.dataset.active = "false"));
    const tab = btn.dataset.tab;
    btn.dataset.active = "true";
    contentSend.dataset.active = "false";
    contentReceive.dataset.active = "false";
    tab === "send"
      ? (contentSend.dataset.active = "true")
      : (contentReceive.dataset.active = "true");
  }),
);
