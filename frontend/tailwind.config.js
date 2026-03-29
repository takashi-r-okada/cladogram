/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mincho: ['"Yu Mincho"', '"YuMincho"', '"Hiragino Mincho ProN"', '"Noto Serif JP"', '"Times New Roman"', 'serif'],
      },
      colors: {
        paper: '#f7f4ee',
      },
    },
  },
  plugins: [],
}
