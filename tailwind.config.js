/** @type {import('tailwindcss').Config} */

/*
 * FreelanceTax — premium dark (iOS/macOS inspired) design tokens.
 *
 * The palette is intentionally remapped rather than renamed. Throughout the app
 * the `ink` scale is used SEMANTICALLY, not literally:
 *
 *   ink-900  primary text        ink-200  hairline borders
 *   ink-700  strong secondary    ink-100  chips / hover surfaces
 *   ink-500  secondary text      ink-50   subtlest surface
 *   ink-400  tertiary text
 *
 * Inverting the scale in one place therefore flips the whole product to dark
 * coherently, without touching page markup. The same trick is applied to the
 * tinted semantic colors (emerald/amber/red/violet): their `50/100/200` steps
 * become dark tinted surfaces and their `600–900` steps become the bright
 * foreground tones that read correctly on black.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Extra-small breakpoint for compact phones (iPhone SE is 375px, and
      // 320px still exists). Lets dense numeric grids stack safely.
      screens: {
        xs: '400px',
      },

      colors: {
        // Elevated surfaces. `surface` replaces the old `bg-white` cards.
        surface: {
          DEFAULT: '#0C0C0E', // resting card
          2: '#121215', // raised (popovers, sticky bars)
          3: '#191920', // highest (modals, active rows)
        },

        // Restrained indigo accent, brightened so it holds up on pure black.
        brand: {
          50: '#12142B',
          100: '#191C3D',
          200: '#262A5E',
          300: '#39408C',
          400: '#4E56BE',
          500: '#5D66E8',
          600: '#666EF5',
          700: '#7076FF', // primary accent (buttons + accent text)
          800: '#8E93FF', // hover
          900: '#ADB1FF', // pressed / high-emphasis text
          950: '#D2D4FF',
        },

        // Inverted neutral ramp (see note above).
        ink: {
          900: '#F5F5F7', // primary text (Apple near-white)
          700: '#D4D4DA', // strong secondary
          600: '#B0B0B8', // secondary emphasis
          500: '#94949E', // secondary text
          400: '#75757E', // tertiary text
          300: '#3A3A40', // disabled / dividers on raised surfaces
          200: '#232327', // hairline border
          100: '#151518', // chips, hover fills
          50: '#0E0E10', // subtlest surface tint
        },

        // Tinted semantics: dark backgrounds, bright foregrounds.
        emerald: {
          50: '#0A1F17',
          100: '#0E2A1F',
          200: '#1B4535',
          600: '#34D399',
          700: '#4ADE9F',
          800: '#86EFC4',
          900: '#BBF7DC',
        },
        amber: {
          50: '#231803',
          100: '#2E2006',
          200: '#4A360D',
          500: '#F5A524',
          700: '#FBBF4A',
          800: '#FCD07A',
          900: '#FDE3AE',
        },
        red: {
          50: '#240F12',
          100: '#301418',
          200: '#4E2027',
          500: '#F87171',
          600: '#E5484D',
          700: '#FF6369',
          800: '#FF8A8E',
          900: '#FFC2C4',
        },
        violet: {
          50: '#1A1030',
          100: '#22163E',
          200: '#3A2765',
          800: '#C4B5FD',
        },
      },

      fontFamily: {
        // Apple system stack first so macOS/iOS render in SF, with Inter as the
        // cross-platform fallback.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Inter',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },

      // Depth comes from light borders + soft ambient shadow, not heavy drops.
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.6), 0 0 0 0.5px rgb(255 255 255 / 0.04)',
        raised: '0 8px 24px -12px rgb(0 0 0 / 0.9), 0 0 0 0.5px rgb(255 255 255 / 0.06)',
        pop: '0 24px 60px -16px rgb(0 0 0 / 0.85), 0 0 0 0.5px rgb(255 255 255 / 0.08)',
        glow: '0 0 0 4px rgb(112 118 255 / 0.18)',
      },

      // Large, Apple-like radii.
      borderRadius: {
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
        '4xl': '1.75rem',
      },

      backdropBlur: {
        xs: '2px',
      },

      transitionTimingFunction: {
        // iOS-ish ease — quick out, gentle settle.
        ios: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out both',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.32, 0.72, 0, 1) both',
        'sheet-up': 'sheet-up 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
        'toast-in': 'toast-in 0.22s cubic-bezier(0.32, 0.72, 0, 1) both',
      },
    },
  },
  plugins: [],
};
