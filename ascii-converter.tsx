"use client"

import type React from "react"

import { useState, useEffect, useRef, type ChangeEvent } from "react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { GripVertical, Upload, Download } from "lucide-react"

// Define a type for colored ASCII characters
type ColoredChar = {
  char: string
  color: string
}

const CANVAS_SIZE_OPTIONS = {
  auto: { name: "Original", width: 0, height: 0, mmWidth: 0, mmHeight: 0 }, // Changed from "Automatic" to "Original"
  a4: { name: "A4 (210x297mm)", width: 794, height: 1123, mmWidth: 210, mmHeight: 297 }, // Approx at 96 DPI
  a3: { name: "A3 (297x420mm)", width: 1123, height: 1587, mmWidth: 297, mmHeight: 420 }, // Approx at 96 DPI
  a2: { name: "A2 (420x594mm)", width: 1587, height: 2245, mmWidth: 420, mmHeight: 594 }, // Approx at 96 DPI
  a0: { name: "A0 (841x1189mm)", width: 3179, height: 4494, mmWidth: 841, mmHeight: 1189 }, // Approx at 96 DPI
};

const DPI_FOR_CALCULATION = 96;
const FONT_ASPECT_RATIO = 0.6; // Approx width/height for monospace characters

const PEN_SIZES = [
  { name: "0.5 cm", sizeCm: 0.5 },
  { name: "0.4 cm", sizeCm: 0.4 },
  { name: "0.3 cm", sizeCm: 0.3 },
  { name: "0.2 cm", sizeCm: 0.2 },
  { name: "0.1 cm", sizeCm: 0.1 },
];

const PEN1_CANVAS_COLOR = "blue"; // For 2-path canvas preview
const PEN2_CANVAS_COLOR = "red";   // For 2-path canvas preview

export default function AsciiConverter() {
  // Add this at the beginning of the component, right after the imports
  useEffect(() => {
    // Set document background to black
    if (typeof document !== "undefined") {
      document.documentElement.style.backgroundColor = "black"
      document.body.style.backgroundColor = "black"
    }

    return () => {
      // Clean up when component unmounts
      if (typeof document !== "undefined") {
        document.documentElement.style.backgroundColor = ""
        document.body.style.backgroundColor = ""
      }
    }
  }, [])
  const [resolution, setResolution] = useState(0.11)
  const [inverted, setInverted] = useState(false)
  const [grayscale, setGrayscale] = useState(false)
  const [charSet, setCharSet] = useState("standard")
  const [loading, setLoading] = useState(true)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [asciiArt, setAsciiArt] = useState<string>("")
  const [coloredAsciiArt, setColoredAsciiArt] = useState<ColoredChar[][]>([])
  const [leftPanelWidth, setLeftPanelWidth] = useState(25) // percentage
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [sidebarNarrow, setSidebarNarrow] = useState(false)
  const [selectedCanvasSize, setSelectedCanvasSize] = useState<keyof typeof CANVAS_SIZE_OPTIONS>("auto");
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [selectedPenSizeCm, setSelectedPenSizeCm] = useState(PEN_SIZES[2].sizeCm); // Default to 0.3cm
  const [plotterPreviewMode, setPlotterPreviewMode] = useState<'single' | 'dual' | 'path1' | 'path2'>('path1'); // Added 'path2' option
  const [dualPathThreshold, setDualPathThreshold] = useState(0.5); // Brightness threshold for path separation (0-1)
  const [path1AsciiArt, setPath1AsciiArt] = useState<ColoredChar[][]>([]);
  const [path2AsciiArt, setPath2AsciiArt] = useState<ColoredChar[][]>([]);
  const [customCharSet, setCustomCharSet] = useState(" .:-=+*#%@"); // Default custom character set
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  // Add a new ref for the output canvas
  const outputCanvasRef = useRef<HTMLCanvasElement>(null)

  const charSets = {
    standard: " .:-=+*#%@",
    detailed: " .,:;i1tfLCG08@",
    blocks: " ░▒▓█",
    minimal: " .:█",
    custom: "", // Will be populated from customCharSet state
  }

  // Set hydration state
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return

    // Check if we're on the client side
    setIsDesktop(window.innerWidth >= 768)

    // Add resize listener
    const handleResize = () => {
      const newIsDesktop = window.innerWidth >= 768
      setIsDesktop(newIsDesktop)

      // Reset panel width if switching between mobile and desktop
      if (newIsDesktop !== isDesktop) {
        setLeftPanelWidth(25) // Reset to default when switching layouts
      }
    }

    window.addEventListener("resize", handleResize)

    // Load default image
    loadDefaultImage()

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [isDesktop, isHydrated]) // Dependencies for initial setup and resize handling

  // Check if sidebar is narrow
  useEffect(() => {
    if (!isHydrated || !isDesktop) return

    // Check if sidebar is narrow (less than 200px)
    const checkSidebarWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth
        const sidebarWidth = (leftPanelWidth / 100) * containerWidth
        setSidebarNarrow(sidebarWidth < 350)
      }
    }

    checkSidebarWidth()

    // Add resize listener to check sidebar width
    window.addEventListener("resize", checkSidebarWidth)

    return () => {
      window.removeEventListener("resize", checkSidebarWidth)
    }
  }, [leftPanelWidth, isHydrated, isDesktop])

  useEffect(() => {
    if (imageLoaded && imageRef.current) {
      convertToAscii()
    }
  }, [resolution, inverted, grayscale, charSet, imageLoaded, selectedCanvasSize, selectedPenSizeCm, dualPathThreshold, customCharSet]) // Added customCharSet

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect()
        const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100

        // Limit the minimum width of each panel to 20%
        if (newLeftWidth >= 20 && newLeftWidth <= 80) {
          setLeftPanelWidth(newLeftWidth)
        }
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  useEffect(() => {
    const previewElement = previewRef.current;
    if (!previewElement) return;

    const handleWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey) { // ctrlKey is often true for pinch-zoom on touchpads
        event.preventDefault();
        const zoomSpeed = 0.05; // Adjust sensitivity as needed
        if (event.deltaY < 0) {
          // Zoom In
          setZoomLevel(prev => Math.min(3.0, prev + zoomSpeed));
        } else {
          // Zoom Out
          setZoomLevel(prev => Math.max(0.1, prev - zoomSpeed));
        }
      }
    };

    previewElement.addEventListener('wheel', handleWheelZoom, { passive: false });

    return () => {
      previewElement.removeEventListener('wheel', handleWheelZoom);
    };
  }, [isHydrated]); // Re-attach if previewRef might change or based on hydration

  const startDragging = () => {
    setIsDragging(true)
  }

  const loadDefaultImage = () => {
    setLoading(true)
    setError(null)
    setImageLoaded(false)

    // Create a new image element
    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      if (img.width === 0 || img.height === 0) {
        setError("Invalid image dimensions")
        setLoading(false)
        return
      }

      imageRef.current = img
      setImageLoaded(true)
      setLoading(false)
    }

    img.onerror = () => {
      setError("Failed to load image")
      setLoading(false)
    }

    // Set the source after setting up event handlers
    img.src =
      "/images/original-image.png"
  }

  const loadImage = (src: string) => {
    setLoading(true)
    setError(null)
    setImageLoaded(false)

    // Create a new image element
    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      if (img.width === 0 || img.height === 0) {
        setError("Invalid image dimensions")
        setLoading(false)
        return
      }

      imageRef.current = img
      setImageLoaded(true)
      setLoading(false)
    }

    img.onerror = () => {
      setError("Failed to load image")
      setLoading(false)
    }

    // Set the source after setting up event handlers
    img.src = src
  }

  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file")
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target?.result) {
        loadImage(e.target.result as string)
      }
    }
    reader.onerror = () => {
      setError("Failed to read file")
    }
    reader.readAsDataURL(file)
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingFile(true)
  }

  const handleDragLeave = () => {
    setIsDraggingFile(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingFile(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0])
    }
  }

  // Helper function to adjust color brightness
  const adjustColorBrightness = (r: number, g: number, b: number, factor: number): string => {
    // Ensure the colors are visible against black background
    const minBrightness = 40 // Minimum brightness to ensure visibility
    r = Math.max(Math.min(Math.round(r * factor), 255), minBrightness)
    g = Math.max(Math.min(Math.round(g * factor), 255), minBrightness)
    b = Math.max(Math.min(Math.round(b * factor), 255), minBrightness)
    return `rgb(${r}, ${g}, ${b})`
  }

  // Add this function after the adjustColorBrightness function
  const renderToCanvas = () => {
    if (!outputCanvasRef.current || (!asciiArt && coloredAsciiArt.length === 0)) return; // Check both types of art

    const canvas = outputCanvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Determine character grid dimensions and content source
    let sourceLines: (string | ColoredChar[])[];
    let isGrayscaleForRender: boolean;

    if (plotterPreviewMode === 'dual' && !grayscale && coloredAsciiArt.length > 0) {
        sourceLines = coloredAsciiArt; // We'll derive colors for preview from this
        isGrayscaleForRender = false; // Special handling for 2-path preview
    } else {
        sourceLines = grayscale ? asciiArt.split("\n") : coloredAsciiArt;
        isGrayscaleForRender = grayscale;
    }
    
    sourceLines = sourceLines.filter(line => (typeof line === 'string' ? line.length > 0 : (line as ColoredChar[]).length > 0));
    if (sourceLines.length === 0) return;
    
    const numRows = sourceLines.length;
    const numCols = typeof sourceLines[0] === 'string' ? (sourceLines[0] as string).length : (sourceLines[0] as ColoredChar[]).length;
    if (numCols === 0) return;

    // Set font properties and calculate dimensions
    let fontSize: number;
    let charWidthForFillText: number; // Renamed to avoid confusion with character cell width
    let lineHeight: number;

    if (selectedCanvasSize === "auto") {
      // For "Original" mode - set canvas to original image size and calculate font to fit
      if (imageRef.current) {
        canvas.width = imageRef.current.width;
        canvas.height = imageRef.current.height;
        
        // Calculate font size to fit the character grid within the original image size
        const cellWidthPx = canvas.width / numCols;
        const cellHeightPx = canvas.height / numRows;
        
        // Use the smaller dimension to ensure characters fit properly
        if ((cellWidthPx / FONT_ASPECT_RATIO) <= cellHeightPx) {
          fontSize = cellWidthPx / FONT_ASPECT_RATIO;
        } else {
          fontSize = cellHeightPx;
        }
        
        lineHeight = cellHeightPx;
        charWidthForFillText = cellWidthPx;
      } else {
        // Fallback if image ref is not available
        fontSize = 8;
        lineHeight = fontSize;
        charWidthForFillText = fontSize * FONT_ASPECT_RATIO;
        canvas.width = numCols * charWidthForFillText;
        canvas.height = numRows * lineHeight;
      }
    } else {
      const targetCanvasDimensions = CANVAS_SIZE_OPTIONS[selectedCanvasSize];
      canvas.width = targetCanvasDimensions.width;
      canvas.height = targetCanvasDimensions.height;

      const cellWidthPx = canvas.width / numCols;
      const cellHeightPx = canvas.height / numRows;

      // Determine font size to fit within the cell, respecting FONT_ASPECT_RATIO
      if ((cellWidthPx / FONT_ASPECT_RATIO) <= cellHeightPx) {
        // Width is the limiting factor for font size if aspect ratio is maintained
        fontSize = cellWidthPx / FONT_ASPECT_RATIO;
      } else {
        // Height is the limiting factor
        fontSize = cellHeightPx;
      }
      
      lineHeight = cellHeightPx; // Each line of text takes up the full cell height
      charWidthForFillText = cellWidthPx; // Each char takes up the full cell width for fillText
    }

    // Reset scroll for the preview container when canvas size changes to a fixed one
    if (selectedCanvasSize !== "auto" && previewRef.current) {
      previewRef.current.scrollTop = 0;
      previewRef.current.scrollLeft = 0;
    }

    // Re-apply font after canvas resize or font calculation
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = "top";

    // Render the ASCII art
    if (plotterPreviewMode === 'dual' && !grayscale && coloredAsciiArt.length > 0) {
        // Use the pre-generated path data for 2-Path Plotter Preview - show both paths
        if (path1AsciiArt.length > 0 && path2AsciiArt.length > 0) {
            // Render Path 1 (lighter areas) in blue
            path1AsciiArt.forEach((row, rowIndex) => {
                row.forEach((colItem, colIndex) => {
                    if (colItem.char && colItem.char !== ' ') {
                        ctx.fillStyle = PEN1_CANVAS_COLOR;
                        ctx.fillText(colItem.char, colIndex * charWidthForFillText, rowIndex * lineHeight);
                    }
                });
            });
            
            // Render Path 2 (darker areas) in red
            path2AsciiArt.forEach((row, rowIndex) => {
                row.forEach((colItem, colIndex) => {
                    if (colItem.char && colItem.char !== ' ') {
                        ctx.fillStyle = PEN2_CANVAS_COLOR;
                        ctx.fillText(colItem.char, colIndex * charWidthForFillText, rowIndex * lineHeight);
                    }
                });
            });
        }
    } else if (plotterPreviewMode === 'dual' && grayscale && path1AsciiArt.length > 0 && path2AsciiArt.length > 0) {
        // Grayscale dual path mode - show both paths
        // Render Path 1 in blue
        path1AsciiArt.forEach((row, rowIndex) => {
            row.forEach((colItem, colIndex) => {
                if (colItem.char && colItem.char !== ' ') {
                    ctx.fillStyle = PEN1_CANVAS_COLOR;
                    ctx.fillText(colItem.char, colIndex * charWidthForFillText, rowIndex * lineHeight);
                }
            });
        });
        
        // Render Path 2 in red
        path2AsciiArt.forEach((row, rowIndex) => {
            row.forEach((colItem, colIndex) => {
                if (colItem.char && colItem.char !== ' ') {
                    ctx.fillStyle = PEN2_CANVAS_COLOR;
                    ctx.fillText(colItem.char, colIndex * charWidthForFillText, rowIndex * lineHeight);
                }
            });
        });
    } else if (plotterPreviewMode === 'path1' && path1AsciiArt.length > 0 && path2AsciiArt.length > 0) {
        // Path 1 isolated - show only Path 1 in original colors
        path1AsciiArt.forEach((row, rowIndex) => {
            row.forEach((colItem, colIndex) => {
                if (colItem.char && colItem.char !== ' ') {
                    ctx.fillStyle = colItem.color === 'transparent' ? 'white' : colItem.color;
                    ctx.fillText(colItem.char, colIndex * charWidthForFillText, rowIndex * lineHeight);
                }
            });
        });
    } else if (plotterPreviewMode === 'path2' && path1AsciiArt.length > 0 && path2AsciiArt.length > 0) {
        // Path 2 isolated - show only Path 2 in original colors
        path2AsciiArt.forEach((row, rowIndex) => {
            row.forEach((colItem, colIndex) => {
                if (colItem.char && colItem.char !== ' ') {
                    ctx.fillStyle = colItem.color === 'transparent' ? 'white' : colItem.color;
                    ctx.fillText(colItem.char, colIndex * charWidthForFillText, rowIndex * lineHeight);
                }
            });
        });
    } else if (isGrayscaleForRender) {
      ctx.fillStyle = "white";
      (sourceLines as string[]).forEach((line, lineIndex) => {
        ctx.fillText(line, 0, lineIndex * lineHeight);
      });
    } else {
      (sourceLines as ColoredChar[][]).forEach((row, rowIndex) => {
        row.forEach((col, colIndex) => {
          ctx.fillStyle = col.color;
          ctx.fillText(col.char, colIndex * charWidthForFillText, rowIndex * lineHeight);
        });
      });
    }
  }

  // Add this effect to trigger canvas rendering when ASCII art changes
  useEffect(() => {
    if (imageLoaded && !loading && !error) {
      renderToCanvas()
    }
  }, [asciiArt, coloredAsciiArt, grayscale, loading, error, imageLoaded, plotterPreviewMode, selectedCanvasSize, zoomLevel]) // Added plotterPreviewMode, selectedCanvasSize, zoomLevel

  const convertToAscii = () => {
    try {
      if (!canvasRef.current || !imageRef.current) {
        throw new Error("Canvas or image not available")
      }

      const img = imageRef.current

      // Validate image dimensions
      if (img.width === 0 || img.height === 0) {
        throw new Error("Invalid image dimensions")
      }

      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        throw new Error("Could not get canvas context")
      }

      // Calculate dimensions based on resolution and selected canvas size
      let widthInChars: number;
      let heightInChars: number;
      const aspectRatio = img.width / img.height;

      if (selectedCanvasSize === "auto") {
        // For "Original" mode - use resolution to control character density while maintaining image size
        const targetPixelWidth = img.width;
        const targetPixelHeight = img.height;
        
        // Use resolution to determine character density (higher resolution = more characters)
        // Scale the resolution to work well with original image dimensions
        const scaleFactor = Math.min(targetPixelWidth, targetPixelHeight) / 500; // Normalize based on image size
        const adjustedResolution = resolution * scaleFactor;
        
        // Calculate character grid size based on adjusted resolution
        widthInChars = Math.floor(targetPixelWidth * adjustedResolution);
        heightInChars = Math.floor(targetPixelHeight * adjustedResolution / FONT_ASPECT_RATIO);
        
        // Ensure reasonable bounds
        widthInChars = Math.max(10, Math.min(widthInChars, targetPixelWidth / 2));
        heightInChars = Math.max(10, Math.min(heightInChars, targetPixelHeight / 2));
      } else {
        const targetCanvasProps = CANVAS_SIZE_OPTIONS[selectedCanvasSize];
        const targetPixelWidth = targetCanvasProps.width;
        const targetPixelHeight = targetCanvasProps.height;
        const imageAspectRatio = img.width / img.height; // Same as aspectRatio defined above

        const penCharActualWidthPx = (selectedPenSizeCm / 2.54) * DPI_FOR_CALCULATION;
        // Ensure penCharActualWidthPx is not zero to avoid division by zero
        if (penCharActualWidthPx === 0) {
            throw new Error("Pen size results in zero pixel width. Choose a larger pen size or check DPI settings.");
        }
        const penCharActualHeightPx = penCharActualWidthPx / FONT_ASPECT_RATIO;
        if (penCharActualHeightPx === 0) {
            throw new Error("Calculated character height is zero. Check FONT_ASPECT_RATIO and pen size.");
        }


        const maxPaperCharsW = targetPixelWidth / penCharActualWidthPx;
        const maxPaperCharsH = targetPixelHeight / penCharActualHeightPx;

        // Aspect ratio of the character grid we want to achieve
        // (matches image aspect when rendered with FONT_ASPECT_RATIO)
        const charGridTargetAspectRatio = imageAspectRatio / FONT_ASPECT_RATIO;
        if (charGridTargetAspectRatio === 0) {
            throw new Error("Character grid target aspect ratio is zero. Check image aspect ratio and FONT_ASPECT_RATIO.");
        }


        let tempHeight = Math.min(maxPaperCharsH, maxPaperCharsW / charGridTargetAspectRatio);
        heightInChars = Math.floor(Math.max(1, tempHeight));
        widthInChars = Math.floor(Math.max(1, heightInChars * charGridTargetAspectRatio));

        // If calculated widthInChars exceeds paper capacity due to flooring/rounding, adjust based on width
        if (widthInChars > maxPaperCharsW) {
            widthInChars = Math.floor(Math.max(1, maxPaperCharsW));
            heightInChars = Math.floor(Math.max(1, widthInChars / charGridTargetAspectRatio));
        }
        // And re-check height just in case
        if (heightInChars > maxPaperCharsH) {
             heightInChars = Math.floor(Math.max(1, maxPaperCharsH));
             // Avoid division by zero if charGridTargetAspectRatio is 0 (already checked)
             widthInChars = Math.floor(Math.max(1, heightInChars * charGridTargetAspectRatio));
        }
        // Ensure at least 1x1 grid
        widthInChars = Math.max(1, widthInChars);
        heightInChars = Math.max(1, heightInChars);
      }

      // Set canvas dimensions to match the image (for getImageData)
      canvas.width = img.width
      canvas.height = img.height

      // Clear the canvas first
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw image to canvas
      ctx.drawImage(img, 0, 0, img.width, img.height)

      // Get image data - this is where the error was occurring
      let imageData
      try {
        imageData = ctx.getImageData(0, 0, img.width, img.height)
      } catch (e) {
        throw new Error("Failed to get image data. This might be a CORS issue.")
      }

      const data = imageData.data

      // Choose character set
      const chars = charSet === 'custom' ? customCharSet : charSets[charSet as keyof typeof charSets]

      // Calculate aspect ratio correction for monospace font
      const widthStep = img.width / widthInChars;   // float
      const heightStep = img.height / heightInChars; // float


      let result = ""
      const coloredResult: ColoredChar[][] = []
      const path1Result: ColoredChar[][] = []
      const path2Result: ColoredChar[][] = []

      // Process the image
      for (let j = 0; j < heightInChars; j++) { // Iterate heightInChars times
        const y_img_start = Math.floor(j * heightStep);
        const coloredRow: ColoredChar[] = []
        const path1Row: ColoredChar[] = []
        const path2Row: ColoredChar[] = []

        for (let i = 0; i < widthInChars; i++) { // Iterate widthInChars times
          const x_img_start = Math.floor(i * widthStep);

          // Clamp coordinates to be within the image bounds
          const y_clamped = Math.min(y_img_start, img.height - 1);
          const x_clamped = Math.min(x_img_start, img.width - 1);
          const pos = (y_clamped * img.width + x_clamped) * 4 // Ensure this is integer multiplication

          const r = data[pos]
          const g = data[pos + 1]
          const b = data[pos + 2]

          // Calculate brightness based on grayscale setting
          let brightness
          if (grayscale) {
            // Standard grayscale calculation
            brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255
          } else {
            // Color-aware brightness (perceived luminance)
            brightness = Math.sqrt(
              0.299 * (r / 255) * (r / 255) + 0.587 * (g / 255) * (g / 255) + 0.114 * (b / 255) * (b / 255),
            )
          }

          // Invert if needed
          if (inverted) brightness = 1 - brightness

          // Map brightness to character
          const charIndex = Math.floor(brightness * (chars.length - 1))
          const char = chars[charIndex]

          result += char

          // For colored mode, store the character and its color
          if (!grayscale) {
            // Adjust color brightness based on the character density
            // Characters with more "ink" (later in the charset) should be brighter
            const brightnessFactor = (charIndex / (chars.length - 1)) * 1.5 + 0.5
            const color = adjustColorBrightness(r, g, b, brightnessFactor)
            coloredRow.push({ char, color })

            // Generate complementary paths based on brightness threshold
            // Normalize brightness to 0-1 range for threshold comparison
            const normalizedBrightness = brightness; // brightness is already 0-1

            if (normalizedBrightness > dualPathThreshold) {
              // Path 1 gets the character, Path 2 gets a space
              path1Row.push({ char, color })
              path2Row.push({ char: ' ', color: 'transparent' })
            } else {
              // Path 2 gets the character, Path 1 gets a space  
              path1Row.push({ char: ' ', color: 'transparent' })
              path2Row.push({ char, color })
            }
          } else {
            // For grayscale mode, we still need to populate the arrays
            coloredRow.push({ char, color: "white" })
            // For grayscale, we can still generate paths based on brightness
            const normalizedBrightness = brightness;
            if (normalizedBrightness > dualPathThreshold) {
              path1Row.push({ char, color: "white" })
              path2Row.push({ char: ' ', color: 'transparent' })
            } else {
              path1Row.push({ char: ' ', color: 'transparent' })
              path2Row.push({ char, color: "white" })
            }
          }
        }

        result += "\n"
        coloredResult.push(coloredRow)
        path1Result.push(path1Row)
        path2Result.push(path2Row)
      }

      setAsciiArt(result)
      setColoredAsciiArt(coloredResult)
      setPath1AsciiArt(path1Result)
      setPath2AsciiArt(path2Result)
      setError(null)
    } catch (err) {
      console.error("Error converting to ASCII:", err)
      setError(err instanceof Error ? err.message : "Unknown error occurred")
      setAsciiArt("")
      setColoredAsciiArt([])
      setPath1AsciiArt([])
      setPath2AsciiArt([])
    }
  }

  const downloadAsciiArt = () => {
    if (!asciiArt) {
      setError("No ASCII art to download")
      return
    }

    const element = document.createElement("a")
    const file = new Blob([asciiArt], { type: "text/plain" })
    element.href = URL.createObjectURL(file)
    element.download = "ascii-art.txt"
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const downloadJpeg = () => {
    if (!outputCanvasRef.current) {
      setError("No canvas available for JPEG export")
      return
    }

    try {
      // Create a temporary canvas with black background
      const tempCanvas = document.createElement('canvas')
      const tempCtx = tempCanvas.getContext('2d')
      if (!tempCtx) {
        throw new Error("Could not get canvas context")
      }

      // Set dimensions to match the output canvas
      tempCanvas.width = outputCanvasRef.current.width
      tempCanvas.height = outputCanvasRef.current.height

      // Fill with black background
      tempCtx.fillStyle = 'black'
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)

      // Draw the ASCII art on top
      tempCtx.drawImage(outputCanvasRef.current, 0, 0)

      // Convert to JPEG with high quality
      const jpegData = tempCanvas.toDataURL('image/jpeg', 1.0)
      
      // Create download link
      const element = document.createElement("a")
      element.href = jpegData
      element.download = "ascii-art.jpg"
      document.body.appendChild(element)
      element.click()
      document.body.removeChild(element)
    } catch (err) {
      console.error("Error exporting JPEG:", err)
      setError(err instanceof Error ? err.message : "Failed to export JPEG")
    }
  }

  const downloadSvg = () => {
    if ((!asciiArt && coloredAsciiArt.length === 0) || (grayscale && !asciiArt) || (!grayscale && coloredAsciiArt.length === 0)) {
      setError("No ASCII art to download as SVG.");
      return;
    }
    setError(null);

    const lines = grayscale ? asciiArt.split("\n").filter(line => line.length > 0) : coloredAsciiArt;
    if (lines.length === 0) {
        setError("No content to download as SVG after filtering empty lines.");
        return;
    }

    const numRows = lines.length;
    const numCols = grayscale ? (lines[0] as string).length : (lines[0] as ColoredChar[]).length;
    if (numRows === 0 || numCols === 0) {
        setError("SVG generation failed: Zero rows or columns.");
        return;
    }

    let svgWidthMm: number, svgHeightMm: number;
    let viewBoxWidth: number, viewBoxHeight: number;
    
    const escapeXml = (unsafe: string): string => {
        return unsafe.replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
    };

    if (selectedCanvasSize === "auto") {
        const nominalCharWidthVb = 10;
        const nominalCharHeightVb = nominalCharWidthVb / FONT_ASPECT_RATIO;
        viewBoxWidth = numCols * nominalCharWidthVb;
        viewBoxHeight = numRows * nominalCharHeightVb;
        svgWidthMm = viewBoxWidth; // Use pixel dimensions for width/height for auto SVG
        svgHeightMm = viewBoxHeight;
    } else {
        const canvasProps = CANVAS_SIZE_OPTIONS[selectedCanvasSize];
        svgWidthMm = canvasProps.mmWidth;
        svgHeightMm = canvasProps.mmHeight;
        viewBoxWidth = canvasProps.width;   // Use pixel dimensions from canvas options for viewBox
        viewBoxHeight = canvasProps.height;
    }

    const cellWidthVb = viewBoxWidth / numCols;
    const cellHeightVb = viewBoxHeight / numRows;
    let fontSizeVb;

    if ((cellWidthVb / FONT_ASPECT_RATIO) <= cellHeightVb) {
        fontSizeVb = cellWidthVb / FONT_ASPECT_RATIO;
    } else {
        fontSizeVb = cellHeightVb;
    }
    // Ensure font size is not too small or zero
    fontSizeVb = Math.max(1, fontSizeVb);

    const svgParts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidthMm}${selectedCanvasSize === 'auto' ? 'px' : 'mm'}" height="${svgHeightMm}${selectedCanvasSize === 'auto' ? 'px' : 'mm'}" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">`,
        `<rect width="${viewBoxWidth}" height="${viewBoxHeight}" fill="black"/>`,
    ];

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const char = grayscale ? (lines[r] as string)[c] : (lines[r] as ColoredChar[])[c].char;
            const color = grayscale ? "white" : (lines[r] as ColoredChar[])[c].color;
            
            if (char && char !== ' ') { // Avoid adding empty spaces to reduce SVG size
                const x = c * cellWidthVb;
                const y = r * cellHeightVb; 
                // Using dominant-baseline="text-before-edge" means y is the top of the text block.
                // For more precise centering of glyph within the cell, one might need to add an offset to y like y + fontSizeVb * 0.8 (approx baseline)
                // Or, for perfect cell top alignment: y
                svgParts.push(
                    `<text x="${x}" y="${y}" font-family="monospace" font-size="${fontSizeVb}" fill="${color}" dominant-baseline="text-before-edge">${escapeXml(char)}</text>`
                );
            }
        }
    }

    svgParts.push("</svg>");
    const svgString = svgParts.join("\n");

    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = "ascii-art.svg";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  }

  const downloadTwoColorPlotterSvg = () => {
    if (grayscale || coloredAsciiArt.length === 0) {
      setError("2-Color Plotter SVG requires colored ASCII art. Please disable grayscale mode.");
      return;
    }
    if (!imageLoaded) { // Added check for imageLoaded
      setError("Please load an image first.");
      return;
    }
    if (path1AsciiArt.length === 0 || path2AsciiArt.length === 0) {
      setError("Path data not available. Please ensure image is processed.");
      return;
    }
    setError(null);

    const numRows = path1AsciiArt.length;
    if (numRows === 0) {
        setError("SVG generation failed: Zero rows.");
        return;
    }
    const numCols = path1AsciiArt[0].length;
    if (numCols === 0) {
        setError("SVG generation failed: Zero columns.");
        return;
    }

    const PEN1_COLOR = "blue"; // Example: First pen color
    const PEN2_COLOR = "red";   // Example: Second pen color
    
    const escapeXml = (unsafe: string): string => {
        return unsafe.replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
    };

    let svgWidthMm: number, svgHeightMm: number;
    let viewBoxWidth: number, viewBoxHeight: number;

    if (selectedCanvasSize === "auto") {
        const nominalCharWidthVb = 10;
        const nominalCharHeightVb = nominalCharWidthVb / FONT_ASPECT_RATIO;
        viewBoxWidth = numCols * nominalCharWidthVb;
        viewBoxHeight = numRows * nominalCharHeightVb;
        svgWidthMm = viewBoxWidth;
        svgHeightMm = viewBoxHeight;
    } else {
        const canvasProps = CANVAS_SIZE_OPTIONS[selectedCanvasSize];
        svgWidthMm = canvasProps.mmWidth;
        svgHeightMm = canvasProps.mmHeight;
        viewBoxWidth = canvasProps.width;
        viewBoxHeight = canvasProps.height;
    }

    const cellWidthVb = viewBoxWidth / numCols;
    const cellHeightVb = viewBoxHeight / numRows;
    let fontSizeVb;

    if ((cellWidthVb / FONT_ASPECT_RATIO) <= cellHeightVb) {
        fontSizeVb = cellWidthVb / FONT_ASPECT_RATIO;
    } else {
        fontSizeVb = cellHeightVb;
    }
    fontSizeVb = Math.max(1, fontSizeVb);

    const pen1CharsTexts: string[] = [];
    const pen2CharsTexts: string[] = [];

    // Use path data directly instead of calculating brightness
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const x = c * cellWidthVb;
            const y = r * cellHeightVb;
            
            // Add Path 1 characters
            const path1Item = path1AsciiArt[r][c];
            if (path1Item.char && path1Item.char !== ' ') {
                const textElement = `<text x="${x}" y="${y}">${escapeXml(path1Item.char)}</text>`;
                pen1CharsTexts.push(textElement);
            }
            
            // Add Path 2 characters  
            const path2Item = path2AsciiArt[r][c];
            if (path2Item.char && path2Item.char !== ' ') {
                const textElement = `<text x="${x}" y="${y}">${escapeXml(path2Item.char)}</text>`;
                pen2CharsTexts.push(textElement);
            }
        }
    }

    const svgParts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidthMm}${selectedCanvasSize === 'auto' ? 'px' : 'mm'}" height="${svgHeightMm}${selectedCanvasSize === 'auto' ? 'px' : 'mm'}" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">`,
        // No background rect for plotter output
    ];

    if (pen1CharsTexts.length > 0) {
        svgParts.push(`<g fill="${PEN1_COLOR}" font-family="monospace" font-size="${fontSizeVb}" dominant-baseline="text-before-edge">`);
        pen1CharsTexts.forEach(text => svgParts.push(text));
        svgParts.push(`</g>`);
    }

    if (pen2CharsTexts.length > 0) {
        svgParts.push(`<g fill="${PEN2_COLOR}" font-family="monospace" font-size="${fontSizeVb}" dominant-baseline="text-before-edge">`);
        pen2CharsTexts.forEach(text => svgParts.push(text));
        svgParts.push(`</g>`);
    }

    svgParts.push("</svg>");
    const svgString = svgParts.join("\n");

    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = "plotter-art-2color.svg";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  }

  const downloadPath1Svg = () => {
    if (grayscale || path1AsciiArt.length === 0) {
      setError("Path 1 SVG requires colored ASCII art. Please disable grayscale mode.");
      return;
    }
    setError(null);

    const numRows = path1AsciiArt.length;
    if (numRows === 0) {
        setError("SVG generation failed: Zero rows.");
        return;
    }
    const numCols = path1AsciiArt[0].length;
    if (numCols === 0) {
        setError("SVG generation failed: Zero columns.");
        return;
    }
    
    const escapeXml = (unsafe: string): string => {
        return unsafe.replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
    };

    let svgWidthMm: number, svgHeightMm: number;
    let viewBoxWidth: number, viewBoxHeight: number;

    if (selectedCanvasSize === "auto") {
        const nominalCharWidthVb = 10;
        const nominalCharHeightVb = nominalCharWidthVb / FONT_ASPECT_RATIO;
        viewBoxWidth = numCols * nominalCharWidthVb;
        viewBoxHeight = numRows * nominalCharHeightVb;
        svgWidthMm = viewBoxWidth;
        svgHeightMm = viewBoxHeight;
    } else {
        const canvasProps = CANVAS_SIZE_OPTIONS[selectedCanvasSize];
        svgWidthMm = canvasProps.mmWidth;
        svgHeightMm = canvasProps.mmHeight;
        viewBoxWidth = canvasProps.width;
        viewBoxHeight = canvasProps.height;
    }

    const cellWidthVb = viewBoxWidth / numCols;
    const cellHeightVb = viewBoxHeight / numRows;
    let fontSizeVb;

    if ((cellWidthVb / FONT_ASPECT_RATIO) <= cellHeightVb) {
        fontSizeVb = cellWidthVb / FONT_ASPECT_RATIO;
    } else {
        fontSizeVb = cellHeightVb;
    }
    fontSizeVb = Math.max(1, fontSizeVb);

    const svgParts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidthMm}${selectedCanvasSize === 'auto' ? 'px' : 'mm'}" height="${svgHeightMm}${selectedCanvasSize === 'auto' ? 'px' : 'mm'}" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">`,
        `<rect width="${viewBoxWidth}" height="${viewBoxHeight}" fill="black"/>`,
    ];

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const item = path1AsciiArt[r][c];
            if (item.char && item.char !== ' ') {
                const x = c * cellWidthVb;
                const y = r * cellHeightVb;
                const color = item.color === 'transparent' ? 'white' : item.color;
                svgParts.push(
                    `<text x="${x}" y="${y}" font-family="monospace" font-size="${fontSizeVb}" fill="${color}" dominant-baseline="text-before-edge">${escapeXml(item.char)}</text>`
                );
            }
        }
    }

    svgParts.push("</svg>");
    const svgString = svgParts.join("\n");

    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = "path1-ascii-art.svg";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  };

  const downloadPath2Svg = () => {
    if (grayscale || path2AsciiArt.length === 0) {
      setError("Path 2 SVG requires colored ASCII art. Please disable grayscale mode.");
      return;
    }
    setError(null);

    const numRows = path2AsciiArt.length;
    if (numRows === 0) {
        setError("SVG generation failed: Zero rows.");
        return;
    }
    const numCols = path2AsciiArt[0].length;
    if (numCols === 0) {
        setError("SVG generation failed: Zero columns.");
        return;
    }
    
    const escapeXml = (unsafe: string): string => {
        return unsafe.replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
    };

    let svgWidthMm: number, svgHeightMm: number;
    let viewBoxWidth: number, viewBoxHeight: number;

    if (selectedCanvasSize === "auto") {
        const nominalCharWidthVb = 10;
        const nominalCharHeightVb = nominalCharWidthVb / FONT_ASPECT_RATIO;
        viewBoxWidth = numCols * nominalCharWidthVb;
        viewBoxHeight = numRows * nominalCharHeightVb;
        svgWidthMm = viewBoxWidth;
        svgHeightMm = viewBoxHeight;
    } else {
        const canvasProps = CANVAS_SIZE_OPTIONS[selectedCanvasSize];
        svgWidthMm = canvasProps.mmWidth;
        svgHeightMm = canvasProps.mmHeight;
        viewBoxWidth = canvasProps.width;
        viewBoxHeight = canvasProps.height;
    }

    const cellWidthVb = viewBoxWidth / numCols;
    const cellHeightVb = viewBoxHeight / numRows;
    let fontSizeVb;

    if ((cellWidthVb / FONT_ASPECT_RATIO) <= cellHeightVb) {
        fontSizeVb = cellWidthVb / FONT_ASPECT_RATIO;
    } else {
        fontSizeVb = cellHeightVb;
    }
    fontSizeVb = Math.max(1, fontSizeVb);

    const svgParts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidthMm}${selectedCanvasSize === 'auto' ? 'px' : 'mm'}" height="${svgHeightMm}${selectedCanvasSize === 'auto' ? 'px' : 'mm'}" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">`,
        `<rect width="${viewBoxWidth}" height="${viewBoxHeight}" fill="black"/>`,
    ];

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const item = path2AsciiArt[r][c];
            if (item.char && item.char !== ' ') {
                const x = c * cellWidthVb;
                const y = r * cellHeightVb;
                const color = item.color === 'transparent' ? 'white' : item.color;
                svgParts.push(
                    `<text x="${x}" y="${y}" font-family="monospace" font-size="${fontSizeVb}" fill="${color}" dominant-baseline="text-before-edge">${escapeXml(item.char)}</text>`
                );
            }
        }
    }

    svgParts.push("</svg>");
    const svgString = svgParts.join("\n");

    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = "path2-ascii-art.svg";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPlotSvg = () => {
    // This will call downloadSvg() or downloadTwoColorPlotterSvg() based on plotterPreviewMode
    if (plotterPreviewMode === 'single' || plotterPreviewMode === 'path1' || plotterPreviewMode === 'path2') {
      downloadSvg();
    } else if (plotterPreviewMode === 'dual') {
      if (grayscale || coloredAsciiArt.length === 0) {
        setError("2-Path Plot SVG requires colored ASCII art. Please disable grayscale mode.");
        return;
      }
      downloadTwoColorPlotterSvg();
    }
  };

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div
        ref={containerRef}
        className="flex flex-col md:flex-row h-screen w-full overflow-hidden select-none"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* ASCII Art Preview - Top on mobile, Right on desktop */}
        <div
          ref={previewRef}
          className={`order-1 md:order-2 flex-1 bg-black overflow-auto flex ${selectedCanvasSize === 'auto' ? 'items-center' : 'items-start'} justify-center ${
            isDraggingFile ? "bg-opacity-50" : ""
          } relative h-full`}
          style={{
            ...(isHydrated && isDesktop
              ? {
                  width: `${100 - leftPanelWidth}%`,
                  marginLeft: `${leftPanelWidth}%`,
                }
              : {}),
          }}
        >
          {isDraggingFile && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-10 select-none">
              <div className="text-white text-xl font-mono">Drop image here</div>
            </div>
          )}
          {loading ? (
            <div className="text-white font-mono select-none">Loading image...</div>
          ) : error ? (
            <div className="text-red-400 font-mono p-4 text-center select-none">
              {error}
              <div className="mt-2 text-white text-sm">Try uploading a different image or refreshing the page.</div>
            </div>
          ) : (
            <canvas
              ref={outputCanvasRef}
              className="max-w-full select-text"
              style={{
                fontSize: "0.4rem",
                lineHeight: "0.4rem",
                fontFamily: "monospace",
                transform: `scale(${zoomLevel})`,
                transformOrigin: "center center",
              }}
            />
          )}
        </div>

        {/* Resizable divider - Only visible on desktop after hydration */}
        {isHydrated && isDesktop && (
          <div
            className="order-3 w-2 bg-stone-800 hover:bg-stone-700 cursor-col-resize items-center justify-center z-10 transition-opacity duration-300"
            onMouseDown={startDragging}
            style={{
              position: "absolute",
              left: `${leftPanelWidth}%`,
              top: 0,
              bottom: 0,
              display: "flex",
            }}
          >
            <GripVertical className="h-6 w-6 text-stone-500" />
          </div>
        )}

        {/* Control Panel - Bottom on mobile, Left on desktop */}
        <div
          className={`order-2 md:order-1 w-full md:h-auto p-2 md:p-4 bg-stone-900 font-mono text-stone-300 transition-opacity duration-300 ${
            !isHydrated ? "opacity-0" : "opacity-100"
          }`}
          style={{
            width: "100%",
            height: "auto",
            flex: "0 0 auto",
            ...(isHydrated && isDesktop
              ? {
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${leftPanelWidth}%`,
                  overflowY: "auto",
                }
              : {}),
          }}
        >
          <div className="space-y-4 p-2 md:p-4 border border-stone-700 rounded-md">
            <div className="space-y-1">
              <h1 className="text-lg text-stone-100 font-bold">ASCII Art Converter</h1>
              {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            </div>

            <div className="space-y-4 pt-2">
              <div className="space-y-2 border-t border-stone-700 pt-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="resolution" className="text-stone-300">
                    Resolution: {selectedCanvasSize === 'auto' ? resolution.toFixed(2) : "(auto from pen size)"}
                  </Label>
                </div>
                <Slider
                  id="resolution"
                  min={0.05}
                  max={0.3}
                  step={0.01}
                  value={[resolution]}
                  onValueChange={(value) => setResolution(value[0])}
                  className="[&>span]:border-none [&_.bg-primary]:bg-stone-800 [&>.bg-background]:bg-stone-500/30"
                  disabled={selectedCanvasSize !== 'auto'}
                />
              </div>

              {selectedCanvasSize !== 'auto' && (
                <div className="space-y-2 border-t border-stone-700 pt-4">
                  <Label htmlFor="pen-size" className="text-stone-300">
                    Pen Size
                  </Label>
                  <Select value={selectedPenSizeCm.toString()} onValueChange={(value) => setSelectedPenSizeCm(parseFloat(value))}>
                    <SelectTrigger id="pen-size" className="bg-stone-800 border-stone-700 text-stone-300">
                      <SelectValue placeholder="Select pen size" />
                    </SelectTrigger>
                    <SelectContent className="bg-stone-800 border-stone-700 text-stone-300">
                      {PEN_SIZES.map((pen) => (
                        <SelectItem key={pen.sizeCm} value={pen.sizeCm.toString()} className="focus:bg-stone-700 focus:text-stone-100">
                          {pen.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2 border-t border-stone-700 pt-4">
                <Label htmlFor="charset" className="text-stone-300">
                  Character Set
                </Label>
                <Select value={charSet} onValueChange={setCharSet}>
                  <SelectTrigger id="charset" className="bg-stone-800 border-stone-700 text-stone-300">
                    <SelectValue placeholder="Select character set" />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700 text-stone-300">
                    <SelectItem value="standard" className="focus:bg-stone-700 focus:text-stone-100">
                      Standard
                    </SelectItem>
                    <SelectItem value="detailed" className="focus:bg-stone-700 focus:text-stone-100">
                      Detailed
                    </SelectItem>
                    <SelectItem value="blocks" className="focus:bg-stone-700 focus:text-stone-100">
                      Block Characters
                    </SelectItem>
                    <SelectItem value="minimal" className="focus:bg-stone-700 focus:text-stone-100">
                      Minimal
                    </SelectItem>
                    <SelectItem value="custom" className="focus:bg-stone-700 focus:text-stone-100">
                      Custom
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {charSet === 'custom' && (
                <div className="space-y-2 border-t border-stone-700 pt-4">
                  <Label htmlFor="custom-charset" className="text-stone-300">
                    Custom Characters (light to dark)
                  </Label>
                  <input
                    id="custom-charset"
                    type="text"
                    value={customCharSet}
                    onChange={(e) => setCustomCharSet(e.target.value)}
                    placeholder="e.g.,  .:-=+*#%@"
                    className="w-full px-3 py-2 bg-stone-800 border border-stone-700 text-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                  <div className="text-xs text-stone-400">
                    Enter characters from lightest to darkest. Minimum 2 characters required.
                  </div>
                </div>
              )}

              <div className="space-y-2 border-t border-stone-700 pt-4">
                <Label htmlFor="canvas-size" className="text-stone-300">
                  Canvas Size
                </Label>
                <Select value={selectedCanvasSize} onValueChange={(value) => setSelectedCanvasSize(value as keyof typeof CANVAS_SIZE_OPTIONS)}>
                  <SelectTrigger id="canvas-size" className="bg-stone-800 border-stone-700 text-stone-300">
                    <SelectValue placeholder="Select canvas size" />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700 text-stone-300">
                    {Object.entries(CANVAS_SIZE_OPTIONS).map(([key, option]) => (
                      <SelectItem key={key} value={key} className="focus:bg-stone-700 focus:text-stone-100">
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2 border-t border-stone-700 pt-4">
                <Switch
                  id="invert"
                  checked={inverted}
                  onCheckedChange={setInverted}
                  className="data-[state=checked]:bg-stone-600"
                />
                <Label htmlFor="invert" className="text-stone-300">
                  Invert Colors
                </Label>
              </div>

              <div className="flex items-center space-x-2 border-t border-stone-700 pt-4">
                <Switch
                  id="grayscale"
                  checked={grayscale}
                  onCheckedChange={setGrayscale}
                  className="data-[state=checked]:bg-stone-600"
                />
                <Label htmlFor="grayscale" className="text-stone-300">
                  Grayscale Mode
                </Label>
              </div>

              <div className="hidden">
                <canvas ref={canvasRef} width="300" height="300"></canvas>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>

              <div className="flex gap-2 pt-4 border-t border-stone-700">
                <Button
                  onClick={() => {
                    if (!asciiArt) {
                      setError("No ASCII art to copy")
                      return
                    }
                    const el = document.createElement("textarea")
                    el.value = asciiArt
                    document.body.appendChild(el)
                    el.select()
                    document.execCommand("copy")
                    document.body.removeChild(el)
                    alert("ASCII art copied to clipboard!")
                  }}
                  className="flex-1 bg-stone-700 hover:bg-stone-600 text-stone-200 border-stone-600"
                  disabled={loading || !imageLoaded}
                >
                  {sidebarNarrow ? "Copy" : "Copy ASCII Art"}
                </Button>

                <Button
                  onClick={downloadAsciiArt}
                  className="bg-stone-700 hover:bg-stone-600 text-stone-200 border-stone-600"
                  title="Download ASCII Art (.txt)"
                  disabled={loading || !imageLoaded || !asciiArt}
                >
                  <Download className="h-4 w-4 mr-1 md:mr-2" /> {sidebarNarrow ? "TXT" : "TXT"}
                </Button>

                <Button
                  onClick={downloadJpeg}
                  className="bg-stone-700 hover:bg-stone-600 text-stone-200 border-stone-600"
                  title="Download as JPEG"
                  disabled={loading || !imageLoaded || !outputCanvasRef.current}
                >
                  <Download className="h-4 w-4 mr-1 md:mr-2" /> {sidebarNarrow ? "JPG" : "JPG"}
                </Button>

                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-stone-700 hover:bg-stone-600 text-stone-200 border-stone-600"
                  title="Upload Image"
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </div>

              {/* New Plotter Preview and Download Section */}
              <div className="space-y-2 border-t border-stone-700 pt-4">
                <Label className="text-stone-300">Plotter Output Preview & Download</Label>
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    onClick={() => setPlotterPreviewMode('single')}
                    variant={plotterPreviewMode === 'single' ? 'default': 'outline'}
                    className={`text-xs ${plotterPreviewMode === 'single' ? 'bg-sky-700 hover:bg-sky-600 text-white ring-2 ring-sky-400' : 'bg-stone-700 hover:bg-stone-600 text-stone-200 border-stone-600'}`}
                  >
                    Original
                  </Button>
                  <Button
                    onClick={() => setPlotterPreviewMode('dual')}
                    variant={plotterPreviewMode === 'dual' ? 'default': 'outline'}
                    className={`text-xs ${plotterPreviewMode === 'dual' ? 'bg-purple-700 hover:bg-purple-600 text-white ring-2 ring-purple-400' : 'bg-stone-700 hover:bg-stone-600 text-stone-200 border-stone-600'}`}
                    disabled={grayscale || coloredAsciiArt.length === 0}
                  >
                    Both Paths
                  </Button>
                  <Button
                    onClick={() => setPlotterPreviewMode('path1')}
                    variant={plotterPreviewMode === 'path1' ? 'default': 'outline'}
                    className={`text-xs ${plotterPreviewMode === 'path1' ? 'bg-blue-700 hover:bg-blue-600 text-white ring-2 ring-blue-400' : 'bg-stone-700 hover:bg-stone-600 text-stone-200 border-stone-600'}`}
                    disabled={grayscale || coloredAsciiArt.length === 0}
                  >
                    Path 1 Only
                  </Button>
                  <Button
                    onClick={() => setPlotterPreviewMode('path2')}
                    variant={plotterPreviewMode === 'path2' ? 'default': 'outline'}
                    className={`text-xs ${plotterPreviewMode === 'path2' ? 'bg-red-700 hover:bg-red-600 text-white ring-2 ring-red-400' : 'bg-stone-700 hover:bg-stone-600 text-stone-200 border-stone-600'}`}
                    disabled={grayscale || coloredAsciiArt.length === 0}
                  >
                    Path 2 Only
                  </Button>
                </div>
                
                {/* Mode descriptions */}
                <div className="text-xs text-stone-400 mt-2">
                  {plotterPreviewMode === 'single' && "Original colors as single output"}
                  {plotterPreviewMode === 'dual' && (
                    <span>
                      <span className="text-blue-400">■</span> Path 1 + <span className="text-red-400">■</span> Path 2 (both visible)
                    </span>
                  )}
                  {plotterPreviewMode === 'path1' && (
                    <span>
                      <span className="text-blue-400">■</span> Path 1 isolated (Path 2 hidden)
                    </span>
                  )}
                  {plotterPreviewMode === 'path2' && (
                    <span>
                      <span className="text-red-400">■</span> Path 2 isolated (Path 1 hidden)
                    </span>
                  )}
                </div>
                
                {(plotterPreviewMode === 'dual' || plotterPreviewMode === 'path1' || plotterPreviewMode === 'path2') && (
                  <div className="space-y-2 mt-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="dual-path-threshold" className="text-stone-300 text-sm">
                        Path Separation: {(dualPathThreshold * 100).toFixed(0)}%
                      </Label>
                    </div>
                    <Slider
                      id="dual-path-threshold"
                      min={0.1}
                      max={0.9}
                      step={0.05}
                      value={[dualPathThreshold]}
                      onValueChange={(value) => setDualPathThreshold(value[0])}
                      className="[&>span]:border-none [&_.bg-primary]:bg-stone-800 [&>.bg-background]:bg-stone-500/30"
                    />
                    <div className="text-xs text-stone-400">
                      <span className="text-blue-400">■</span> Pen 1: Lighter areas (&gt;{(dualPathThreshold * 100).toFixed(0)}%) 
                      <span className="ml-3 text-red-400">■</span> Pen 2: Darker areas (≤{(dualPathThreshold * 100).toFixed(0)}%)
                    </div>
                  </div>
                )}
                
                
                
                <div className="grid grid-cols-1 gap-2 mt-2">
                  <Button
                    onClick={handleDownloadPlotSvg}
                    className="w-full bg-green-600 hover:bg-green-500 text-white border-green-700"
                    title="Download Plotter SVG based on selected preview mode"
                    disabled={
                      loading || !imageLoaded ||
                      (plotterPreviewMode === 'dual' && (grayscale || coloredAsciiArt.length === 0)) ||
                      ((plotterPreviewMode === 'single' || plotterPreviewMode === 'path1' || plotterPreviewMode === 'path2') && (!asciiArt && coloredAsciiArt.length === 0))
                    }
                  >
                    <Download className="h-4 w-4 mr-2" /> Download Current View
                  </Button>
                  
                  {!grayscale && coloredAsciiArt.length > 0 && (
                    <div className="grid grid-cols-2 gap-1">
                      <Button
                        onClick={downloadPath1Svg}
                        className="bg-blue-600 hover:bg-blue-500 text-white border-blue-700 text-xs"
                        title="Download Path 1 only as SVG"
                        disabled={loading || !imageLoaded || path1AsciiArt.length === 0}
                      >
                        <Download className="h-3 w-3 mr-1" /> Path 1 SVG
                      </Button>
                      <Button
                        onClick={downloadPath2Svg}
                        className="bg-red-600 hover:bg-red-500 text-white border-red-700 text-xs"
                        title="Download Path 2 only as SVG"
                        disabled={loading || !imageLoaded || path2AsciiArt.length === 0}
                      >
                        <Download className="h-3 w-3 mr-1" /> Path 2 SVG
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-stone-700">
                <Button
                  onClick={() => setZoomLevel(prev => Math.max(0.1, prev - 0.1))}
                  className="flex-1 bg-stone-700 hover:bg-stone-600 text-stone-200 border-stone-600"
                  title="Zoom Out"
                >
                  Zoom Out
                </Button>
                <Button
                  onClick={() => setZoomLevel(1.0)}
                  className="flex-1 bg-stone-700 hover:bg-stone-600 text-stone-200 border-stone-600"
                  title="Reset Zoom"
                >
                  Reset Zoom
                </Button>
                <Button
                  onClick={() => setZoomLevel(prev => Math.min(3.0, prev + 0.1))}
                  className="flex-1 bg-stone-700 hover:bg-stone-600 text-stone-200 border-stone-600"
                  title="Zoom In"
                >
                  Zoom In
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
