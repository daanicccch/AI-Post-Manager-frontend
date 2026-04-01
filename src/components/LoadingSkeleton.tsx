type SkeletonBlockProps = {
  className?: string;
};

function SkeletonBlock({ className = '' }: SkeletonBlockProps) {
  return <span aria-hidden="true" className={`ui-skeleton${className ? ` ${className}` : ''}`} />;
}

function FilterCardSkeleton() {
  return (
    <section className="queue-control-card queue-control-card--skeleton">
      <div className="skeleton-stack">
        <SkeletonBlock className="ui-skeleton--title" />
        <SkeletonBlock className="ui-skeleton--pill" />
      </div>

      <div className="skeleton-chip-row">
        <SkeletonBlock className="ui-skeleton--chip" />
        <SkeletonBlock className="ui-skeleton--chip ui-skeleton--chip-wide" />
        <SkeletonBlock className="ui-skeleton--chip" />
      </div>

      <SkeletonBlock className="ui-skeleton--field" />
    </section>
  );
}

export function FeedListSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <>
      <FilterCardSkeleton />

      <div className="feed-list">
        {Array.from({ length: cards }, (_, index) => (
          <article className="feed-card feed-card--skeleton" key={`feed-skeleton-${index}`}>
            <SkeletonBlock className="ui-skeleton--card-visual" />

            <div className="feed-card__body skeleton-stack skeleton-stack--tight">
              <div className="skeleton-row">
                <SkeletonBlock className="ui-skeleton--line ui-skeleton--line-medium" />
                <SkeletonBlock className="ui-skeleton--badge" />
              </div>
              <SkeletonBlock className="ui-skeleton--line ui-skeleton--line-short" />
              <div className="skeleton-chip-row skeleton-chip-row--meta">
                <SkeletonBlock className="ui-skeleton--meta" />
                <SkeletonBlock className="ui-skeleton--meta" />
                <SkeletonBlock className="ui-skeleton--meta ui-skeleton--meta-short" />
              </div>
              <SkeletonBlock className="ui-skeleton--line" />
              <SkeletonBlock className="ui-skeleton--line ui-skeleton--line-medium" />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export function SourceListSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="source-pick-list source-pick-list--mobile">
      {Array.from({ length: cards }, (_, index) => (
        <article className="create-source-card create-source-card--skeleton" key={`source-skeleton-${index}`}>
          <SkeletonBlock className="ui-skeleton--card-visual" />

          <div className="create-source-card__body skeleton-stack skeleton-stack--tight">
            <div className="skeleton-row">
              <SkeletonBlock className="ui-skeleton--line ui-skeleton--line-medium" />
              <SkeletonBlock className="ui-skeleton--meta ui-skeleton--meta-short" />
            </div>
            <SkeletonBlock className="ui-skeleton--line ui-skeleton--line-short" />
            <SkeletonBlock className="ui-skeleton--line" />
            <SkeletonBlock className="ui-skeleton--line ui-skeleton--line-medium" />
          </div>
        </article>
      ))}
    </div>
  );
}

export function CreatePageSkeleton() {
  return (
    <section className="page-stack page-stack--create">
      <section className="editor-panel editor-panel--main create-flow create-flow--skeleton">
        <div className="create-compact-stack">
          <section className="create-compact-block create-flow-step">
            <div className="skeleton-stack skeleton-stack--tight">
              <SkeletonBlock className="ui-skeleton--eyebrow" />
              <div className="create-form-grid create-form-grid--compact">
                <SkeletonBlock className="ui-skeleton--field" />
                <SkeletonBlock className="ui-skeleton--field" />
              </div>
            </div>
          </section>

          <section className="create-compact-block create-compact-block--surface create-flow-step">
            <div className="skeleton-stack skeleton-stack--tight">
              <SkeletonBlock className="ui-skeleton--eyebrow" />

              <div className="create-mode-choices">
                <SkeletonBlock className="ui-skeleton--chip ui-skeleton--chip-wide" />
                <SkeletonBlock className="ui-skeleton--chip ui-skeleton--chip-wide" />
                <SkeletonBlock className="ui-skeleton--chip ui-skeleton--chip-wide" />
              </div>

              <SkeletonBlock className="ui-skeleton--panel" />
              <SkeletonBlock className="ui-skeleton--line ui-skeleton--line-medium" />
            </div>
          </section>
        </div>

        <div className="sticky-review-bar sticky-review-bar--create">
          <div className="sticky-review-bar__controls">
            <SkeletonBlock className="ui-skeleton--button" />
          </div>
        </div>
      </section>
    </section>
  );
}

export function SchedulePageSkeleton() {
  return (
    <section className="page-stack page-stack--schedule">
      <FilterCardSkeleton />

      <section className="editor-panel editor-panel--schedule editor-panel--skeleton">
        <div className="skeleton-stack">
          <SkeletonBlock className="ui-skeleton--eyebrow" />
          <SkeletonBlock className="ui-skeleton--line ui-skeleton--line-medium" />
        </div>

        <div className="create-form-grid create-form-grid--dual">
          <SkeletonBlock className="ui-skeleton--field" />
          <SkeletonBlock className="ui-skeleton--field" />
        </div>

        <SkeletonBlock className="ui-skeleton--toggle" />
        <SkeletonBlock className="ui-skeleton--panel ui-skeleton--panel-tall" />
        <SkeletonBlock className="ui-skeleton--panel ui-skeleton--panel-medium" />
      </section>
    </section>
  );
}

export function ProfilePageSkeleton() {
  return (
    <section className="page-stack page-stack--profile">
      <FilterCardSkeleton />

      <div className="profile-layout profile-layout--single">
        <section className="editor-panel editor-panel--main editor-panel--profile editor-panel--skeleton">
          <div className="action-row action-row--wrap profile-actions-row">
            <SkeletonBlock className="ui-skeleton--button ui-skeleton--button-secondary" />
            <SkeletonBlock className="ui-skeleton--button ui-skeleton--button-secondary" />
            <SkeletonBlock className="ui-skeleton--button" />
          </div>

          <SkeletonBlock className="ui-skeleton--panel ui-skeleton--panel-editor" />
        </section>
      </div>
    </section>
  );
}

export function DraftPageSkeleton() {
  return (
    <section className="page-stack page-stack--editor">
      <header className="page-hero page-hero--editor page-hero--review-compact page-hero--review-minimal page-hero--skeleton">
        <div className="review-hero-grid">
          <div className="skeleton-stack">
            <SkeletonBlock className="ui-skeleton--eyebrow" />
            <SkeletonBlock className="ui-skeleton--title ui-skeleton--title-wide" />
          </div>

          <div className="hero-inline hero-inline--compact">
            <SkeletonBlock className="ui-skeleton--badge" />
            <SkeletonBlock className="ui-skeleton--chip" />
          </div>
        </div>
      </header>

      <section className="editor-tabs editor-tabs--section editor-tabs--review">
        <SkeletonBlock className="ui-skeleton--tab" />
        <SkeletonBlock className="ui-skeleton--tab" />
      </section>

      <section className="editor-panel editor-panel--main workspace-section editor-panel--skeleton">
        <SkeletonBlock className="ui-skeleton--phone" />
        <SkeletonBlock className="ui-skeleton--panel ui-skeleton--panel-medium" />
      </section>
    </section>
  );
}

export function EditorComposerSkeleton() {
  return (
    <div className="editor-compose-skeleton">
      <div className="skeleton-chip-row">
        <SkeletonBlock className="ui-skeleton--chip" />
        <SkeletonBlock className="ui-skeleton--chip" />
        <SkeletonBlock className="ui-skeleton--chip" />
      </div>
      <SkeletonBlock className="ui-skeleton--panel ui-skeleton--panel-editor" />
    </div>
  );
}
