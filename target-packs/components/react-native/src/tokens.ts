/* Generated from tokens/tokens.json by tools/build-tokens.js. Do not edit; change the tokens and run the script. */
export const lightTokens = {
  "color": {
    "primary": "#0b5fa5",
    "primaryHover": "#094f8a",
    "primaryActive": "#073f6e",
    "primaryText": "#0a5594",
    "primarySoft": "#e8f1fa",
    "onPrimary": "#ffffff",
    "bg": "#f6f8fa",
    "surface": "#ffffff",
    "surface2": "#f4f6f8",
    "surface3": "#e9edf1",
    "border": "#dbe1e7",
    "borderStrong": "#aab4bf",
    "text": "#1f2933",
    "textBody": "#34404c",
    "textMuted": "#5f6b7a",
    "success": "#12805c",
    "successText": "#0d6b4c",
    "successSoft": "#e7f6ef",
    "warning": "#d97706",
    "warningText": "#92400e",
    "warningSoft": "#fff6e5",
    "danger": "#c62828",
    "dangerText": "#b42318",
    "dangerSoft": "#fdecec",
    "info": "#0277bd",
    "infoText": "#01579b",
    "infoSoft": "#e6f4fb",
    "overlay": "rgba(15, 23, 42, 0.45)"
  },
  "font": {
    "family": "Inter, 'Segoe UI', system-ui, sans-serif",
    "familyMono": "'Cascadia Mono', Consolas, monospace",
    "sizeXs": 12,
    "sizeS": 13,
    "sizeM": 14,
    "sizeL": 16,
    "sizeXl": 20,
    "sizeXxl": 26,
    "weightRegular": 400,
    "weightMedium": 500,
    "weightBold": 700
  },
  "space": {
    "xxs": 2,
    "xs": 4,
    "s": 8,
    "m": 12,
    "l": 16,
    "xl": 24,
    "xxl": 32
  },
  "radius": {
    "s": 4,
    "m": 8,
    "l": 12,
    "pill": 999
  },
  "control": {
    "heightS": 32,
    "heightM": 40,
    "heightL": 48,
    "focusRing": 3
  },
  "shadow": {
    "s": "0 1px 2px rgba(15, 23, 42, 0.08)",
    "m": "0 4px 12px rgba(15, 23, 42, 0.12)",
    "l": "0 12px 32px rgba(15, 23, 42, 0.18)"
  },
  "motion": {
    "durationFast": 120,
    "durationBase": 200,
    "durationSlow": 320,
    "easeStandard": "cubic-bezier(0.2, 0, 0, 1)",
    "easeExit": "cubic-bezier(0.4, 0, 1, 1)"
  },
  "breakpoint": {
    "phone": 0,
    "tablet": 768,
    "laptop": 1024,
    "desktop": 1440
  }
} as const;

export const darkColors = {
  "primary": "#3b8fd6",
  "primaryHover": "#5aa3e0",
  "primaryActive": "#2c7cc0",
  "primaryText": "#8cc3f2",
  "primarySoft": "rgba(59, 143, 214, 0.18)",
  "onPrimary": "#0b1724",
  "bg": "#0d1520",
  "surface": "#141e2b",
  "surface2": "#1a2635",
  "surface3": "#223143",
  "border": "#2a3a4e",
  "borderStrong": "#5c6f86",
  "text": "#e8edf2",
  "textBody": "#c9d2dc",
  "textMuted": "#9aa8b7",
  "success": "#34c08f",
  "successText": "#5fd6a9",
  "successSoft": "rgba(52, 192, 143, 0.15)",
  "warning": "#f5a524",
  "warningText": "#f8c060",
  "warningSoft": "rgba(245, 165, 36, 0.15)",
  "danger": "#ef5350",
  "dangerText": "#f48a88",
  "dangerSoft": "rgba(239, 83, 80, 0.15)",
  "info": "#29a3e0",
  "infoText": "#7cc8ef",
  "infoSoft": "rgba(41, 163, 224, 0.15)",
  "overlay": "rgba(0, 0, 0, 0.6)"
} as const;

export type Tokens = typeof lightTokens;
