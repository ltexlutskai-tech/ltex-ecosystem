"use client";

import * as React from "react";

type ToastVariant = "default" | "success" | "destructive";

interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 4000;

type Action =
  | { type: "ADD"; toast: ToastItem }
  | { type: "DISMISS"; toastId: string }
  | { type: "REMOVE"; toastId: string };

interface State {
  toasts: ToastItem[];
}

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };
    case "DISMISS":
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
    case "REMOVE":
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
}

function toast(props: Omit<ToastItem, "id">) {
  const id = genId();
  dispatch({ type: "ADD", toast: { ...props, id } });
  setTimeout(() => {
    dispatch({ type: "REMOVE", toastId: id });
  }, TOAST_REMOVE_DELAY);
  return id;
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId: string) => dispatch({ type: "DISMISS", toastId }),
  };
}

export { useToast, toast };
