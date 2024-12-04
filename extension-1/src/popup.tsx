import React, { useEffect, useLayoutEffect, useRef } from "react";
import Tokenizer from "sbd";
import { observer } from "mobx-react-lite";
import { escapeHTML, getAdjustedPopupPosition } from "./utils.ts";
import { POPUP_CONTAINER_ID, PopupStore } from "./shared.ts";
import "./popup.css";
import { sendFollowUpQuestion } from "./extension.tsx";

function setPopupPosition(dialogElement: HTMLDialogElement) {
  const selection = window.getSelection();

  if (selection && selection.rangeCount > 0) {
    const boundingBox = selection.getRangeAt(0).getBoundingClientRect();

    const popupX = window.scrollX + boundingBox.left;
    const popupY = window.scrollY + boundingBox.top + boundingBox.height;
    const popupWidth = dialogElement.offsetWidth;
    const popupHeight = dialogElement.offsetHeight;

    const [x, y] = getAdjustedPopupPosition(popupX, popupY, popupWidth, popupHeight);

    dialogElement.style.left = `${x}px`;
    dialogElement.style.top = `${y}px`;

    dialogElement.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "smooth",
    });
  }
}

function getImageSrc(imageFilename: string) {
  return (
    chrome?.runtime?.getURL?.(`images/${imageFilename}`) ||
    `extension/images/${imageFilename}`
  );
}

function PopupComponent({ store }: { store: PopupStore }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const messagesListRef = useRef<HTMLUListElement | null>(null);

  const [isVisible, setIsVisible] = React.useState(false);

  const { isLoading, selection, status, result, popupId } = store || {};

  const escapedSelection = escapeHTML(selection);

  const isLoadingSummary = isLoading && !result?.content;
  const isLoadingFollowUp = isLoading && !isLoadingSummary;

  useEffect(() => {
    const keyUpListener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        document.getElementById(POPUP_CONTAINER_ID)?.remove();
      }
    };

    document.addEventListener("keyup", keyUpListener);

    return () => {
      document.removeEventListener("keyup", keyUpListener);
    };
  }, []);

  useLayoutEffect(() => {
    if (!dialogRef.current) {
      return;
    }

    setPopupPosition(dialogRef.current);
    setIsVisible(true);

    dialogRef.current.showModal();
  }, []);

  useEffect(() => {
    if (messagesListRef.current) {
      messagesListRef.current.scrollTop = messagesListRef.current.scrollHeight;
    }
  }, [store.messages]);

  const logoImageSrc = getImageSrc("logo.svg");
  const personImageSrc = getImageSrc("person.svg");
  const newTabImageSrc = getImageSrc("new_tab.svg");

  return (
    <dialog
      id="biai-popup"
      ref={dialogRef}
      style={{
        visibility: isVisible ? "visible" : "hidden",
      }}
    >
      <header>
        <div className="biai-header-title">
          <img src={logoImageSrc} alt="" width="24" height="24" />

          <h1
            id="popup-header"
            title={escapedSelection}
            aria-label="AI-Generated description of selected text"
          >
            {escapedSelection}
          </h1>

          <button
            id="biai-close-button"
            className="biai-tag"
            aria-label="Close"
            autoFocus={isLoadingSummary}
            data-popup-id={popupId}
            onClick={() => {
              if (dialogRef.current) {
                dialogRef.current.close();
              }

              document.getElementById(POPUP_CONTAINER_ID)?.remove();
            }}
          >
            <img src={getImageSrc("close.svg")} alt="" width="16" height="16" />
          </button>
        </div>

        <p id="biai-status" role="status" aria-live="polite">
          {status || ""}
        </p>
      </header>

      {isLoadingSummary && (
        <>
          <div className="biai-skeleton biai-skeleton-paragraph" aria-hidden="true"></div>
          <div className="biai-skeleton biai-skeleton-paragraph" aria-hidden="true"></div>

          <div className="biai-tags" aria-hidden="true">
            <div className="biai-skeleton biai-tag biai-skeleton-tag"></div>
            <div className="biai-skeleton biai-tag biai-skeleton-tag"></div>
            <div className="biai-skeleton biai-tag biai-skeleton-tag"></div>
          </div>
        </>
      )}

      {!isLoadingSummary && (
        <>
          {Tokenizer.sentences(result?.content || "").map(
            (sentence: string, index: number) => (
              <p key={index}>{sentence}</p>
            ),
          )}

          <ul className="biai-tags">
            {result?.tags?.map((tag, index) => (
              <li className="biai-tag" key={index} title={`Search Google for "${tag}"`}>
                <img src={newTabImageSrc} alt="" width="16" height="16" />

                <a
                  href={`https://www.google.com/search?q=${tag}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {tag}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {!isLoadingSummary && (
        <div className="biai-follow-up-cont">
          <ul className="biai-messages" ref={messagesListRef}>
            {store.messages.length > 0 &&
              store.messages.map((entry, index) => {
                const sentences = Tokenizer.sentences(entry.message);

                return (
                  <li key={index} className="biai-message">
                    {entry.role === "user" && (
                      <img src={personImageSrc} alt="" width="24" height="24" />
                    )}

                    {entry.role === "assistant" && (
                      <img
                        src={logoImageSrc}
                        alt=""
                        width="24"
                        height="24"
                        data-biai-msg-role="assistant"
                      />
                    )}

                    <div className="biai-message-text">
                      {sentences.map((sentence, index) => (
                        <p key={index}>{sentence}</p>
                      ))}
                    </div>
                  </li>
                );
              })}

            {isLoadingFollowUp && (
              <li className="biai-message" aria-hidden="true">
                <img src={logoImageSrc} alt="" width="24" height="24" />

                <div className="biai-message-text">
                  <div className="biai-skeleton biai-skeleton-paragraph"></div>
                  <div className="biai-skeleton biai-skeleton-paragraph"></div>
                </div>
              </li>
            )}
          </ul>

          <form
            id="biai-question-form"
            onSubmit={(e) => {
              e.preventDefault();

              const inputElement = e.currentTarget["biai-question-input"];
              const value = inputElement.value.trim();
              sendFollowUpQuestion(store, escapeHTML(value));

              inputElement.value = "";
            }}
            className={store.messages.length > 0 ? "" : "biai-question-form-empty"}
          >
            <input
              type="text"
              id="biai-question-input"
              placeholder="Ask a follow-up question"
              aria-label="Ask a follow-up question"
              disabled={isLoadingFollowUp}
              autoComplete="off"
              autoFocus={!isLoadingSummary}
            />

            <button
              type="submit"
              className="biai-tag"
              aria-label="Submit question"
              disabled={isLoadingFollowUp}
            >
              <img src={getImageSrc("send.svg")} alt="" width="24" height="24" />
            </button>
          </form>
        </div>
      )}

      <footer>
        <p className="biai-disclaimer">Content generated using AI on your device.</p>
      </footer>
    </dialog>
  );
}

export const Popup = observer(PopupComponent);
