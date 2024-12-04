import { makeAutoObservable } from "mobx";

export const POPUP_CONTAINER_ID = "biai-extension-1-root";

export interface InferenceResult {
  content?: string;
  tags?: string[];
}

export interface Message {
  role: "user" | "assistant";
  message: string;
}

export interface PopupRenderingProps {
  popupId: string;
  selection: string;
  isLoading?: boolean;
  status?: string;
  result?: InferenceResult;
  messages?: Message[];
}

export class PopupStore {
  popupId = "";
  selection = "";
  isLoading = false;
  status?: string;
  result?: InferenceResult;
  messages: Message[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  update(props: Partial<PopupRenderingProps>) {
    Object.assign(this, props);
  }
}
