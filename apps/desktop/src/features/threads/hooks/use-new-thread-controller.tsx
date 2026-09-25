import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type Dispatch,
  type DragEvent,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import type { ComposerAttachment, DesktopAppState } from "../../../../contracts/desktop-state";
import { acceptComposerAttachments } from "../../../../contracts/composer-attachments";
import { updateSnapshot } from "../../../app/desktop-app-state";
import {
  extractFilesFromDataTransfer,
  extractImageFilesFromClipboardData,
  handleClipboardImageShortcut,
  readComposerAttachmentsFromFiles,
} from "../../conversation/composer-attachments";
import type { PiDesktopApi } from "../../../../contracts/ipc";

interface UseNewThreadControllerParams {
  readonly api: PiDesktopApi | undefined;
  readonly setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>;
  readonly flushComposerDraft: () => void;
}

/** State for the New session text box, which starts a routed session on submit. */
export function useNewThreadController({
  api,
  setSnapshot,
  flushComposerDraft,
}: UseNewThreadControllerParams) {
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<readonly ComposerAttachment[]>([]);
  const [composerError, setComposerError] = useState<string | undefined>();
  const [starting, setStarting] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const updatePrompt = useCallback((value: SetStateAction<string>) => {
    setComposerError(undefined);
    setPrompt(value);
  }, []);

  const appendAccepted = useCallback((added: readonly ComposerAttachment[]) => {
    setAttachments((current) => {
      const accepted = acceptComposerAttachments(current, added);
      if (!accepted.ok) {
        setComposerError(accepted.error.message);
        return current;
      }
      setComposerError(undefined);
      return [...current, ...accepted.attachments];
    });
  }, []);

  const addAttachments = useCallback(
    (files: File[]) => {
      void readComposerAttachmentsFromFiles(files, attachments)
        .then((added) => {
          if (added.length > 0) appendAccepted(added);
        })
        .catch((error: unknown) => {
          setComposerError(error instanceof Error ? error.message : String(error));
        });
    },
    [appendAccepted, attachments],
  );

  const appendAttachment = useCallback(
    (attachment: ComposerAttachment) => appendAccepted([attachment]),
    [appendAccepted],
  );

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }, []);

  // Each fresh surface gets a generation, so a start still in flight from an earlier
  // surface neither blocks nor clears what the user types into this one.
  const surfaceGenerationRef = useRef(0);
  const startingGenerationRef = useRef<number | undefined>(undefined);

  const resetSurface = useCallback(() => {
    surfaceGenerationRef.current += 1;
    setPrompt("");
    setAttachments([]);
    setComposerError(undefined);
    setStarting(false);
  }, []);

  const openSurface = useCallback(() => {
    // Save the outgoing conversation before the new session can change the selection.
    flushComposerDraft();
    resetSurface();
    if (api) {
      void updateSnapshot(setSnapshot, () => api.setActiveView("new-thread")).catch(
        (error: unknown) => {
          console.error("[renderer] setActiveView failed", error);
        },
      );
    }
  }, [api, flushComposerDraft, resetSurface, setSnapshot]);

  const startSession = useCallback(() => {
    // The prompt clears only once the session exists, so a second Enter or click
    // before then would otherwise start it twice.
    const generation = surfaceGenerationRef.current;
    if (!api || startingGenerationRef.current === generation) {
      return;
    }
    if (!prompt.trim() && attachments.length === 0) {
      return;
    }
    startingGenerationRef.current = generation;
    setStarting(true);
    void updateSnapshot(setSnapshot, () => api.startRoutedSession({ prompt, attachments }))
      .then((state) => {
        if (surfaceGenerationRef.current !== generation) return;
        if (state.lastError) {
          setComposerError(state.lastError);
          return;
        }
        setPrompt("");
        setAttachments([]);
      })
      .catch((error: unknown) => {
        setComposerError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (startingGenerationRef.current === generation) {
          startingGenerationRef.current = undefined;
          setStarting(false);
        }
      });
  }, [api, attachments, prompt, setSnapshot]);

  const handleComposerPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const files = extractImageFilesFromClipboardData(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      addAttachments(files);
    },
    [addAttachments],
  );

  const handleComposerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const files = extractFilesFromDataTransfer(event.dataTransfer);
      if (files.length > 0) addAttachments(files);
    },
    [addAttachments],
  );

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        handleClipboardImageShortcut(
          event,
          api?.readClipboardImage,
          appendAttachment,
          setComposerError,
        )
      ) {
        return;
      }
      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
        return;
      }
      event.preventDefault();
      startSession();
    },
    [api, appendAttachment, startSession],
  );

  return useMemo(
    () => ({
      composerRef,
      prompt,
      attachments,
      composerError,
      starting,
      setPrompt: updatePrompt,
      addAttachments,
      removeAttachment,
      appendAttachment,
      handleComposerPaste,
      handleComposerDrop,
      handleComposerKeyDown,
      startSession,
      openSurface,
      resetSurface,
      setComposerError,
    }),
    [
      prompt,
      attachments,
      composerError,
      starting,
      updatePrompt,
      addAttachments,
      removeAttachment,
      appendAttachment,
      handleComposerPaste,
      handleComposerDrop,
      handleComposerKeyDown,
      startSession,
      openSurface,
      resetSurface,
    ],
  );
}
