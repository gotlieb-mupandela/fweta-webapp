export const SAVE_TIMEOUT_MS = 25_000;

export const SAVE_TIMEOUT_MESSAGE =
  "Saving is taking too long. Your entries are still here. Try again.";

export const SAVE_UNEXPECTED_MESSAGE =
  "Something went wrong. Your entries are still here. Try again.";

export class SaveTimeoutError extends Error {
  constructor() {
    super(SAVE_TIMEOUT_MESSAGE);
    this.name = "SaveTimeoutError";
  }
}

export type SaveFeedback = {
  pending: boolean;
  error: string | null;
  success: string | null;
};

export const idleSaveFeedback: SaveFeedback = {
  pending: false,
  error: null,
  success: null,
};

export type SaveFeedbackEvent =
  | { type: "start" }
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | { type: "timeout" };

/** Pending, success, and error stay mutually exclusive. Timeout does not clear typed fields. */
export function reduceSaveFeedback(state: SaveFeedback, event: SaveFeedbackEvent): SaveFeedback {
  switch (event.type) {
    case "start":
      return { pending: true, error: null, success: null };
    case "success":
      return { pending: false, error: null, success: event.message };
    case "error":
      return { pending: false, error: event.message, success: null };
    case "timeout":
      return { pending: false, error: SAVE_TIMEOUT_MESSAGE, success: null };
    default:
      return state;
  }
}

export type ProfileDraft = {
  displayName: string;
  bio: string;
};

/** The field values after a save come from the saved profile, not the previous defaults. */
export function applySavedProfile(saved: ProfileDraft): ProfileDraft {
  return {
    displayName: saved.displayName,
    bio: saved.bio,
  };
}

export async function withSaveTimeout<T>(work: Promise<T>, ms = SAVE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new SaveTimeoutError()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
