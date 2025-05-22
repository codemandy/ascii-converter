# ASCII Art Converter

A modern web application that converts images to ASCII art with plotter support. Built with Next.js, React, and TypeScript.

## Features

- Convert images to ASCII art with customizable character sets
- Support for both grayscale and colored output
- Adjustable resolution and canvas sizes
- Plotter-specific features:
  - Dual-path output for two-color plotting
  - Customizable pen sizes
  - Support for standard paper sizes (A0-A4)
  - SVG export for plotter compatibility
- Interactive preview with zoom controls
- Drag-and-drop image upload
- Multiple export options:
  - Copy to clipboard
  - Download as TXT
  - Download as JPEG
  - Download as SVG (single or dual-path for plotters)

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or pnpm

### Installation

1. Clone the repository:
```bash
git clone git@github.com:codemandy/ascii-converter.git
cd ascii-converter
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
```

3. Run the development server:
```bash
npm run dev
# or
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Upload an image by dragging and dropping or using the upload button
2. Adjust settings:
   - Resolution (for auto mode)
   - Character set
   - Canvas size
   - Pen size (for plotter mode)
   - Color inversion
   - Grayscale mode
3. Preview the result in real-time
4. Export in your preferred format:
   - Copy to clipboard
   - Download as TXT
   - Download as JPEG
   - Download as SVG (single or dual-path for plotters)

## License

MIT 
