/** @type {import('tailwindcss').Config} */
//
// La identidad sale del logo, no al revés: el teal #1c4f61 y el verde menta
// #5ab893 son los dos colores del SVG de CUIDA, y todo lo demás —la barra
// lateral, el fondo, las pastillas, los tintes de las casillas— son escalas
// construidas a partir de esos dos. Así la aplicación y la marca son la misma
// cosa aunque cambie la maquetación.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Teal CUIDA. El 700 es el color exacto del logo.
        brand: {
          50: "#eff5f7",
          100: "#d8e7eb",
          200: "#b3ccd5",
          300: "#85acba",
          400: "#57889c",
          500: "#346a80",
          600: "#245e72",
          700: "#1c4f61",
          800: "#163e4c",
          900: "#102d38",
          950: "#0a1f27",
          DEFAULT: "#1c4f61",
        },
        // Verde menta CUIDA. El DEFAULT es el color exacto del logo.
        "brand-green": {
          50: "#eefaf4",
          100: "#d2f2e4",
          200: "#a9e6cd",
          300: "#7ed6b1",
          400: "#5ab893",
          500: "#44a37c",
          600: "#469877",
          700: "#357a5f",
          800: "#2c6650",
          900: "#245342",
          DEFAULT: "#5ab893",
        },
        // El lienzo sobre el que se apoyan las tarjetas: un gris con una gota
        // del verde de la marca, no el gris neutro de fábrica.
        lienzo: "#f3f7f6",
      },
      borderRadius: {
        // Las tarjetas de CUIDA son redondas de verdad: 16 px.
        tarjeta: "1rem",
      },
      boxShadow: {
        // Sombra de tarjeta: se nota que hay relieve, no que hay un marco.
        tarjeta: "0 1px 2px rgba(16, 45, 56, 0.04), 0 8px 24px -12px rgba(16, 45, 56, 0.18)",
        elevada: "0 2px 4px rgba(16, 45, 56, 0.06), 0 16px 40px -16px rgba(16, 45, 56, 0.28)",
      },
      fontFamily: {
        sans: ['"Inter var"', "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
