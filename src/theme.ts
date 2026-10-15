export const colors = {
  bg: '#0F1115',
  surface: '#181B22',
  surfaceAlt: '#20242D',
  border: '#2A2F3A',
  text: '#F2F4F8',
  textDim: '#9AA3B2',
  textFaint: '#5F6878',
  accent: '#C6F432', // chalk-lime
  accentText: '#0F1115',
  danger: '#FF5D5D',
  success: '#4ADE80',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16 };

export const font = {
  h1: { fontSize: 28, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, color: colors.text },
  dim: { fontSize: 14, color: colors.textDim },
  small: { fontSize: 12, color: colors.textFaint },
  num: { fontVariant: ['tabular-nums' as const] },
};
