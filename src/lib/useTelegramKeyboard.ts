import { useEffect, useState } from 'react';

const EDITABLE_SELECTOR = [
  'input:not([type="button"]):not([type="checkbox"]):not([type="color"]):not([type="file"]):not([type="radio"]):not([type="range"]):not([type="reset"]):not([type="submit"])',
  'textarea',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '.ProseMirror',
  '.rich-text-editor__content'
].join(', ');

const TEXT_CARET_MIRROR_PROPERTIES = [
  'box-sizing',
  'width',
  'height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'font-stretch',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'text-indent',
  'text-rendering',
  'text-decoration',
  'direction',
  'tab-size'
];

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

function getTextEntryCaretRect(target: HTMLInputElement | HTMLTextAreaElement) {
  const computedStyle = window.getComputedStyle(target);
  const targetRect = target.getBoundingClientRect();
  const mirror = document.createElement('div');

  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'fixed';
  mirror.style.top = `${targetRect.top}px`;
  mirror.style.left = `${targetRect.left}px`;
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.overflow = 'auto';
  mirror.style.whiteSpace = target instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre';
  mirror.style.overflowWrap = target instanceof HTMLTextAreaElement ? 'break-word' : 'normal';
  mirror.style.wordBreak = 'normal';

  TEXT_CARET_MIRROR_PROPERTIES.forEach((property) => {
    mirror.style.setProperty(property, computedStyle.getPropertyValue(property));
  });

  const caretIndex = target.selectionEnd ?? target.selectionStart ?? target.value.length;
  const marker = document.createElement('span');
  const nextCharacter = target.value.slice(caretIndex, caretIndex + 1);

  mirror.textContent = target.value.slice(0, caretIndex);
  marker.textContent = nextCharacter || '.';
  mirror.append(marker);
  document.body.append(mirror);

  mirror.scrollTop = target.scrollTop;
  mirror.scrollLeft = target.scrollLeft;

  const markerRect = marker.getBoundingClientRect();
  const lineHeight = Number.parseFloat(computedStyle.lineHeight);
  const caretHeight = Number.isFinite(lineHeight) ? Math.min(lineHeight, targetRect.height) : markerRect.height || targetRect.height;

  mirror.remove();

  return new DOMRect(markerRect.left, markerRect.top, Math.max(1, markerRect.width), caretHeight);
}

function getCaretRect(target: HTMLElement) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return getTextEntryCaretRect(target);
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
      const viewportTop = (viewport?.offsetTop || 0) + topPadding;
      const viewportBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - bottomPadding;

      let visibleTop = viewportTop;
      let visibleBottom = viewportBottom;

      if (scrollContainer instanceof HTMLElement) {
        const containerRect = scrollContainer.getBoundingClientRect();
        visibleTop = Math.max(containerRect.top + topPadding, viewportTop);
        visibleBottom = Math.min(containerRect.bottom - bottomPadding, viewportBottom);
      }

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

    let scrollFrame = 0;

    const scheduleScrollIntoView = (target: HTMLElement) => {
      if (scrollFrame) {
        window.cancelAnimationFrame(scrollFrame);
      }

      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        scrollEditableIntoView(target);
      });
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = getEditableTarget(event.target);
      if (!target) {
        syncKeyboardState();
        return;
      }

      setTextEntryActive(true);
      scheduleScrollIntoView(target);
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

    const handleSelectionChange = () => {
      const activeEditable = getEditableTarget(document.activeElement);
      if (!activeEditable) {
        return;
      }

      scheduleScrollIntoView(activeEditable);
    };

    const handleInput = (event: Event) => {
      const target = getEditableTarget(event.target);
      if (!target) {
        return;
      }

      scheduleScrollIntoView(target);
    };

    const viewport = window.visualViewport;

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('input', handleInput, true);
    window.addEventListener('resize', syncKeyboardState);
    viewport?.addEventListener('resize', syncKeyboardState);
    viewport?.addEventListener('scroll', syncKeyboardState);

    syncKeyboardState();

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('input', handleInput, true);
      window.removeEventListener('resize', syncKeyboardState);
      viewport?.removeEventListener('resize', syncKeyboardState);
      viewport?.removeEventListener('scroll', syncKeyboardState);
      if (scrollFrame) {
        window.cancelAnimationFrame(scrollFrame);
      }
    };
  }, []);

  return keyboardOpen || textEntryActive;
}
