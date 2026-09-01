/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        gds: ['"Chakra Petch"', 'sans-serif'],
        mono: ['"Roboto Mono"', 'monospace']
      },
      colors: {
        gds: {
          navy: '#061224',
          header: '#08152e',
          drawer: '#020b18',
          cyan: '#38bdf8',
          blue: '#1d4ed8',
          border: 'rgba(56, 189, 248, 0.2)'
        }
      }
    },
  },
  plugins: [],
}
