import type { ClarifyingQuestion, ErrorCode, TriageResult } from "../../shared/types";
import { ENHANCE_PORT } from "../../shared/messages";
import type { ContentToWorker, WorkerToContent } from "../../shared/messages";

type PanelState = "idle" | "loading" | "suggestion" | "questions" | "error";

export class Panel {
  private root: HTMLElement;
  private state: PanelState = "idle";
  private streamedImprovedPrompt = "";
  private originalPrompt = "";
  private lastResult: TriageResult | null = null;
  private acceptCallback: ((text: string) => void) | null = null;

  constructor() {
    this.root = this.createRoot();
    document.body.appendChild(this.root);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  showLoading(): void {
    this.streamedImprovedPrompt = "";
    this.lastResult = null;
    this.setState("loading");
    this.render();
  }

  onDelta(text: string): void {
    this.streamedImprovedPrompt += text;
    if (this.state === "loading") {
      this.renderLoadingWithPreview();
    }
  }

  showResult(result: TriageResult, onAccept: (text: string) => void): void {
    this.lastResult = result;
    this.acceptCallback = onAccept;

    if (result.category === "leave_alone") {
      this.showLeaveAlone();
      return;
    }

    if (result.category === "ask" && result.questions?.length) {
      this.setState("questions");
    } else {
      this.setState("suggestion");
    }
    this.render();
  }

  showError(code: ErrorCode, message: string, onRetry: () => void): void {
    this.setState("error");
    this.renderError(code, message, onRetry);
  }

  // ── State helpers ───────────────────────────────────────────────────────────

  private setState(s: PanelState): void {
    this.state = s;
    this.root.style.display = s === "idle" ? "none" : "block";
  }

  private close(): void {
    this.setState("idle");
    this.root.innerHTML = "";
  }

  // ── Renderers ───────────────────────────────────────────────────────────────

  private render(): void {
    this.root.innerHTML = "";
    switch (this.state) {
      case "loading":
        this.renderLoading();
        break;
      case "suggestion":
        this.renderSuggestion();
        break;
      case "questions":
        this.renderQuestions();
        break;
    }
  }

  private renderLoading(): void {
    const wrap = el("div", { className: "pe-loading" });
    wrap.appendChild(spinner());
    wrap.appendChild(text("Thinking…"));
    this.root.appendChild(wrap);
  }

  private renderLoadingWithPreview(): void {
    const existing = this.root.querySelector(".pe-loading-preview");
    if (!existing) {
      // First delta — replace spinner with preview
      this.root.innerHTML = "";
      const wrap = el("div", { className: "pe-loading-preview" });
      const header = el("div", { className: "pe-header" });
      header.appendChild(text("PromptMate", "pe-title"));
      header.appendChild(spinner("pe-spinner-sm"));
      wrap.appendChild(header);
      const preview = el("div", { className: "pe-preview-text" });
      preview.id = "pe-preview-text";
      preview.textContent = this.streamedImprovedPrompt;
      wrap.appendChild(preview);
      this.root.appendChild(wrap);
    } else {
      const preview = this.root.querySelector<HTMLElement>("#pe-preview-text");
      if (preview) preview.textContent = this.streamedImprovedPrompt;
    }
  }

  private renderSuggestion(): void {
    if (!this.lastResult) return;
    const result = this.lastResult;
    const improved = result.improvedPrompt ?? this.streamedImprovedPrompt;

    const wrap = el("div", { className: "pe-panel" });

    // Header
    const header = el("div", { className: "pe-header" });
    header.appendChild(text("PromptMate", "pe-title"));
    const badge = el("span", { className: `pe-badge pe-badge--${result.category}` });
    badge.textContent = result.category === "light" ? "Light touch" : "Rewrite";
    header.appendChild(badge);
    const closeBtn = iconBtn("✕", "Close", () => this.close());
    closeBtn.className = "pe-close";
    header.appendChild(closeBtn);
    wrap.appendChild(header);

    // Improved prompt
    const improvedLabel = el("div", { className: "pe-label" });
    improvedLabel.textContent = "Suggested prompt";
    wrap.appendChild(improvedLabel);

    const improvedBox = el("div", { className: "pe-improved" });
    improvedBox.textContent = improved; // safe — textContent, not innerHTML
    wrap.appendChild(improvedBox);

    // Assumptions (rewrite only)
    if (result.assumptions?.length) {
      const aLabel = el("div", { className: "pe-label" });
      aLabel.textContent = "Assumptions made";
      wrap.appendChild(aLabel);

      const aList = el("ul", { className: "pe-assumptions" });
      for (const assumption of result.assumptions) {
        const li = document.createElement("li");
        li.textContent = assumption; // safe
        aList.appendChild(li);
      }
      wrap.appendChild(aList);
    }

    // Actions
    const actions = el("div", { className: "pe-actions" });

    const useBtn = el("button", { className: "pe-btn pe-btn--primary" });
    useBtn.textContent = "Use this";
    useBtn.addEventListener("click", () => {
      this.originalPrompt = this.lastResult?.improvedPrompt ?? "";
      this.acceptCallback?.(improved);
      this.close();
      this.showRevertToast();
    });
    actions.appendChild(useBtn);

    const editBtn = el("button", { className: "pe-btn pe-btn--secondary" });
    editBtn.textContent = "Edit first";
    editBtn.addEventListener("click", () => {
      improvedBox.contentEditable = "true";
      improvedBox.classList.add("pe-improved--editable");
      improvedBox.focus();
      editBtn.style.display = "none";
      const confirmBtn = el("button", { className: "pe-btn pe-btn--primary" });
      confirmBtn.textContent = "Use edited";
      confirmBtn.addEventListener("click", () => {
        const edited = improvedBox.textContent ?? improved;
        this.acceptCallback?.(edited);
        this.close();
      });
      actions.insertBefore(confirmBtn, editBtn.nextSibling);
    });
    actions.appendChild(editBtn);

    const keepBtn = el("button", { className: "pe-btn pe-btn--ghost" });
    keepBtn.textContent = "Keep mine";
    keepBtn.addEventListener("click", () => this.close());
    actions.appendChild(keepBtn);

    wrap.appendChild(actions);
    this.root.appendChild(wrap);
  }

  private renderQuestions(): void {
    if (!this.lastResult?.questions?.length) return;
    const questions = this.lastResult.questions;
    const ctx = this.lastResult;

    const wrap = el("div", { className: "pe-panel" });

    const header = el("div", { className: "pe-header" });
    header.appendChild(text("PromptMate — A couple of questions", "pe-title"));
    const closeBtn = iconBtn("✕", "Close", () => this.close());
    closeBtn.className = "pe-close";
    header.appendChild(closeBtn);
    wrap.appendChild(header);

    const answers: Record<string, string> = {};
    const answerEls: Map<string, HTMLElement> = new Map();

    for (const q of questions) {
      const qWrap = el("div", { className: "pe-question" });
      const qLabel = el("div", { className: "pe-question-text" });
      qLabel.textContent = q.text; // safe
      qWrap.appendChild(qLabel);

      if (q.kind === "choice" && q.options?.length) {
        const chips = el("div", { className: "pe-chips" });
        for (const option of q.options) {
          const chip = el("button", { className: "pe-chip" });
          chip.textContent = option; // safe
          chip.addEventListener("click", () => {
            chips.querySelectorAll(".pe-chip").forEach((c) => c.classList.remove("pe-chip--active"));
            chip.classList.add("pe-chip--active");
            answers[q.id] = option;
          });
          chips.appendChild(chip);
        }
        qWrap.appendChild(chips);
        answerEls.set(q.id, chips);
      } else {
        const input = document.createElement("textarea");
        input.className = "pe-freeform";
        input.placeholder = "Your answer…";
        input.rows = 2;
        input.addEventListener("input", () => { answers[q.id] = input.value; });
        qWrap.appendChild(input);
        answerEls.set(q.id, input);
      }

      wrap.appendChild(qWrap);
    }

    const actions = el("div", { className: "pe-actions" });
    const submitBtn = el("button", { className: "pe-btn pe-btn--primary" });
    submitBtn.textContent = "Continue";
    submitBtn.addEventListener("click", () => {
      // Send answers back to service worker and show loading state
      this.setState("loading");
      this.render();
      this.sendAnswers(ctx, questions, answers);
    });
    actions.appendChild(submitBtn);

    const skipBtn = el("button", { className: "pe-btn pe-btn--ghost" });
    skipBtn.textContent = "Skip";
    skipBtn.addEventListener("click", () => this.close());
    actions.appendChild(skipBtn);

    wrap.appendChild(actions);
    this.root.appendChild(wrap);
  }

  private renderError(code: ErrorCode, message: string, onRetry: () => void): void {
    this.root.innerHTML = "";
    const wrap = el("div", { className: "pe-panel pe-panel--error" });

    const header = el("div", { className: "pe-header" });
    header.appendChild(text("PromptMate", "pe-title"));
    const closeBtn = iconBtn("✕", "Close", () => this.close());
    closeBtn.className = "pe-close";
    header.appendChild(closeBtn);
    wrap.appendChild(header);

    const msg = el("div", { className: "pe-error-msg" });
    if (code === "NO_KEY") {
      msg.textContent = "No API key set.";
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = " Open settings";
      link.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      });
      msg.appendChild(link);
    } else {
      msg.textContent = message;
    }
    wrap.appendChild(msg);

    if (code !== "NO_KEY") {
      const actions = el("div", { className: "pe-actions" });
      const retryBtn = el("button", { className: "pe-btn pe-btn--primary" });
      retryBtn.textContent = "Retry";
      retryBtn.addEventListener("click", () => {
        this.close();
        onRetry();
      });
      actions.appendChild(retryBtn);
      wrap.appendChild(actions);
    }

    this.root.appendChild(wrap);
  }

  private showLeaveAlone(): void {
    // Small auto-dismiss toast
    const toast = el("div", { className: "pe-toast" });
    toast.textContent = "✓ Looks clear — no changes needed";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
    this.setState("idle");
  }

  private showRevertToast(): void {
    // Revert option lives for 8s
    const toast = el("div", { className: "pe-toast pe-toast--revert" });
    const msg = el("span");
    msg.textContent = "Prompt updated.";
    toast.appendChild(msg);
    if (this.originalPrompt) {
      const revertBtn = el("button", { className: "pe-toast-btn" });
      revertBtn.textContent = "Undo";
      revertBtn.addEventListener("click", () => {
        this.acceptCallback?.(this.originalPrompt);
        toast.remove();
      });
      toast.appendChild(revertBtn);
    }
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  }

  // ── Ask-path second call ────────────────────────────────────────────────────

  private sendAnswers(
    ctx: TriageResult,
    questions: ClarifyingQuestion[],
    answers: Record<string, string>,
  ): void {
    const originalCtx = {
      prompt: questions.map((q) => `Q: ${q.text}\nA: ${answers[q.id] ?? ""}`).join("\n"),
      siteId: "unknown",
    };

    this.streamedImprovedPrompt = "";

    const port = chrome.runtime.connect({ name: ENHANCE_PORT });
    const msg: ContentToWorker = {
      type: "ANSWER_QUESTIONS",
      ctx: originalCtx,
      answers,
    };

    port.onMessage.addListener((incoming: WorkerToContent) => {
      switch (incoming.type) {
        case "STREAM_DELTA":
          this.onDelta(incoming.text);
          break;
        case "RESULT":
          this.showResult(incoming.result, this.acceptCallback ?? (() => {}));
          break;
        case "ERROR":
          this.showError(incoming.code, incoming.message, () => {});
          break;
      }
    });

    port.postMessage(msg);
    // suppress unused var warning
    void ctx;
  }

  // ── DOM factory ─────────────────────────────────────────────────────────────

  private createRoot(): HTMLElement {
    const root = el("div", { className: "pe-root" });
    root.style.display = "none";
    return root;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Partial<{ className: string; id: string }>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props?.className) node.className = props.className;
  if (props?.id) node.id = props.id;
  return node;
}

function text(content: string, className?: string): HTMLSpanElement {
  const span = el("span");
  if (className) span.className = className;
  span.textContent = content;
  return span;
}

function spinner(cls = "pe-spinner"): HTMLDivElement {
  const d = el("div");
  d.className = cls;
  return d;
}

function iconBtn(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const btn = el("button");
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  btn.textContent = icon;
  btn.addEventListener("click", onClick);
  return btn;
}
