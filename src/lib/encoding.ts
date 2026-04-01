const CP1251_EXTRA_MAP: Record<string, number> = {
  '\u0401': 0xa8,
  '\u0451': 0xb8,
  '\u0402': 0x80,
  '\u0403': 0x81,
  '\u201a': 0x82,
  '\u0453': 0x83,
  '\u201e': 0x84,
  '\u2026': 0x85,
  '\u2020': 0x86,
  '\u2021': 0x87,
  '\u20ac': 0x88,
  '\u2030': 0x89,
  '\u0409': 0x8a,
  '\u2039': 0x8b,
  '\u040a': 0x8c,
  '\u040c': 0x8d,
  '\u040b': 0x8e,
  '\u040f': 0x8f,
  '\u0452': 0x90,
  '\u2018': 0x91,
  '\u2019': 0x92,
  '\u201c': 0x93,
  '\u201d': 0x94,
  '\u2022': 0x95,
  '\u2013': 0x96,
  '\u2014': 0x97,
  '\u2122': 0x99,
  '\u0459': 0x9a,
  '\u203a': 0x9b,
  '\u045a': 0x9c,
  '\u045c': 0x9d,
  '\u045b': 0x9e,
  '\u045f': 0x9f,
  '\u00a0': 0xa0,
  '\u040e': 0xa1,
  '\u045e': 0xa2,
  '\u0408': 0xa3,
  '\u00a4': 0xa4,
  '\u0490': 0xa5,
  '\u00a6': 0xa6,
  '\u00a7': 0xa7,
  '\u00a9': 0xa9,
  '\u0404': 0xaa,
  '\u00ab': 0xab,
  '\u00ac': 0xac,
  '\u00ad': 0xad,
  '\u00ae': 0xae,
  '\u0407': 0xaf,
  '\u00b0': 0xb0,
  '\u00b1': 0xb1,
  '\u0406': 0xb2,
  '\u0456': 0xb3,
  '\u0491': 0xb4,
  '\u00b5': 0xb5,
  '\u00b6': 0xb6,
  '\u00b7': 0xb7,
  '\u2116': 0xb9,
  '\u0454': 0xba,
  '\u00bb': 0xbb,
  '\u0458': 0xbc,
  '\u0405': 0xbd,
  '\u0455': 0xbe,
  '\u0457': 0xbf
};

const BROKEN_SEQUENCE_REGEX = /(?:Р.|С.|Ð.|Ñ.|â.|Ã.|Â.|�){2,}/;
const decoder = new TextDecoder('utf-8', { fatal: false });

function looksLikeBrokenEncoding(value: string) {
  return BROKEN_SEQUENCE_REGEX.test(value);
}

function scoreCandidate(value: string) {
  const suspiciousCount =
    value.match(/(?:Р.|С.|Ð.|Ñ.|â.|Ã.|Â.|�)/g)?.length ||
    0;
  const replacementCount = value.match(/�/g)?.length || 0;
  const cyrillicCount = value.match(/[А-Яа-яЁё]/g)?.length || 0;
  const latinCount = value.match(/[A-Za-z]/g)?.length || 0;

  return cyrillicCount + latinCount * 0.35 - suspiciousCount * 3 - replacementCount * 6;
}

function decodeUtf8Bytes(bytes: number[]) {
  if (bytes.length === 0) {
    return '';
  }

  return decoder.decode(Uint8Array.from(bytes));
}

function encodeLatin1Bytes(value: string) {
  const bytes: number[] = [];

  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code > 0xff) {
      return null;
    }

    bytes.push(code);
  }

  return bytes;
}

function encodeWindows1251Bytes(value: string) {
  const bytes: number[] = [];

  for (const char of value) {
    const code = char.charCodeAt(0);

    if (code <= 0x7f) {
      bytes.push(code);
      continue;
    }

    if (code >= 0x0410 && code <= 0x044f) {
      bytes.push(code - 0x350);
      continue;
    }

    const mapped = CP1251_EXTRA_MAP[char];
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }

    return null;
  }

  return bytes;
}

function repairStringValue(value: string) {
  let current = value;

  for (let index = 0; index < 2; index += 1) {
    if (!looksLikeBrokenEncoding(current)) {
      return current;
    }

    const candidates = [
      encodeLatin1Bytes(current),
      encodeWindows1251Bytes(current)
    ]
      .filter((candidate): candidate is number[] => Array.isArray(candidate))
      .map((candidate) => decodeUtf8Bytes(candidate))
      .filter(Boolean);

    const nextValue = candidates.reduce(
      (best, candidate) => (scoreCandidate(candidate) > scoreCandidate(best) ? candidate : best),
      current
    );

    if (nextValue === current) {
      break;
    }

    current = nextValue;
  }

  return current;
}

export function normalizeBrokenEncoding<T>(value: T): T {
  if (typeof value === 'string') {
    return repairStringValue(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeBrokenEncoding(item)) as T;
  }

  if (value && typeof value === 'object') {
    const nextEntries = Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      normalizeBrokenEncoding(nestedValue)
    ]);

    return Object.fromEntries(nextEntries) as T;
  }

  return value;
}
