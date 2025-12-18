/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../libs/client/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        grotesk: ['"Space Grotesk"', 'sans-serif'],
        rowdies: ['"Rowdies"', 'cursive'],
        roboto: ['"Roboto"', 'sans-serif'],
      },
      colors: {
        'mh-yellow': '#FBFF69',
        'mh-dark': {
          100: '#2E3135',
          200: '#25282B',
          300: '#181B1D',
          400: '#121416',
        },
        'mh-gray': '#7E7F83',
      },
      boxShadow: {
        'inset-white': 'inset 0px 0px 7.9px 0px #FFFFFF24',
        'card': '23.58px 27.16px 56.39px 0px rgba(0, 0, 0, 0.08)',
      },
      backdropBlur: {
        'card': '67.18px',
      },
    },
  },
  plugins: [],
};
