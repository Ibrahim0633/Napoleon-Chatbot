const express = require("express");
const cors = require("cors");
const dialogues = require("./dialogues.json");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "The historical chat server is running" });
});

app.post("/api/chat", (req, res) => {
  const requestedNodeId = req.body?.nodeId;

  if (typeof requestedNodeId === "string") {
    const node = dialogues.nodes[requestedNodeId];

    if (!node) {
      return res.status(404).json({ error: "Dialogue node not found." });
    }

    return res.json({
      matched: true,
      nodeId: requestedNodeId,
      message: node.message,
      choices: node.choices
    });
  }

  const message = req.body?.message;

  if (typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ error: "Please send a message." });
  }

  const normalizedMessage = message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const topic = dialogues.topics.find(({ keywords }) =>
    keywords.some((keyword) => normalizedMessage.includes(keyword))
  );

  if (!topic) {
    return res.json({
      matched: false,
      reply: "I don't know much about that, I'm afraid. The weather is lovely today, though. Would you like to talk about the Battle of Waterloo instead?",
      suggestedTopic: "waterloo"
    });
  }

  const node = dialogues.nodes[topic.nodeId];

  return res.json({
    matched: true,
    topicId: topic.id,
    topicTitle: topic.title,
    nodeId: topic.nodeId,
    message: node.message,
    choices: node.choices
  });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
