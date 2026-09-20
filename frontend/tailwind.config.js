/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Identidad CUIDA: teal principal + verde menta de acento.
        brand: {
          50: "#eaf1f2",
          100: "#d3e3e5",
          600: "#245e72",
          700: "#1c4f61",
          800: "#163e4c",
          900: "#102d38",
          DEFAULT: "#1c4f61",
        },
        "brand-green": {
          50: "#eafaf3",
          100: "#cdf0e1",
          200: "#a9e6cd",
          600: "#469877",
          700: "#357a5f",
          800: "#2c6650",
          DEFAULT: "#5ab893",
        },
      },
    },
  },
  plugins: [],
};
