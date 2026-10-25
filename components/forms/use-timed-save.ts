"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  idleSaveFeedback,
  reduceSaveFeedback,
  SAVE_UNEXPECTED_MESSAGE,
  SaveTimeoutError,
  withSaveTimeout,
  type SaveFeedback,
} from "@/lib/forms/save-feedback";

export function useTimedSave() {
  const router = useRouter();
  const [feedback, setFeedback] = useState<SaveFeedback>(idleSaveFeedback);
  const runId = useRef(0);

  async function run<T>(
    action: () => Promise<T>,
  ): Promise<{ status: "ok"; result: T } | { status: "timeout" } | { status: "error" }> {
    const id = ++runId.current;
    setFeedback((state) => reduceSaveFeedback(state, { type: "start" }));
    try {
      const result = await withSaveTimeout(action());
      if (id !== runId.current) return { status: "timeout" };
      return { status: "ok", result };
    } catch (err) {
      if (id !== runId.current) return { status: "timeout" };
      if (err instanceof SaveTimeoutError) {
        setFeedback((state) => reduceSaveFeedback(state, { type: "timeout" }));
        return { status: "timeout" };
      }
      setFeedback((state) =>
        reduceSaveFeedback(state, { type: "error", message: SAVE_UNEXPECTED_MESSAGE }),
      );
      return { status: "error" };
    } finally {
      if (id === runId.current) {
        setFeedback((state) => (state.pending ? { ...state, pending: false } : state));
      }
    }
  }

  function succeed(message: string) {
    setFeedback((state) => reduceSaveFeedback(state, { type: "success", message }));
  }

  function fail(message: string) {
    setFeedback((state) => reduceSaveFeedback(state, { type: "error", message }));
  }

  function refresh() {
    router.refresh();
  }

  return {
    pending: feedback.pending,
    error: feedback.error,
    success: feedback.success,
    run,
    succeed,
    fail,
    refresh,
  };
}
