export type PostFooterLinksLayout = 'two_columns' | 'one_column' | 'inline';

export interface PostFooterLink {
  id?: string;
  label: string;
  url: string;
  enabled?: boolean;
}

export interface PostFooterLinksConfig {
  enabled: boolean;
  layout: PostFooterLinksLayout;
  links: PostFooterLink[];
}

export const emptyPostFooterLinksConfig: PostFooterLinksConfig = {
  enabled: false,
  layout: 'two_columns',
  links: [],
};

const validLayouts = new Set<PostFooterLinksLayout>(['two_columns', 'one_column', 'inline']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAllowedUrl(value: string) {
  return /^(https?:\/\/|tg:\/\/)/i.test(value.trim());
}

function mergeLegacySuffix(label: string, suffix: string) {
  const cleanLabel = label.trim();
  const cleanSuffix = suffix.trim();

  if (!cleanSuffix) {
    return cleanLabel;
  }

  if (!cleanLabel) {
    return cleanSuffix;
  }

  return cleanLabel.endsWith(cleanSuffix) ? cleanLabel : `${cleanLabel} ${cleanSuffix}`;
}

export function normalizePostFooterLinksConfig(value: unknown): PostFooterLinksConfig {
  if (!isRecord(value)) {
    return { ...emptyPostFooterLinksConfig, links: [] };
  }

  const layoutCandidate = String(value.layout || '');
  const layout = validLayouts.has(layoutCandidate as PostFooterLinksLayout)
    ? layoutCandidate as PostFooterLinksLayout
    : 'two_columns';
  const links = (Array.isArray(value.links) ? value.links : [])
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const label = mergeLegacySuffix(
        String(item.label || ''),
        String(item.suffix || '')
      );

      return {
        id: String(item.id || `link-${index + 1}`),
        label,
        url: String(item.url || '').trim(),
        enabled: true,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 12);

  return {
    enabled: value.enabled !== false,
    layout,
    links,
  };
}

export function getVisiblePostFooterLinks(config: PostFooterLinksConfig | null | undefined) {
  const normalized = normalizePostFooterLinksConfig(config);
  if (!normalized.enabled) {
    return [];
  }

  return normalized.links.filter((link) => (
    link.label.trim() &&
    isAllowedUrl(link.url)
  ));
}

export function getEffectivePostFooterLinksConfig(
  draftConfig: unknown,
  profileConfig: unknown
): PostFooterLinksConfig {
  if (isRecord(draftConfig)) {
    return normalizePostFooterLinksConfig(draftConfig);
  }

  if (isRecord(profileConfig)) {
    return normalizePostFooterLinksConfig(profileConfig);
  }

  return normalizePostFooterLinksConfig(null);
}

export function serializePostFooterLinksConfig(config: PostFooterLinksConfig) {
  const normalized = normalizePostFooterLinksConfig(config);
  return JSON.stringify({
    enabled: normalized.enabled,
    layout: normalized.layout,
    links: normalized.links.map((link, index) => ({
      id: link.id || `link-${index + 1}`,
      label: link.label.trim(),
      url: link.url.trim(),
      enabled: true,
    })),
  });
}

export function getPostFooterLinksLayoutLabel(layout: PostFooterLinksLayout, isRu: boolean) {
  if (layout === 'one_column') {
    return isRu ? '1 колонка' : '1 column';
  }
  if (layout === 'inline') {
    return isRu ? 'В строку' : 'Inline';
  }
  return isRu ? '2 колонки' : '2 columns';
}
