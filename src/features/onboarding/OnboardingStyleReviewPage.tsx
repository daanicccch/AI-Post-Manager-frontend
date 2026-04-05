import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { buildOnboardingUrl, useOnboardingData } from './onboardingShared';
import { OnboardingFooter } from './OnboardingFooter';

export function OnboardingStyleReviewPage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const profileId = typeof window === 'undefined'
    ? ''
    : String(new URLSearchParams(window.location.search).get('profileId') || '').trim();
  const { error, isLoading, profile, setError } = useOnboardingData(profileId);
  const [isSaving, setIsSaving] = useState(false);
  const [draftGuide, setDraftGuide] = useState('');

  useEffect(() => {
    setDraftGuide(String(profile?.personaGuideMarkdown || ''));
  }, [profile?.personaGuideMarkdown]);

  async function handleContinue() {
    if (!profile?.slug) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await api.updateProfileAssets(profile.slug, {
        personaGuideMarkdown: draftGuide,
      });
      await api.confirmOnboardingStyle(profile.slug);
      window.location.assign(buildOnboardingUrl('plan', profile.slug));
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Failed to continue');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && !profile) {
    return (
      <section className="page-stack">
        <div className="state-banner">{isRu ? '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0441\u0442\u0438\u043b\u044c...' : 'Loading style...'}</div>
      </section>
    );
  }

  if (!profile?.slug) {
    return null;
  }

  return (
    <section className="page-stack page-stack--setup page-stack--setup-review">
      <section className="setup-header">
        <div className="setup-progress" aria-label="Onboarding progress">
          <span className="setup-progress__segment setup-progress__segment--done" />
          <span className="setup-progress__segment setup-progress__segment--done" />
          <span className="setup-progress__segment setup-progress__segment--active" />
          <span className="setup-progress__segment" />
        </div>
        <h2 className="setup-header__title">{isRu ? '\u041f\u0440\u043e\u0432\u0435\u0440\u044c \u0441\u0442\u0438\u043b\u044c' : 'Review the style'}</h2>
      </section>

      {error && <div className="state-banner state-banner--error setup-error-banner">{error}</div>}

      <section className="editor-panel editor-panel--main editor-panel--profile setup-panel setup-panel--fill setup-style-review-panel">
        <textarea
          className="config-editor config-editor--setup-preview setup-style-review-editor"
          value={draftGuide}
          onChange={(event) => setDraftGuide(event.target.value)}
        />
      </section>

      <OnboardingFooter
        backLabel={isRu ? '\u041d\u0430\u0437\u0430\u0434' : 'Back'}
        continueLabel={
          isSaving
            ? (isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : 'Saving...')
            : (isRu ? '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c' : 'Continue')
        }
        continueDisabled={isSaving}
        onBack={() => window.location.assign(buildOnboardingUrl('style', profile.slug))}
        onContinue={handleContinue}
      />

    </section>
  );
}
