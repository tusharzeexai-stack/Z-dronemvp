import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "on-primary-fixed-variant": "#004c69",
        "surface-container-high": "#e4e9ee",
        "secondary-fixed": "#e2e2e2",
        "error": "#ba1a1a",
        "on-secondary-fixed-variant": "#454747",
        "primary-fixed-dim": "#7bd0ff",
        "tertiary-container": "#f1a02b",
        "inverse-primary": "#7bd0ff",
        "on-tertiary-fixed": "#2a1700",
        "surface": "#f5faff",
        "on-secondary-container": "#616363",
        "on-primary": "#ffffff",
        "surface-dim": "#d6dbdf",
        "error-container": "#ffdad6",
        "on-secondary": "#ffffff",
        "surface-bright": "#f5faff",
        "primary-container": "#38bdf8",
        "outline": "#6e7980",
        "tertiary-fixed": "#ffddb8",
        "secondary-fixed-dim": "#c6c6c7",
        "on-surface": "#171c20",
        "secondary-container": "#dfe0e0",
        "primary": "#00668a",
        "background": "#f5faff",
        "on-primary-container": "#004965",
        "on-tertiary-container": "#613b00",
        "primary-fixed": "#c4e7ff",
        "on-primary-fixed": "#001e2c",
        "surface-tint": "#00668a",
        "on-surface-variant": "#3e484f",
        "secondary": "#5d5f5f",
        "outline-variant": "#bdc8d1",
        "on-tertiary-fixed-variant": "#653e00",
        "surface-container-highest": "#dee3e8",
        "on-tertiary": "#ffffff",
        "on-background": "#171c20",
        "on-error-container": "#93000a",
        "on-secondary-fixed": "#1a1c1c",
        "surface-variant": "#dee3e8",
        "tertiary": "#855300",
        "tertiary-fixed-dim": "#ffb960",
        "surface-container-low": "#eff4f9",
        "inverse-surface": "#2c3135",
        "inverse-on-surface": "#edf1f6",
        "on-error": "#ffffff",
        "surface-container-lowest": "#ffffff",
        "surface-container": "#eaeef3"
      },
      spacing: {
        "sidebar-width": "260px",
        "xs": "4px",
        "base": "4px",
        "md": "16px",
        "sm": "8px",
        "xl": "32px",
        "lg": "24px",
        "3xl": "64px",
        "gutter": "24px",
        "2xl": "48px",
        "container-max": "1440px"
      },
      fontSize: {
        "label-sm": ["12px", { "lineHeight": "1", "fontWeight": "500" }],
        "display-lg": ["48px", { "lineHeight": "1.2", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "body-lg": ["18px", { "lineHeight": "1.5", "fontWeight": "400" }],
        "body-sm": ["14px", { "lineHeight": "1.5", "fontWeight": "400" }],
        "headline-md": ["24px", { "lineHeight": "1.3", "fontWeight": "600" }],
        "headline-lg": ["32px", { "lineHeight": "1.25", "letterSpacing": "-0.01em", "fontWeight": "600" }],
        "label-md": ["12px", { "lineHeight": "1", "fontWeight": "500" }],
        "body-md": ["16px", { "lineHeight": "1.5", "fontWeight": "400" }],
        "headline-lg-mobile": ["24px", { "lineHeight": "1.3", "fontWeight": "600" }]
      }
    }
  },
  plugins: [
    forms,
    containerQueries
  ],
}
