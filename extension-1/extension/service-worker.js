importScripts("app.js");

const MENU_ITEM_ID = "biai_explain";
const currentPopupsByTab = {};

const pipeline = newSelectionSummaryPipeline({
  ...console,
  status: (tab, status) => {
    console.log(`[${tab.id}] Status: ${status}`);

    chrome.tabs.sendMessage(tab.id, {
      type: "BIAI_UPDATE_POPUP",
      popupId: currentPopupsByTab[tab.id],
      isLoading: true,
      status,
    });
  },
});

const followUpPipeline = newFollowUpQuestionPipeline({
  ...console,
  status: (tab, status) => {
    console.log(`[${tab.id}] Status: ${status}`);

    chrome.tabs.sendMessage(tab.id, {
      type: "BIAI_UPDATE_POPUP",
      popupId: currentPopupsByTab[tab.id],
      isLoading: true,
      status,
    });
  },
});

function probeTab(tabId) {
  return new Promise((resolve) => {
    let timeout = setTimeout(() => resolve(false), 1000);

    try {
      chrome.tabs.sendMessage(tabId, { type: "BIAI_PING" }, (response) => {
        clearTimeout(timeout);

        resolve(response && response.type === "BIAI_PONG");
      });
    } catch (ignored) {
      // popup script wasn't injected in the page (e.g., scripts are disabled in the Chrome extensions store)
    }
  });
}

async function setupMenuItemActionHandler() {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ITEM_ID || !info.selectionText) {
      return;
    }

    const selection = info.selectionText.trim();

    if (!selection || selection.length === 0) {
      return;
    }

    probeTab(tab.id).then((isExtensionAvailableInTab) => {
      if (!isExtensionAvailableInTab) {
        console.warn("Extension is not available in the current tab.");

        return;
      }

      const popupId = `${tab.id}-${Date.now()}`;

      chrome.tabs.sendMessage(
        tab.id,
        {
          type: "BIAI_SHOW_POPUP",
          popupId,
          isLoading: true,
          selection: selection,
          status: "Processing...",
          result: {
            tags: [],
          },
          messages: [],
        },
        () => {
          currentPopupsByTab[tab.id] = popupId;

          const startTime = performance.now();

          pipeline
            .run(tab, selection)
            .then((result) => {
              if (currentPopupsByTab[tab.id] !== popupId) {
                console.log(`Response for old popup: ${popupId}`);

                return;
              }

              const totalTimeSeconds = ((performance.now() - startTime) / 1000).toFixed(
                2,
              );

              chrome.tabs.sendMessage(tab.id, {
                type: "BIAI_UPDATE_POPUP",
                popupId,
                isLoading: false,
                status: `Completed in ${totalTimeSeconds} seconds.`,
                result: {
                  content: result.content,
                  tags: result.tags,
                },
                messages: [],
              });
            })
            .catch((error) => {
              if (currentPopupsByTab[tab.id] !== popupId) {
                console.log(`Response for old popup: ${popupId}`);

                return;
              }

              console.log(error);

              chrome.tabs.sendMessage(tab.id, {
                type: "BIAI_UPDATE_POPUP",
                popupId,
                isLoading: false,
                status: "Processing failed. Close this popup and try again.",
              });
            });
        },
      );
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "BIAI_FOLLOW_UP_QUESTION" && sender.tab) {
      const tab = sender.tab;

      probeTab(tab.id).then((isExtensionAvailableInTab) => {
        if (!isExtensionAvailableInTab) {
          console.warn("Extension is not available in the current tab.");

          return;
        }

        const store = message.popupStore;
        const popupId = store.popupId;

        const startTime = performance.now();

        followUpPipeline
          .run(tab, [
            {
              role: "user",
              message: `Explain this please: ${store.selection}`,
            },
            {
              role: "assistant",
              message: store.result.content,
            },
            ...store.messages,
          ])
          .then((answer) => {
            if (currentPopupsByTab[tab.id] !== popupId) {
              console.log(`Response for old popup: ${popupId}`);

              return;
            }

            const totalTimeSeconds = ((performance.now() - startTime) / 1000).toFixed(2);

            chrome.tabs.sendMessage(tab.id, {
              type: "BIAI_UPDATE_POPUP",
              ...store,
              isLoading: false,
              status: `Completed in ${totalTimeSeconds} seconds.`,
              messages: [
                ...store.messages,
                {
                  role: "assistant",
                  message: answer,
                },
              ],
            });
          })
          .catch((error) => {
            if (currentPopupsByTab[tab.id] !== popupId) {
              console.log(`Response for old popup: ${popupId}`);

              return;
            }

            console.log(error);

            chrome.tabs.sendMessage(tab.id, {
              type: "BIAI_UPDATE_POPUP",
              ...store,
              popupId,
              isLoading: false,
              status: "Processing failed. Please try again.",
              messages: store.messages.slice(0, -1),
            });
          });
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ITEM_ID,
    title: "Explain selection with AI",
    contexts: ["selection"],
  });

  setupMenuItemActionHandler();
});

chrome.runtime.onStartup.addListener(setupMenuItemActionHandler);
