import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config = {
  darkMode: ["class"],
  content: [
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
      fontFamily: {
        quicksand: ['var(--font-quicksand)', 'Quicksand', 'sans-serif'],
        nunito: ['var(--font-nunito)', 'Nunito', 'sans-serif'],
      },
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))',
          600: 'hsl(var(--primary-600))',
          700: 'hsl(var(--primary-700))',
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
        accentYellow: {
          DEFAULT: 'hsl(var(--accent-yellow))',
          foreground: 'hsl(var(--foreground))'
        },
        accentPurple: {
          DEFAULT: 'hsl(var(--accent-purple))',
          foreground: 'hsl(var(--foreground))'
        },
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
  		},
      boxShadow: {
        'ghibli-sm': '0 2px 8px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
        'ghibli': '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.12)',
        'ghibli-lg': '0 8px 20px rgba(0, 0, 0, 0.1), 0 3px 6px rgba(0, 0, 0, 0.15)',
        'ghibli-inner': 'inset 0 2px 4px rgba(0, 0, 0, 0.06)',
        'ghibli-focus': '0 0 0 2px rgba(102, 191, 191, 0.25)',
      },
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'shimmer': {
  				'0%': {
  					transform: 'translateX(-100%)'
  				},
  				'100%': {
  					transform: 'translateX(100%)'
  				}
  			},
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'float-in': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'grid': {
          '0%': { transform: 'translateZ(0px)' },
          '50%': { transform: 'translateZ(80px)' },
          '100%': { transform: 'translateZ(0px)' }
        },
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'shimmer': 'shimmer 2s infinite linear',
        'float': 'float 4s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 3s ease-in-out infinite',
        'fade-in': 'fade-in 0.5s ease-out forwards',
        'scale-in': 'scale-in 0.3s ease-out forwards',
        'float-in': 'float-in 0.4s ease-out forwards',
        'grid': 'grid 15s cubic-bezier(0.075, 0.82, 0.165, 1) infinite',
  		},
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-diagonal': 'linear-gradient(to bottom right, var(--tw-gradient-stops))',
        'gradient-tl-br': 'linear-gradient(to bottom right, var(--tw-gradient-stops))',
        'gradient-bl-tr': 'linear-gradient(to top right, var(--tw-gradient-stops))',
        'texture-dots': 'url("/textures/dots.png")',
        'texture-paper': 'url("/textures/paper.png")',
      },
      transitionProperty: {
        'height': 'height',
        'spacing': 'margin, padding',
        'width': 'width',
        'backdrop': 'backdrop-filter',
      },
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
        '400': '400ms',
      },
  	}
  },
  plugins: [
    require("tailwindcss-animate"),
    plugin(function({ addUtilities }) {
      addUtilities({
        '.border-border': {
          borderColor: 'hsl(var(--border))'
        },
        '.bg-background': {
          backgroundColor: 'hsl(var(--background))'
        },
        '.text-foreground': {
          color: 'hsl(var(--foreground))'
        },
        '.ghibli-card': {
          borderRadius: 'var(--radius)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.12)',
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          transition: 'transform 0.3s ease, box-shadow 0.3s ease',
        },
        '.ghibli-card:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.1), 0 3px 6px rgba(0, 0, 0, 0.15)',
        },
        '.text-shadow-sm': {
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
        },
        '.text-gradient': {
          background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-700)))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        },
        '.backdrop-blur-xs': {
          backdropFilter: 'blur(2px)',
        },
        '.backdrop-blur-sm': {
          backdropFilter: 'blur(4px)',
        },
        '.backdrop-blur': {
          backdropFilter: 'blur(8px)',
        },
        '.backdrop-blur-md': {
          backdropFilter: 'blur(12px)',
        },
        '.backdrop-blur-lg': {
          backdropFilter: 'blur(16px)',
        },
        '.hide-scrollbar': {
          scrollbarWidth: 'none',
          '-ms-overflow-style': 'none',
        },
        '.hide-scrollbar::-webkit-scrollbar': {
          display: 'none',
        },
      })
    })
  ],
} satisfies Config;

export default config;
