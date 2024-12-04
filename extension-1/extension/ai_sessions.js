const sessions = {};

function getSession(logger, sessionId, systemPrompt, initialPrompts) {
  if (sessions[sessionId]) {
    logger.log(`%cSession "${sessionId}" already exists`, "color: #666");

    return sessions[sessionId]
      .clone()
      .then((clonedSession) => clonedSession)
      .catch((error) => {
        logger.log(
          `%cError cloning session "${sessionId}": ${error}`,
          "color: red",
        );

        delete sessions[sessionId];

        return getSession(logger, sessionId, systemPrompt, initialPrompts);
      });
  }

  logger.log(`%cCreating new session: ${sessionId}`, "color: #666");

  return ai.languageModel
    .capabilities()
    .then(({ available }) => {
      if (available === "no") {
        throw new Error("No language model available");
      } else if (available !== "readily") {
        logger.warn("Language model might not yet be available");
      }
    })
    .then(() =>
      ai.languageModel.create(
        systemPrompt ? { systemPrompt: systemPrompt } : undefined,
        initialPrompts ? { initialPrompts: initialPrompts } : undefined,
      ),
    )
    .then((session) => {
      logger.log(`%Session created: ${sessionId}`, "color: #666");

      sessions[sessionId] = session;

      return session;
    });
}

function destroySessions() {
  try {
    Object.values(sessions).forEach((session) => session.destroy());
  } catch (ignored) {}

  sessions.length = 0;
}
