import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { ComposerAttachment } from "../../../contracts/desktop-state";
import { ArrowUpIcon, PiLogoMark, PlusIcon } from "../../ui/icons";
import { ComposerSurface } from "../conversation/composer-surface";

interface NewThreadViewProps {
  readonly prompt: string;
  readonly attachments: readonly ComposerAttachment[];
  readonly lastError?: string;
  readonly starting: boolean;
  readonly composerRef: RefObject<HTMLTextAreaElement | null>;
  readonly onChangePrompt: (prompt: string) => void;
  readonly onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onComposerPaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  readonly onComposerDrop: (event: DragEvent<HTMLDivElement>) => void;
  readonly onAddAttachments: (files: File[]) => void;
  readonly onRemoveAttachment: (attachmentId: string) => void;
  readonly onSubmit: () => void;
  /** Shown above the text box, such as the local-model setup prompt. */
  readonly notice?: ReactNode;
}

/**
 * A new session is only a text box: the router picks the project, model,
 * thinking level and mode from what the user types.
 */
export function NewThreadView({
  prompt,
  attachments,
  lastError,
  starting,
  composerRef,
  onChangePrompt,
  onComposerKeyDown,
  onComposerPaste,
  onComposerDrop,
  onAddAttachments,
  onRemoveAttachment,
  onSubmit,
  notice,
}: NewThreadViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasContent = Boolean(prompt.trim() || attachments.length > 0);

  useEffect(() => {
    composerRef.current?.focus();
  }, [composerRef]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) {
      return;
    }
    composer.style.height = "0px";
    composer.style.height = `${Math.min(composer.scrollHeight, 260)}px`;
  }, [composerRef, prompt]);

  return (
    <section className="canvas canvas--new-thread">
      <div className="new-thread">
        <div className="new-thread__hero">
          <div className="new-thread__logo" data-testid="new-thread-logo">
            <PiLogoMark />
          </div>
          <div className="new-thread__eyebrow">New session</div>
          <h1 className="new-thread__title">What are we doing?</h1>
        </div>

        {notice}
        <div className="new-thread__composer composer">
          <div className="conversation conversation--composer">
            <ComposerSurface
              lastError={lastError}
              queuedMessages={[]}
              composerDraft={prompt}
              setComposerDraft={onChangePrompt}
              composerRef={composerRef}
              attachments={attachments}
              slashSections={[]}
              slashOptions={[]}
              showSlashMenu={false}
              showSlashOptionMenu={false}
              onClearSlashCommand={() => undefined}
              onComposerKeyDown={onComposerKeyDown}
              onComposerPaste={onComposerPaste}
              onComposerDrop={onComposerDrop}
              onEditQueuedMessage={() => undefined}
              onCancelQueuedEdit={() => undefined}
              onRemoveQueuedMessage={() => undefined}
              onSteerQueuedMessage={() => undefined}
              onRemoveAttachment={onRemoveAttachment}
              onSelectSlashCommand={() => undefined}
              onSelectSlashOption={() => undefined}
              showMentionMenu={false}
              mentionOptions={[]}
              selectedMentionIndex={0}
              onSelectMention={() => undefined}
              onEnableMentionExtension={() => undefined}
              textareaLabel="New session prompt"
              textareaTestId="new-thread-composer"
              textareaClassName="new-thread__textarea"
              textareaPlaceholder="Ask anything. Routey picks the project, model and effort."
              footer={
                <div className="composer__footer">
                  <div className="composer__footer-row">
                    <div className="composer__hint new-thread__hint">
                      {starting ? "Routing…" : null}
                    </div>
                    <div className="composer__actions">
                      <input
                        ref={fileInputRef}
                        hidden
                        type="file"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          if (files.length > 0) {
                            onAddAttachments(files);
                          }
                          event.currentTarget.value = "";
                        }}
                      />
                      <button
                        aria-label="Attach files"
                        className="icon-button composer__attach"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <PlusIcon />
                      </button>
                      <button
                        aria-label="Start session"
                        className="button button--primary button--cta-icon"
                        type="button"
                        disabled={!hasContent || starting}
                        onClick={onSubmit}
                      >
                        <ArrowUpIcon />
                      </button>
                    </div>
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
