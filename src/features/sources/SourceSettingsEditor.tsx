import { useId, useMemo, useState } from 'react';
import type { SourceChannelOption, SourcePreset, WebSourceOption } from '../../lib/api';
import { openTelegramLinkAndClose } from '../../lib/telegram';

export type SourceSettingsMode = 'preset' | 'custom';
export type EditableSourceChannel = { username: string; title: string };
export type EditableWebSource = { url: string; title: string };

type SourceSettingsEditorProps = {
  isRu: boolean;
  mode: SourceSettingsMode;
  selectedPresetKey: string;
  customChannels: EditableSourceChannel[];
  customWebSources: EditableWebSource[];
  presets: SourcePreset[];
  sourcePickerUrl?: string | null;
  disabled?: boolean;
  isSaving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  savingLabel?: string;
  onModeChange: (mode: SourceSettingsMode) => void;
  onSelectedPresetKeyChange: (presetKey: string) => void;
  onCustomChannelsChange: (channels: EditableSourceChannel[]) => void;
  onCustomWebSourcesChange: (webSources: EditableWebSource[]) => void;
  onSave?: () => void;
};

export function parseWebSourceValue(value: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }

  return {
    url: /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    title: trimmed,
    sourceKind: 'website',
  };
}

export function buildSourceSettingsPayload(
  customChannels: EditableSourceChannel[],
  customWebSources: EditableWebSource[],
) {
  const channels = Array.from(
    new Map(
      customChannels.map((item) => [String(item.username).toLowerCase(), {
        username: item.username,
        title: item.title,
        usedForStyle: true,
        usedForMonitoring: true,
      } satisfies SourceChannelOption])
    ).values()
  );
  const webSources = Array.from(
    new Map(
      customWebSources.map((item) => [String(item.url).toLowerCase(), {
        url: item.url,
        title: item.title,
        sourceKind: 'website',
      } satisfies WebSourceOption])
    ).values()
  );

  return { channels, webSources };
}

function getPresetDescription(preset: SourcePreset, isRu: boolean) {
  const description = String(preset.description || '').trim();
  if (description) {
    return description;
  }

  return isRu
    ? '\u0413\u043e\u0442\u043e\u0432\u0430\u044f \u043f\u043e\u0434\u0431\u043e\u0440\u043a\u0430 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u043e\u0432 \u0434\u043b\u044f \u0431\u044b\u0441\u0442\u0440\u043e\u0433\u043e \u0441\u0442\u0430\u0440\u0442\u0430.'
    : 'A curated source pack to get started faster.';
}

export function SourceSettingsEditor({
  isRu,
  mode,
  selectedPresetKey,
  customChannels,
  customWebSources,
  presets,
  sourcePickerUrl,
  disabled = false,
  isSaving = false,
  saveDisabled = false,
  saveLabel,
  savingLabel,
  onModeChange,
  onSelectedPresetKeyChange,
  onCustomChannelsChange,
  onCustomWebSourcesChange,
  onSave,
}: SourceSettingsEditorProps) {
  const [websiteInput, setWebsiteInput] = useState('');
  const [isPresetPickerOpen, setIsPresetPickerOpen] = useState(false);
  const presetSelectId = useId();
  const decoratedPresets = useMemo(
    () => presets.map((preset) => ({
      ...preset,
      descriptionText: getPresetDescription(preset, isRu),
    })),
    [isRu, presets],
  );
  const selectedPreset = decoratedPresets.find((preset) => preset.key === selectedPresetKey) || null;
  const channelHint = isRu
    ? '\u041a\u0430\u043d\u0430\u043b\u044b \u0434\u043e\u0431\u0430\u0432\u043b\u044f\u044e\u0442\u0441\u044f \u0447\u0435\u0440\u0435\u0437 Telegram-\u0431\u043e\u0442\u0430. \u041f\u043e\u0434\u0445\u043e\u0434\u044f\u0442 \u043f\u0443\u0431\u043b\u0438\u0447\u043d\u044b\u0435 \u043a\u0430\u043d\u0430\u043b\u044b \u0441 username.'
    : 'Channels are added through the Telegram bot. Public channels with usernames are supported.';
  const websiteHint = isRu
    ? '\u0421\u0430\u0439\u0442\u044b \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u044e\u0442\u0441\u044f \u043a\u0430\u043a \u0434\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438.'
    : 'Websites are saved as additional sources.';

  function addWebsite() {
    const nextItem = parseWebSourceValue(websiteInput);
    if (!nextItem) {
      return;
    }

    const nextMap = new Map(customWebSources.map((item) => [item.url.toLowerCase(), item]));
    nextMap.set(nextItem.url.toLowerCase(), {
      url: nextItem.url,
      title: nextItem.title,
    });
    onCustomWebSourcesChange(Array.from(nextMap.values()));
    setWebsiteInput('');
  }

  function removeChannel(username: string) {
    onCustomChannelsChange(customChannels.filter((item) => item.username !== username));
  }

  function removeWebsite(url: string) {
    onCustomWebSourcesChange(customWebSources.filter((item) => item.url !== url));
  }

  function handleOpenSourcePicker() {
    if (disabled) {
      return;
    }

    if (String(sourcePickerUrl || '').startsWith('mock://source-picker/')) {
      const mockUsername = `source${customChannels.length + 1}`;
      const nextMap = new Map(customChannels.map((item) => [item.username.toLowerCase(), item]));
      nextMap.set(mockUsername, {
        username: mockUsername,
        title: `@${mockUsername}`,
      });
      onCustomChannelsChange(Array.from(nextMap.values()));
      return;
    }

    if (sourcePickerUrl) {
      openTelegramLinkAndClose(sourcePickerUrl);
    }
  }

  function selectPreset(presetKey: string) {
    onSelectedPresetKeyChange(presetKey);
    setIsPresetPickerOpen(false);
  }

  return (
    <div className="source-settings-editor">
      <div className="setup-tabs source-settings-editor__tabs" role="tablist">
        <button
          className={`secondary-button secondary-button--small${mode === 'preset' ? ' setup-choice-button--active' : ''}`}
          disabled={disabled || isSaving}
          type="button"
          onClick={() => onModeChange('preset')}
        >
          {isRu ? '\u041f\u0440\u0435\u0441\u0435\u0442' : 'Preset'}
        </button>
        <button
          className={`secondary-button secondary-button--small${mode === 'custom' ? ' setup-choice-button--active' : ''}`}
          disabled={disabled || isSaving}
          type="button"
          onClick={() => onModeChange('custom')}
        >
          {isRu ? '\u0421\u0432\u043e\u0438 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Custom'}
        </button>
      </div>

      {mode === 'preset' ? (
        <div className="source-settings-editor__preset-compact">
          <span className="setup-field-label" id={presetSelectId}>
            {isRu ? '\u041d\u0430\u0431\u043e\u0440 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u043e\u0432' : 'Source preset'}
          </span>
          <div className="source-settings-editor__select-shell">
            <button
              aria-controls={`${presetSelectId}-listbox`}
              aria-expanded={isPresetPickerOpen}
              aria-haspopup="listbox"
              aria-labelledby={presetSelectId}
              className="source-settings-editor__select-button"
              disabled={disabled || isSaving || decoratedPresets.length === 0}
              type="button"
              onClick={() => setIsPresetPickerOpen((value) => !value)}
            >
              <span>{selectedPreset?.title || (isRu ? '\u0412\u044b\u0431\u0435\u0440\u0438 \u043f\u0440\u0435\u0441\u0435\u0442' : 'Choose a preset')}</span>
            </button>
            {isPresetPickerOpen ? (
              <div
                className="source-settings-editor__preset-menu"
                id={`${presetSelectId}-listbox`}
                role="listbox"
                aria-labelledby={presetSelectId}
              >
                {decoratedPresets.map((preset) => (
                  <button
                    aria-selected={selectedPresetKey === preset.key}
                    className={`source-settings-editor__preset-option${selectedPresetKey === preset.key ? ' is-active' : ''}`}
                    disabled={disabled || isSaving}
                    key={preset.key}
                    role="option"
                    type="button"
                    onClick={() => selectPreset(preset.key)}
                  >
                    <span
                      className="source-settings-editor__preset-dot"
                      style={preset.accentColor ? { ['--preset-accent' as string]: preset.accentColor } : undefined}
                      aria-hidden="true"
                    />
                    <span>{preset.title}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {selectedPreset ? (
            <div
              className="source-settings-editor__preset-preview"
              style={selectedPreset.accentColor ? { ['--preset-accent' as string]: selectedPreset.accentColor } : undefined}
            >
              <span className="source-settings-editor__preset-dot" aria-hidden="true" />
              <div>
                <strong>{selectedPreset.title}</strong>
                <p>{selectedPreset.descriptionText}</p>
              </div>
            </div>
          ) : (
            <span className="source-settings-editor__empty">
              {isRu ? '\u041f\u0440\u0435\u0441\u0435\u0442\u044b \u043f\u043e\u043a\u0430 \u043d\u0435 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b' : 'No presets available yet'}
            </span>
          )}
        </div>
      ) : (
        <div className="setup-source-stack source-settings-editor__custom">
          <section className="context-section context-section--tight setup-source-section">
            <span className="setup-field-label">{isRu ? '\u041a\u0430\u043d\u0430\u043b\u044b-\u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Source channels'}</span>
            <p className="editor-help">{channelHint}</p>
            <button
              className="secondary-button secondary-button--small"
              disabled={disabled || isSaving || !sourcePickerUrl}
              type="button"
              onClick={handleOpenSourcePicker}
            >
              {isRu ? '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043a\u0430\u043d\u0430\u043b \u0432 \u0431\u043e\u0442\u0435' : 'Add channel in bot'}
            </button>
            <div className="setup-chip-list" aria-live="polite">
              {customChannels.length === 0 ? (
                <span className="source-settings-editor__empty">
                  {isRu ? '\u041a\u0430\u043d\u0430\u043b\u044b \u043f\u043e\u043a\u0430 \u043d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d\u044b' : 'No channels selected yet'}
                </span>
              ) : customChannels.map((item) => (
                <span className="setup-chip" key={item.username}>
                  {item.title}
                  <button
                    aria-label={isRu ? '\u0423\u0434\u0430\u043b\u0438\u0442\u044c' : 'Remove'}
                    disabled={disabled || isSaving}
                    type="button"
                    onClick={() => removeChannel(item.username)}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </section>

          <section className="context-section context-section--tight setup-source-section">
            <span className="setup-field-label">{isRu ? '\u0421\u0441\u044b\u043b\u043a\u0430 \u043d\u0430 \u0441\u0430\u0439\u0442' : 'Website link'}</span>
            <p className="editor-help">{websiteHint}</p>
            <div className="setup-inline-input">
              <input
                disabled={disabled || isSaving}
                placeholder={isRu ? 'site.com \u0438\u043b\u0438 https://site.com' : 'site.com or https://site.com'}
                value={websiteInput}
                onChange={(event) => setWebsiteInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addWebsite();
                  }
                }}
              />
              <button
                className="secondary-button secondary-button--small"
                disabled={disabled || isSaving || !websiteInput.trim()}
                type="button"
                onClick={addWebsite}
              >
                {isRu ? '\u0413\u043e\u0442\u043e\u0432\u043e' : 'Add'}
              </button>
            </div>
            <div className="setup-chip-list" aria-live="polite">
              {customWebSources.length === 0 ? (
                <span className="source-settings-editor__empty">
                  {isRu ? '\u0421\u0430\u0439\u0442\u044b \u043f\u043e\u043a\u0430 \u043d\u0435 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u044b' : 'No websites added yet'}
                </span>
              ) : customWebSources.map((item) => (
                <span className="setup-chip" key={item.url}>
                  {item.title}
                  <button
                    aria-label={isRu ? '\u0423\u0434\u0430\u043b\u0438\u0442\u044c' : 'Remove'}
                    disabled={disabled || isSaving}
                    type="button"
                    onClick={() => removeWebsite(item.url)}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </section>
        </div>
      )}

      {onSave ? (
        <div className="source-settings-editor__actions">
          <button
            className="primary-button primary-button--profile"
            disabled={disabled || isSaving || saveDisabled || (mode === 'preset' && !selectedPresetKey)}
            type="button"
            onClick={onSave}
          >
            {isSaving
              ? (savingLabel || (isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : 'Saving...'))
              : (saveLabel || (isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Save sources'))}
          </button>
        </div>
      ) : null}
    </div>
  );
}
