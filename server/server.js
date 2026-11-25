const express = require("express");
const cors = require("cors");
const path = require("path");
const dialogues = require("./dialogues.json");

const app = express();
const PORT = 5000;
const affirmativeReplies = new Set([
  "yes", "yeah", "yep", "yup", "sure", "sure thing", "of course", "okay", "ok",
  "certainly", "absolutely", "sounds good", "sounds interesting", "yes please", "yes of course"
]);
const negativeReplies = new Set([
  "no", "nope", "nah", "not really", "no thanks", "not now", "i don t think so"
]);
const moreReplies = new Set([
  "more", "tell me more", "go on", "continue", "explain more", "say more", "more please",
  "more details", "more information", "more info", "tell me more please", "go into detail",
  "give me details", "could you explain", "could you tell me more", "tell me a little more",
  "continue please", "what else", "and then what", "what next"
]);
const shortQuestionReplies = new Set(["what", "why", "where", "who", "when", "how", "which"]);
const preferencePrefixes = ["i like", "i love", "i enjoy", "i prefer", "my favorite is", "my favourite is"];

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAskingWhatNapoleonWants(message) {
  const words = message.split(" ");
  const hasAdjacentPair = (first, second) =>
    words.some((word, index) => word === first && words[index + 1] === second);
  const hasSubjectPair = hasAdjacentPair("do", "you") || hasAdjacentPair("would", "you");
  const hasDesireWord = ["want", "need", "like", "prefer", "enjoy"].some((word) => words.includes(word));

  return hasSubjectPair && hasDesireWord;
}

function getEvaluationPolarity(message) {
  const words = message.split(" ");
  const questionOpeners = new Set(["is", "are", "was", "were", "does", "did", "do", "would", "can", "what", "how"]);
  if (!questionOpeners.has(words[0])) return null;

  const positiveWords = ["good", "great", "nice", "fine", "safe", "helpful", "useful", "successful", "better"];
  const negativeWords = ["bad", "terrible", "awful", "wrong", "dangerous", "risky", "poor", "difficult", "worse"];

  if (positiveWords.some((word) => words.includes(word))) return "good";
  if (negativeWords.some((word) => words.includes(word))) return "bad";
  return null;
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

  const normalizedMessage = normalizeText(message);
  const paddedMessage = ` ${normalizedMessage} `;
  const isRestartRequest = dialogues.restartKeywords.some((phrase) =>
    paddedMessage.includes(` ${normalizeText(phrase)} `)
  ) || ["restart", "reset"].includes(normalizedMessage);

  if (isRestartRequest) {
    const nodeId = dialogues.startNodeId;
    const node = dialogues.nodes[nodeId];

    return res.json({
      matched: true,
      restart: true,
      topicId: "restart",
      topicTitle: "New Conversation",
      nodeId,
      message: node.message,
      choices: node.choices
    });
  }

  const currentNodeId = req.body?.currentNodeId;
  const followUps = dialogues.followUps?.[currentNodeId];
  const previousNode = dialogues.nodes[currentNodeId];

  if (followUps) {
    const followUp = Object.entries(followUps)
      .map(([phrase, nodeId]) => ({ phrase: normalizeText(phrase), nodeId }))
      .filter(({ phrase }) => normalizedMessage === phrase)
      .sort((first, second) => second.phrase.length - first.phrase.length)[0];

    if (followUp) {
      const node = dialogues.nodes[followUp.nodeId];

      return res.json({
        matched: true,
        topicId: "follow-up",
        topicTitle: "Conversation follow-up",
        nodeId: followUp.nodeId,
        message: node.message,
        choices: node.choices
      });
    }
  }

  if (moreReplies.has(normalizedMessage)) {
    const nextNodeId = followUps?.more || followUps?.["tell me more"] || "topics_help";
    const node = dialogues.nodes[nextNodeId];

    return res.json({
      matched: true,
      topicId: "follow-up-more",
      topicTitle: "More about this topic",
      nodeId: nextNodeId,
      message: node.message,
      choices: node.choices
    });
  }

  if (previousNode?.choices?.length && affirmativeReplies.has(normalizedMessage)) {
    const nextNodeId = previousNode.choices[0].nextNodeId;
    const node = dialogues.nodes[nextNodeId];

    return res.json({
      matched: true,
      topicId: "follow-up-yes",
      topicTitle: "Yes",
      nodeId: nextNodeId,
      message: node.message,
      choices: node.choices
    });
  }

  if (previousNode?.choices?.length && negativeReplies.has(normalizedMessage)) {
    const nextNodeId = previousNode.choices[previousNode.choices.length - 1].nextNodeId;
    const node = dialogues.nodes[nextNodeId];

    return res.json({
      matched: true,
      topicId: "follow-up-no",
      topicTitle: "No",
      nodeId: nextNodeId,
      message: node.message,
      choices: node.choices
    });
  }

  if (preferencePrefixes.some((prefix) => normalizedMessage.startsWith(`${prefix} `))) {
    const nodeId = currentNodeId === "user_preferences" ? "user_preference_followup" : "user_preferences";
    const node = dialogues.nodes[nodeId];

    return res.json({
      matched: true,
      topicId: "user-preferences",
      topicTitle: "The User's Likes and Favorites",
      nodeId,
      message: node.message,
      choices: node.choices
    });
  }

  const typedChoice = previousNode?.choices
    ?.map((choice) => ({
      nodeId: choice.nextNodeId,
      phrase: normalizeText(choice.text)
    }))
    .filter(({ phrase }) => paddedMessage.includes(` ${phrase} `))
    .sort((first, second) => second.phrase.length - first.phrase.length)[0];

  if (typedChoice) {
    const node = dialogues.nodes[typedChoice.nodeId];

    return res.json({
      matched: true,
      topicId: "follow-up-choice",
      topicTitle: "Conversation choice",
      nodeId: typedChoice.nodeId,
      message: node.message,
      choices: node.choices
    });
  }

  if (shortQuestionReplies.has(normalizedMessage)) {
    const node = dialogues.nodes.topics_help;

    return res.json({
      matched: true,
      topicId: "clarification",
      topicTitle: "Available Topics",
      nodeId: "topics_help",
      message: node.message,
      choices: node.choices
    });
  }

  const matches = dialogues.topics.flatMap((topic) =>
    topic.keywords
      .map((keyword) => normalizeText(keyword))
      .filter((keyword) => paddedMessage.includes(` ${keyword} `))
      .filter((keyword) =>
        !["affirmative", "negative"].includes(topic.id) || keyword === normalizedMessage
      )
      .map((keyword) => ({ topic, keyword }))
  );
  matches.sort((first, second) => second.keyword.length - first.keyword.length);
  const topic = matches[0]?.topic;
  const evaluationPolarity = getEvaluationPolarity(normalizedMessage);

  if (evaluationPolarity) {
    const context =
      dialogues.evaluationContexts?.[topic?.nodeId] ||
      dialogues.evaluationContexts?.[currentNodeId] ||
      "general";
    const nodeId = dialogues.evaluationResponses[context]?.[evaluationPolarity]
      || dialogues.evaluationResponses.general[evaluationPolarity];
    const node = dialogues.nodes[nodeId];

    return res.json({
      matched: true,
      topicId: "good-bad-evaluation",
      topicTitle: "Question about Quality or Condition",
      nodeId,
      message: node.message,
      choices: node.choices
    });
  }

  if (!topic && isAskingWhatNapoleonWants(normalizedMessage)) {
    const nodeId = "napoleon_wants";
    const node = dialogues.nodes[nodeId];

    return res.json({
      matched: true,
      topicId: "inferred-preference-question",
      topicTitle: "What Napoleon Wants",
      nodeId,
      message: node.message,
      choices: node.choices
    });
  }

  if (!topic) {
    return res.json({
      matched: false,
      reply: "I don't know much about that, I'm afraid. The weather is lovely today, though. Would you like to talk about the Battle of Waterloo instead?",
      suggestedTopic: "waterloo",
      contextNodeId: "fallback_waterloo_offer"
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
