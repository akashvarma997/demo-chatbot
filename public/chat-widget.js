(function () {
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/chat-style.css";
  document.head.appendChild(style);

  const button = document.createElement("div");
  button.id = "chat-bubble";
  button.innerText = "💬";
  document.body.appendChild(button);

  const frame = document.createElement("iframe");
  frame.id = "chat-iframe";
  frame.src = "/chat-page.html";
  frame.style.display = "none";
  document.body.appendChild(frame);

  button.addEventListener("click", () => {
    frame.style.display = frame.style.display === "none" ? "block" : "none";
  });
})();
