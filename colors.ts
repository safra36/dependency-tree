// path: colors.ts

// Simple terminal colors utility
export const colors = {
  reset: "\x1b[0m",

  // Text styles
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
  italic: (text: string) => `\x1b[3m${text}\x1b[0m`,
  underline: (text: string) => `\x1b[4m${text}\x1b[0m`,

  // Colors
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  white: (text: string) => `\x1b[37m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,

  // Background colors
  bgRed: (text: string) => `\x1b[41m${text}\x1b[0m`,
  bgGreen: (text: string) => `\x1b[42m${text}\x1b[0m`,
  bgYellow: (text: string) => `\x1b[43m${text}\x1b[0m`,
  bgBlue: (text: string) => `\x1b[44m${text}\x1b[0m`,
  bgMagenta: (text: string) => `\x1b[45m${text}\x1b[0m`,
  bgCyan: (text: string) => `\x1b[46m${text}\x1b[0m`,

  // Utility functions
  success: (text: string) => `\x1b[32m✅ ${text}\x1b[0m`,
  error: (text: string) => `\x1b[31m❌ ${text}\x1b[0m`,
  warning: (text: string) => `\x1b[33m⚠️  ${text}\x1b[0m`,
  info: (text: string) => `\x1b[34mℹ️  ${text}\x1b[0m`,

  // Check if colors are supported
  isSupported: () => {
    return process.stdout.isTTY && process.env.TERM !== "dumb";
  },

  // Disable colors if not supported
  strip: (text: string) => {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
  },
};

export default colors;
