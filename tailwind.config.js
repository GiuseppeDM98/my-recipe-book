/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        lg: '1440px',  // Override default 1024px — separa tablet da desktop
      },
      minHeight: {
        'dvh': '100dvh',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      // Every color carries `<alpha-value>`: Tailwind 3 cannot parse an `oklch(var(--x))`
      // string, and for a color it cannot parse it emits NO utility at all for an opacity
      // modifier (`bg-primary/10`, `ring-primary/40`, `hover:bg-primary/90`…) — no warning,
      // the class is just missing, and e.g. `ring-1 ring-primary/40` falls back to the
      // default BLUE ring. With the placeholder Tailwind substitutes the alpha itself.
      // The CSS variables keep holding OKLCH components only (see the `.dark` block in
      // globals.css), which is exactly the shape this syntax needs.
      colors: {
        border: 'oklch(var(--border) / <alpha-value>)',
        input: 'oklch(var(--input) / <alpha-value>)',
        ring: 'oklch(var(--ring) / <alpha-value>)',
        background: 'oklch(var(--background) / <alpha-value>)',
        foreground: 'oklch(var(--foreground) / <alpha-value>)',
        primary: {
          50:  'oklch(97% 0.02 42 / <alpha-value>)',
          100: 'oklch(93% 0.03 42 / <alpha-value>)',
          200: 'oklch(87% 0.05 42 / <alpha-value>)',
          300: 'oklch(78% 0.07 42 / <alpha-value>)',
          400: 'oklch(67% 0.10 42 / <alpha-value>)',
          500: 'oklch(59% 0.12 42 / <alpha-value>)',
          600: 'oklch(52% 0.13 42 / <alpha-value>)',  /* terracotta principale */
          700: 'oklch(43% 0.12 42 / <alpha-value>)',
          800: 'oklch(35% 0.10 42 / <alpha-value>)',
          900: 'oklch(26% 0.07 42 / <alpha-value>)',
          DEFAULT: 'oklch(var(--primary) / <alpha-value>)',
          foreground: 'oklch(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'oklch(var(--secondary) / <alpha-value>)',
          foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'oklch(var(--destructive) / <alpha-value>)',
          foreground: 'oklch(var(--destructive-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'oklch(var(--muted) / <alpha-value>)',
          foreground: 'oklch(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'oklch(var(--accent) / <alpha-value>)',
          foreground: 'oklch(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'oklch(var(--popover) / <alpha-value>)',
          foreground: 'oklch(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'oklch(var(--card) / <alpha-value>)',
          foreground: 'oklch(var(--card-foreground) / <alpha-value>)',
        },
      },
      // Color of a border with no color class (`border`, `border-t`, `divide-y`…) and of
      // Tailwind's preflight. Without this it is Tailwind's gray-200: a cold gray the
      // palette forbids (DESIGN.md, Anti-Cold Rule), nearly invisible as a mistake on cream
      // but a glaring near-white line in dark mode, where it does not follow the theme.
      borderColor: {
        DEFAULT: 'oklch(var(--border) / <alpha-value>)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.pb-safe': {
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
      });
    },
  ],
}

module.exports = config
