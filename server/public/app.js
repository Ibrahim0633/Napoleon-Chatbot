const conversation = document.querySelector("#conversation");
const quickReplies = document.querySelector("#quick-replies");
const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const resetButton = document.querySelector("#reset-chat");
const startNodeId = "greeting";
let currentNodeId = null;

function addMessage(role, text) {
  const message = document.createElement("article");
  message.className = `message ${role}`;

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "assistant" ? "Napoleon" : "You";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  message.append(label, bubble);
  conversation.append(message);
  conversation.scrollTop = conversation.scrollHeight;
}

function setBusy(busy) {
  sendButton.disabled = busy;
  messageInput.disabled = busy;
  quickReplies.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
}

async function requestDialogue(payload) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "The message could not be sent.");
  }
  return data;
}

function showChoices(choices = []) {
  quickReplies.replaceChildren();

  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "quick-reply";
    button.type = "button";
    button.textContent = choice.text;
    button.addEventListener("click", () => {
      addMessage("user", choice.text);
      quickReplies.replaceChildren();
      continueAtNode(choice.nextNodeId);
    });
    quickReplies.append(button);
  });
}

async function continueAtNode(nodeId) {
  setBusy(true);
  try {
    const data = await requestDialogue({ nodeId });
    currentNodeId = data.nodeId;
    addMessage("assistant", data.message);
    showChoices(data.choices);
  } catch (error) {
    addMessage("assistant", error.message);
  } finally {
    setBusy(false);
    messageInput.focus();
  }
}

async function sendMessage(message) {
  addMessage("user", message);
  quickReplies.replaceChildren();
  setBusy(true);

  try {
    const data = await requestDialogue({ message, currentNodeId });

    if (data.restart) {
      conversation.replaceChildren();
      quickReplies.replaceChildren();
    }

    currentNodeId = data.contextNodeId || data.nodeId || currentNodeId;
    addMessage("assistant", data.matched ? data.message : data.reply);

    if (data.matched) {
      showChoices(data.choices);
    } else {
      showChoices([
        { text: "Start the Battle of Waterloo", nextNodeId: "waterloo_start" }
      ]);
    }
  } catch (error) {
    addMessage("assistant", `I could not connect to the server. ${error.message}`);
  } finally {
    setBusy(false);
    messageInput.focus();
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  messageInput.value = "";
  sendMessage(message);
});

resetButton.addEventListener("click", () => {
  conversation.replaceChildren();
  quickReplies.replaceChildren();
  currentNodeId = null;
  continueAtNode(startNodeId);
});

continueAtNode(startNodeId);
