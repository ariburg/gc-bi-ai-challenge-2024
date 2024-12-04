self?.importScripts?.("ai_sessions.js");

function withTimeout(promise, timeoutMs) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs} ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function runStep(logger, step, retries, input) {
  const { id = "unknown", defaultResponse, fn, timeout } = step || {};

  const stepPromise = fn(input);
  const promiseWithTimeout = timeout
    ? withTimeout(stepPromise, timeout)
    : stepPromise;

  return promiseWithTimeout.catch((error) => {
    logger.log(`Pipeline step "${id}" failed: %c${error}`, "color: red");

    if (retries > 0) {
      logger.log(
        `%cRetrying step "${id}" [${step.retries - retries + 1}/${step.retries}]...`,
        "color: orange",
      );

      return runStep(logger, step, retries - 1, input);
    } else if (defaultResponse) {
      logger.log(`Using default response for step "${id}"...`);

      return defaultResponse;
    }

    throw new Error(`Pipeline "${id}" failed after ${step.retries} retries.`);
  });
}

function createPipeline(logger, steps, retries = 1, timeoutMs) {
  return {
    run: (tab, input) => {
      logger.status(tab, "Processing...");
      logger.log(`Running pipeline with input: ${JSON.stringify(input)}`);

      const runPipeline = (input, retriesLeft) => {
        const runNextStep = (stepIndex, input) => {
          const step = steps[stepIndex];

          logger.log(
            `Running step "${step.id}". Input: ${JSON.stringify(input)}`,
          );

          return runStep(logger, step, step.retries, input)
            .then((output) => {
              logger.log(
                `%cStep "${step.id}" succeeded! Output: ${JSON.stringify(output)}`,
                "color: green",
              );

              if (step.transformOutput) {
                logger.log(`Transforming output...`);

                return step.transformOutput(input, output);
              }

              return output;
            })
            .then((output) => {
              if (++stepIndex < steps.length) {
                return runNextStep(stepIndex, output);
              }

              return output;
            });
        };

        return runNextStep(0, input)
          .catch((error) => {
            logger.log(`Pipeline failed: %c${error}`, "color: red");

            if (retriesLeft > 0) {
              logger.status(tab, "Analysis failed. Retrying...");
              logger.log(
                `%cRetrying pipeline [${retries - retriesLeft + 1}/${retries}]...`,
                "color: orange",
              );

              return runPipeline(input, retriesLeft - 1);
            } else {
              logger.status(tab, "Analysis failed.");

              // sessions might be broken. Next time new ones will be created.
              destroySessions();

              throw new Error(`Pipeline failed after ${retries} retries.`);
            }
          })
          .then((result) => {
            logger.status(tab, "Analysis completed.");

            return result;
          });
      };

      const pipelinePromise = runPipeline(input, retries);

      return timeoutMs
        ? withTimeout(pipelinePromise, timeoutMs)
        : pipelinePromise;
    },
  };
}

function pipelineStep(logger, step) {
  const getLanguageModel = getSession.bind(
    null,
    logger,
    step.id,
    step.systemPrompt,
    step.initialPrompts,
  );

  return {
    ...step,
    retries: step.retries || 1,
    fn: (input) => step.fn(logger, getLanguageModel, input),
  };
}

function newSelectionSummaryPipeline(logger = console) {
  return createPipeline(
    logger,
    [
      pipelineStep(console, {
        id: "firstStep",
        retries: 3,
        fn: (logger, getLanguageModel, selection) => {
          if (selection.trim().split(" ").length === 1) {
            return Promise.resolve(false);
          }

          return getLanguageModel()
            .then((languageModel) => {
              const prompt = `Is "${selection}" a sentence? Respond with "yes" or "no".`;
              logger.log("Prompt: " + prompt);

              return languageModel.prompt(prompt);
            })
            .then((response) => {
              const yesOrNo = response.trim().toLowerCase();

              if (!yesOrNo.includes("yes")) {
                if (!yesOrNo.includes("no")) {
                  throw new Error("Invalid response");
                }

                return false;
              }

              return true;
            });
        },
        defaultResponse: true,
        transformOutput: (input, output) => {
          return {
            selection: input,
            isSentence: output,
          };
        },
      }),
      pipelineStep(console, {
        id: "secondStep",
        retries: 3,
        fn: (logger, getLanguageModel, input) => {
          const { selection, isSentence } = input;

          const prompt = isSentence
            ? `Generate a brief explanation of what this sentence "${selection}" could mean. Return it inside curly brackets. Don't mention the word "sentence".`
            : `Generate a brief definition of the word "${selection}". Return the definition inside curly brackets.`;

          return getLanguageModel()
            .then((languageModel) => languageModel.prompt(prompt))
            .then((response) => {
              logger.log(response);
              const regex = /\{(.*)}/;

              if (!regex.test(response)) {
                throw new Error("Invalid response");
              }

              return response.match(regex)[1];
            });
        },
        transformOutput: (input, output) => {
          return {
            ...input,
            content: output,
          };
        },
      }),
      pipelineStep(console, {
        id: "relatedTermsStep",
        retries: 5,
        fn: (logger, getLanguageModel, input) => {
          const { selection, isSentence, content } = input;

          const prompt = isSentence
            ? `Generate a list of terms related to the context of this sentence: "${content}". Return them inside curly brackets. Comma separated.`
            : `Generate a list of terms related to the word "${selection}". Return them inside curly brackets. Comma separated.`;

          return getLanguageModel()
            .then((languageModel) => languageModel.prompt(prompt))
            .then((response) => {
              const regex = /\{(.*)}/;

              if (!regex.test(response)) {
                throw new Error("Invalid response");
              }

              const commaSeparatedTags = response.match(regex)[1];

              if (!commaSeparatedTags.includes(",")) {
                throw new Error("Invalid response");
              }

              return commaSeparatedTags;
            });
        },
        defaultResponse: "",
        transformOutput: (input, relatedTerms) => {
          const tags = relatedTerms.split(",");

          if (tags.length > 6) {
            tags.length = 6;
          }

          return {
            ...input,
            tags: Array.from(new Set(tags.map((tag) => tag.trim()))),
          };
        },
      }),
    ],
    3,
    50000,
  );
}

function newFollowUpQuestionPipeline(logger = console) {
  return createPipeline(
    logger,
    [
      pipelineStep(console, {
        id: "checkIfItsAQuestion",
        retries: 3,
        fn: (logger, getLanguageModel, messages) => {
          if (messages.length === 0) {
            throw new Error("No messages");
          }

          return getLanguageModel()
            .then((languageModel) => {
              const prompt = `If "${messages[messages.length - 1].message}" is a question respond with "yes" otherwise respond with "no".`;
              logger.log("Prompt: " + prompt);

              return languageModel.prompt(prompt);
            })
            .then((response) => {
              const yesOrNo = response.trim().toLowerCase();

              if (!yesOrNo.includes("yes")) {
                if (!yesOrNo.includes("no")) {
                  throw new Error("Invalid response");
                }

                return false;
              }

              return true;
            });
        },
        defaultResponse: true,
        transformOutput: (input, output) => {
          return {
            messages: input,
            isQuestion: output,
          };
        },
      }),
      pipelineStep(console, {
        id: "followUpAnswer",
        retries: 4,
        fn: (logger, getLanguageModel, { messages, isQuestion }) => {
          if (!isQuestion) {
            return "👍";
          }

          return getLanguageModel()
            .then((languageModel) => {
              const messagesText = messages.reduce((acc, message) => {
                return acc + message.role + ": {" + message.message + "}\n";
              }, "");

              const prompt = `${messagesText}\n Return the assistant brief response inside curly brackets.`;
              logger.log("Prompt: " + prompt);

              return languageModel.prompt(prompt);
            })
            .then((response) => {
              logger.log(response);

              const regex = /\{(.*)}/;

              if (!regex.test(response)) {
                throw new Error("Invalid response");
              }

              return response.match(regex)[1];
            });
        },
        defaultResponse: true,
        transformOutput: (_input, output) => {
          return output;
        },
      }),
    ],
    3,
    50000,
  );
}
