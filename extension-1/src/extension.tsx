import React, { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { Popup } from "./popup.tsx";
import {
  Message,
  POPUP_CONTAINER_ID,
  PopupRenderingProps,
  PopupStore,
} from "./shared.ts";

interface CreatePopupOptions {
  renderingProps: PopupRenderingProps;
}

export function createPopup(options: CreatePopupOptions) {
  const existingPopup = document.getElementById(POPUP_CONTAINER_ID);
  existingPopup?.remove();

  const popup = document.createElement("div");
  popup.id = POPUP_CONTAINER_ID;

  document.body.appendChild(popup);

  const root = ReactDOM.createRoot(popup);
  const popupStore = new PopupStore();

  root.render(
    <StrictMode>
      <Popup store={popupStore} />
    </StrictMode>,
  );

  popupStore.update(options.renderingProps);

  return (renderingProps: PopupRenderingProps) => {
    popupStore.update(renderingProps);
  };
}

export function sendFollowUpQuestion(popupStore: PopupStore, question: string) {
  const newMessages: Message[] = [
    ...popupStore.messages,
    {
      role: "user",
      message: question,
    },
  ];

  if (chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      type: "BIAI_FOLLOW_UP_QUESTION",
      popupStore: {
        ...popupStore,
        messages: newMessages,
      },
    });
  } else {
    console.warn("Extension is not available in the current tab.");
  }

  popupStore.update({
    messages: newMessages,
    isLoading: true,
  });
}

if (chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "BIAI_PING") {
      sendResponse({ type: "BIAI_PONG" });
    }
  });

  const selectionsById: Record<string, string> = {};

  let updatePopup: undefined | ((renderingProps: PopupRenderingProps) => void);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "BIAI_SHOW_POPUP") {
      selectionsById[message.popupId] = message.selection;

      updatePopup = createPopup({
        renderingProps: {
          popupId: message.popupId,
          isLoading: message.isLoading,
          selection: message.selection,
          status: message.status,
          result: message.result,
        },
      });
    } else if (message.type === "BIAI_UPDATE_POPUP") {
      updatePopup?.({
        ...message,
        selection: selectionsById[message.popupId],
      });
    }

    sendResponse();
  });
}
