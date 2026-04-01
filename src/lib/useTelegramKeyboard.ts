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

  const activeRegion = activeElement.closest('label, .field-block, .field-inline, .rich-text-editor-shell, .rich-text-dialog');
  return Boolean(activeRegion?.contains(interactionTarget));
}

function scrollEditableIntoView(target: HTMLElement) {
  if (typeof target.scrollIntoView !== 'function') {
    return;
  }

  const scrollToTarget = () => {
    window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    });
  };

  const viewport = window.visualViewport;
  if (!viewport) {
    window.setTimeout(scrollToTarget, 140);
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
    window.setTimeout(scrollToTarget, 40);
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
