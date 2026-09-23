/** @type {import('tailwindcss').Config} */
//
// Los colores están tomados de la maqueta, píxel a píxel, no aproximados a
// ojo: el teal de la barra lateral (#0a2f3b), el verde de lo elegido y de los
// botones de crear (#1b8b7a), el teal oscuro del botón principal (#0c5a5e),
// el verde brillante de las cifras del menú (#5bceaa) y el lienzo sobre el
// que se apoyan las tarjetas (#f3fafc).
//
// Cada escala se construye alrededor de ese valor exacto, que queda siempre
// en el peldaño que se usa de verdad: así se puede aclarar u oscurecer sin
// perder el color de la maqueta.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Teal. El 700 es el botón principal; el 900, la barra lateral.
        brand: {
          50: "#eef6f7",
          100: "#d5e8ea",
          200: "#aacfd3",
          300: "#76b0b6",
          400: "#40888f",
          500: "#1a6c72",
          600: "#0f6166",
          700: "#0c5a5e",
          800: "#0a4550",
          900: "#0a2f3b",
          950: "#072630",
          DEFAULT: "#0c5a5e",
        },
        // Verde. El 500 es lo elegido en el menú y el botón de crear; el 300,
        // la cifra que va al lado de cada entrada.
        "brand-green": {
          50: "#e4f8f1",
          100: "#d3f2e8",
          200: "#a7e5d0",
          300: "#5bceaa",
          400: "#2fa78f",
          500: "#1b8b7a",
          600: "#177a6b",
          700: "#13655a",
          800: "#105349",
          900: "#0d423b",
          DEFAULT: "#1b8b7a",
        },
        // El lienzo: un gris con una gota de azul verdoso, no el gris neutro
        // de fábrica, que al lado de este teal se ve sucio.
        lienzo: "#f3fafc",
      },
      borderRadius: {
        // Las tarjetas de la maqueta son redondas de verdad: 16 px.
        tarjeta: "1rem",
      },
      boxShadow: {
        // Sombra de tarjeta: se nota que hay relieve, no que hay un marco.
        tarjeta: "0 1px 2px rgba(10, 47, 59, 0.04), 0 8px 24px -12px rgba(10, 47, 59, 0.16)",
        elevada: "0 2px 4px rgba(10, 47, 59, 0.06), 0 16px 40px -16px rgba(10, 47, 59, 0.26)",
      },
      fontFamily: {
        sans: ['"Inter var"', "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
