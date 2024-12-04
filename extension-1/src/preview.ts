import { createPopup } from "./extension.tsx";
import { InferenceResult } from "./shared.ts";

const isLoading = false;

createPopup({
  renderingProps: {
    popupId: "text-popup",
    selection: "Lorem ipsum dolor sit amet consectetur adipisic",
    status: "Processing...",
    isLoading: isLoading,
    result: isLoading
      ? undefined
      : {
          content: "Lorem ipsum dolor sit amet consectetur adipisicing elit.",
          tags: ["elit", "Quos", "quae"],
        },
    messages: [
      {
        role: "user",
        message: "yeah but what does it mean exactly?",
      },
      {
        role: "assistant",
        message: "It's latin nonsense used to fill out text with random words.",
      },
      {
        role: "user",
        message: "I still don't get it",
      },
      {
        role: "user",
        message: "yeah but what does it mean exactly?",
      },
      {
        role: "assistant",
        message: "It's latin nonsense used to fill out text with random words.",
      },
      {
        role: "user",
        message: "I still don't get it",
      },
    ],
  },
});

function run(text: string) {
  const startTime = performance.now();

  const updatePopupStatus = createPopup({
    renderingProps: {
      popupId: `test-popup`,
      isLoading: true,
      selection: text,
      status: "Processing...",
      result: {
        tags: [],
      },
    },
  });

  return newSelectionSummaryPipeline({
    ...console,
    status: (status: string) => {
      console.log(`Status: ${status}`);

      updatePopupStatus({
        popupId: `test-popup`,
        isLoading: true,
        selection: text,
        status: status || "Processing...",
      });
    },
  } as Console)
    .run(null, text)
    .then((result: InferenceResult) => {
      const totalTimeSeconds = ((performance.now() - startTime) / 1000).toFixed(2);

      updatePopupStatus({
        popupId: `test-popup`,
        isLoading: false,
        selection: text,
        status: `Completed in ${totalTimeSeconds} seconds`,
        result: result,
      });
    })
    .catch((error: unknown) => {
      console.log(error);

      updatePopupStatus({
        popupId: `test-popup`,
        isLoading: false,
        selection: text,
        status: "Something went wrong. Please try again.",
      });
    });
}

// @ts-expect-error this is for development
window.biai_run = run;
