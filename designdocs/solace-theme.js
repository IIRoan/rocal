// Solace Theme — React/CSS-in-JS
// Compatible with: Chakra UI, Stitches, Vanilla Extract, or any CSS-in-JS

export const theme = {
  colors: {
    primary: '#ef5a3c',
    secondary: '#19c77f',
    'accent-pink': '#ef95c2',
    'accent-blue': '#4ab7ee',
    'accent-purple': '#87afff',
    'accent-gold': '#dfab0e',
    'accent-yellow': '#ffcb30',
    'accent-teal': '#2797cf',
    'accent-green': '#00a05e',

    neutral: {
      DEFAULT: '#000000',
      50: '#242424',
      100: '#303030',
      200: '#505050',
      300: '#707070',
      400: '#8f8f8f',
      500: '#afafaf',
      600: '#cfcfcf',
      700: '#dfdfdf',
      800: '#ebebeb',
      900: '#f5f5f5',
      950: '#ffffff',
    },

    surface: {
      DEFAULT: '#ffffff',
      alt: '#ffffff',
      subtle: '#efefef',
      dark: '#000000',
      card: '#ffffff',
      cardDark: '#303030',
      elevated: '#292929',
    },

    tint: {
      primary: '#ffebe7',
      primaryMuted: '#ffc3b7',
      primaryHover: '#ff8e78',
      secondary: '#bfffe5',
      blue: '#dff4ff',
      blueText: '#b7e7ff',
      pink: '#ffd7eb',
      red: '#ffd7d7',
    },

    background: '#dedede',
    foreground: '#000000',
  },

  fonts: {
    display: "'__solaceSansDisplay', sans-serif",
    body: "'__solaceSansText', sans-serif",
    mono: "'__solaceMono', monospace",
    pixel: "'__solacePixel', sans-serif",
    serif: "'Times New Roman', serif",
  },

  fontSizes: {
    hero: '80px',
    display: '76px',
    h1: '64px',
    h2: '48px',
    h3: '36px',
    h4: '20px',
    h4Alt: '19px',
    subtitle: '28px',
    medium: '17px',
    body: '14px',
    bodyLg: '15px',
    small: '13px',
    caption: '11px',
  },

  fontWeights: {
    light: 380,
    normal: 400,
    medium: 470,
    semibold: 520,
    bold: 700,
  },

  lineHeights: {
    hero: '120px',
    display: '54px',
    h1: '60.8px',
    h2: '52.8px',
    h3: '43.2px',
    h4: '27px',
    h4Alt: '24.7px',
    subtitle: '33.6px',
    medium: '22.95px',
    body: '18.2px',
    bodyLg: '22.5px',
    small: '19.5px',
    caption: '12px',
  },

  letterSpacings: {
    display: '-0.76px',
    h1: '-0.64px',
    h2: '-0.48px',
    h4: '-0.2px',
    medium: '-0.17px',
    body: '-0.07px',
    bodyLg: '-0.15px',
    caption: '0.11px',
  },

  space: {
    0: '1px',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    7: '28px',
    8: '32px',
    9: '36px',
    10: '40px',
    11: '44px',
    12: '48px',
    16: '64px',
    20: '80px',
    24: '96px',
    26: '104px',
    32: '128px',
    35: '140px',
    36: '144px',
    40: '160px',
    54: '215px',
  },

  radii: {
    xs: '2px',
    sm: '4px',
    md: '6px',
    lg: '10px',
    xl: '14px',
    '2xl': '16px',
    full: '9999px',
  },

  shadows: {
    xs: 'rgba(0,0,0,0.05) 0px 1px 2px 0px',
    sm: 'rgba(0,0,0,0.1) 0px 1px 3px 0px, rgba(0,0,0,0.1) 0px 1px 2px -1px',
    md: 'rgba(0,0,0,0.1) 0px 4px 6px -1px, rgba(0,0,0,0.1) 0px 2px 4px -2px',
    lg: 'rgba(0,0,0,0.1) 0px 10px 15px -3px, rgba(0,0,0,0.1) 0px 4px 6px -4px',
    xl: 'rgba(0,0,0,0.1) 0px 20px 25px -5px, rgba(0,0,0,0.1) 0px 8px 10px -6px',
    card: 'rgba(0,0,0,0.1) 0px 1px 0px 0px inset, rgba(0,0,0,0.1) 0px -1px 0px 1px inset',
    cardDark: 'hsla(0,0%,100%,0.08) 0px 1px 0px 0px inset, hsla(0,0%,100%,0.08) 0px -1px 0px 1px inset',
  },

  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },

  transitions: {
    fast: '0.15s cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '0.2s cubic-bezier(0, 0, 0.2, 1)',
  },
};

export default theme;
