import { useEffect, useState } from 'react';

const EDITABLE_SELECTOR = [
  'input:not([type="button"]):not([type="checkbox"]):not([type="color"]):not([type="file"]):not([type="radio"]):not([type="range"]):not([type="reset"]):not([type="submit"])',
  'textarea',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '.ProseMirror',
  '.rich-text-editor__content'
].join(', ');

function getEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  if (target.matches(EDITABLE_SELECTOR)) {
    return target;
  }

  return target.closest<HTMLElement>(EDITABLE_SELECTOR);
}

function shouldKeepFocus(activeElement: HTMLElement, interactionTarget: HTMLElement) {
  if (activeElement === interactionTarget || activeElement.contains(interactionTarget) || interactionTarget.contains(activeElement)) {
    return true;
  }

  const richTextRegion = activeElement.closest('.rich-text-dialog, .rich-text-editor-shell');
  if (richTextRegion?.contains(interactionTarget)) {
    return true;
  }

  const activeRegion = activeElement.closest('label, .field-block, .field-inline');
  return Boolean(activeRegion?.contains(interactionTarget));
}

function getScrollContainer(target: HTMLElement) {
  return target.closest<HTMLElement>('.workspace-main-shell') || document.scrollingElement;
}

function getCaretRect(target: HTMLElement) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const rect = target.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(target);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight);
    const caretHeight = Number.isFinite(lineHeight) ? Math.min(lineHeight, rect.height) : rect.height;

    return new DOMRect(rect.left, rect.top, rect.width, caretHeight);
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const anchorNode = selection.anchorNode;
  if (anchorNode && !target.contains(anchorNode)) {
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);

  const rangeRect = Array.from(range.getClientRects()).find((rect) => rect.width > 0 || rect.height > 0);
  if (rangeRect) {
    return rangeRect;
  }

  const fallbackRect = range.getBoundingClientRect();
  if (fallbackRect.width > 0 || fallbackRect.height > 0) {
    return fallbackRect;
  }

  return null;
}

function scrollEditableIntoView(target: HTMLElement) {
  const scrollContainer = getScrollContainer(target);
  if (typeof target.scrollIntoView !== 'function' || !scrollContainer) {
    return;
  }

  const scrollToCaret = () => {
    window.requestAnimationFrame(() => {
      const viewport = window.visualViewport;
      const targetRect = target.getBoundingClientRect();
      const caretRect = getCaretRect(target) || targetRect;
      const topPadding = 20;
      const bottomPadding = 28;
      const visibleTop = (viewport?.offsetTop || 0) + topPadding;
      const visibleBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - bottomPadding;

      let delta = 0;
      if (caretRect.bottom > visibleBottom) {
        delta = caretRect.bottom - visibleBottom;
      } else if (caretRect.top < visibleTop) {
        delta = caretRect.top - visibleTop;
      } else if (targetRect.bottom > visibleBottom) {
        delta = targetRect.bottom - visibleBottom;
      } else if (targetRect.top < visibleTop) {
        delta = targetRect.top - visibleTop;
      }

      if (Math.abs(delta) < 1) {
        return;
      }

      if (scrollContainer instanceof HTMLElement) {
        scrollContainer.scrollBy({
          top: delta,
          behavior: 'smooth'
        });
        return;
      }

      window.scrollBy({
        top: delta,
        behavior: 'smooth'
      });
    });
  };

  const viewport = window.visualViewport;
  if (!viewport) {
    window.setTimeout(scrollToCaret, 140);
    return;
  }

  let finished = false;
  let fallbackTimer = 0;

  const complete = () => {
    if (finished) {
      return;
    }

    finished = true;
    viewport.removeEventListener('resize', complete);
    viewport.removeEventListener('scroll', complete);
    window.clearTimeout(fallbackTimer);
    window.setTimeout(scrollToCaret, 40);
  };

  viewport.addEventListener('resize', complete);
  viewport.addEventListener('scroll', complete);
  fallbackTimer = window.setTimeout(complete, 260);
}

function measureKeyboardOpen() {
  const viewport = window.visualViewport;
  const activeEditable = getEditableTarget(document.activeElement);

  if (!viewport || !activeEditable) {
    return false;
  }

  const stableHeight = Number(window.Telegram?.WebApp?.viewportStableHeight || 0);
  const baseHeight = Math.max(window.innerHeight, stableHeight, viewport.height);
  const keyboardInset = baseHeight - viewport.height - viewport.offsetTop;

  return keyboardInset > 120;
}

export function useTelegramKeyboard() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [textEntryActive, setTextEntryActive] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const syncKeyboardState = () => {
      setKeyboardOpen(measureKeyboardOpen());
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = getEditableTarget(event.target);
      if (!target) {
        syncKeyboardState();
        return;
      }

      setTextEntryActive(true);
      scrollEditableIntoView(target);
      window.setTimeout(syncKeyboardState, 50);
    };

    const handleFocusOut = () => {
      window.setTimeout(() => {
        setTextEntryActive(Boolean(getEditableTarget(document.activeElement)));
        syncKeyboardState();
      }, 80);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const activeEditable = getEditableTarget(document.activeElement);
      if (!activeEditable) {
        return;
      }

      const interactionTarget = event.target instanceof HTMLElement ? event.target : null;
      if (!interactionTarget || shouldKeepFocus(activeEditable, interactionTarget)) {
        return;
      }

      activeEditable.blur();
      window.setTimeout(syncKeyboardState, 0);
    };

    const viewport = window.visualViewport;

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('resize', syncKeyboardState);
    viewport?.addEventListener('resize', syncKeyboardState);
    viewport?.addEventListener('scroll', syncKeyboardState);

    syncKeyboardState();

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('resize', syncKeyboardState);
      viewport?.removeEventListener('resize', syncKeyboardState);
      viewport?.removeEventListener('scroll', syncKeyboardState);
    };
  }, []);

  return keyboardOpen || textEntryActive;
}
