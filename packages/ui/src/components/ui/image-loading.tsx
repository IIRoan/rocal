"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import { cn } from "../../lib/utils";

interface GridCell {
  id: string;
  x: number;
  y: number;
  blinkDelay: number;
  fadeDelay: number;
  initialOpacity: number;
  color: string | null;
}

export interface GridDotLoaderProps {
  width?: number;
  height?: number;
  gridSize?: number;
  cellShape?: "circle" | "square";
  cellGap?: number;
  cellColor?: string;
  blinkSpeed?: number;
  label?: string;
  className?: string;
  /** Size to the parent container via ResizeObserver. */
  fill?: boolean;
}

function deriveGridMetrics(width: number, height: number) {
  const area = width * height;
  const gridSize =
    area > 140_000 ? 8 : area > 80_000 ? 7 : area > 40_000 ? 6 : 5;
  const cellGap = Math.max(4, Math.round(gridSize * 0.85));
  return { gridSize, cellGap };
}

function buildGridCells(input: {
  width: number;
  height: number;
  gridSize: number;
  cellGap: number;
  blinkSpeed: number;
  fadeOutDuration?: number;
}): GridCell[] {
  const cellWithGap = input.gridSize + input.cellGap;
  const cols = Math.ceil(input.width / cellWithGap) + 1;
  const rows = Math.ceil(input.height / cellWithGap) + 1;
  const cells: GridCell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        id: `${row}-${col}`,
        x: col * cellWithGap,
        y: row * cellWithGap,
        blinkDelay: Math.random() * input.blinkSpeed,
        fadeDelay: Math.random() * (input.fadeOutDuration ?? 600),
        initialOpacity: Math.random() * 0.5 + 0.25,
        color: null,
      });
    }
  }

  return cells;
}

interface DecodeGridCell {
  id: string;
  x: number;
  y: number;
  row: number;
  col: number;
  ambientDelay: number;
  ambientSeed: number;
  waveDelay: number;
}

function buildDecodeGridCells(input: {
  width: number;
  height: number;
  gridSize: number;
  cellGap: number;
  ambientBlinkMs: number;
  waveMs: number;
}): { cells: DecodeGridCell[]; cols: number; rows: number } {
  const cellWithGap = input.gridSize + input.cellGap;
  const cols = Math.ceil(input.width / cellWithGap) + 1;
  const rows = Math.ceil(input.height / cellWithGap) + 1;
  const cells: DecodeGridCell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const progress = (col / Math.max(cols - 1, 1)) * 0.72 + (row / Math.max(rows - 1, 1)) * 0.28;
      cells.push({
        id: `${row}-${col}`,
        x: col * cellWithGap,
        y: row * cellWithGap,
        row,
        col,
        ambientDelay: Math.random() * input.ambientBlinkMs,
        ambientSeed: Math.random() * 0.45 + 0.3,
        waveDelay: progress * input.waveMs,
      });
    }
  }

  return { cells, cols, rows };
}

function useGridDimensions(
  fill: boolean,
  width: number,
  height: number,
): {
  containerRef: RefObject<HTMLDivElement | null>;
  resolvedWidth: number;
  resolvedHeight: number;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fillDimensions, setFillDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!fill) return;

    const element = containerRef.current;
    if (!element) return;

    const updateDimensions = () => {
      const rect = element.getBoundingClientRect();
      setFillDimensions({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      });
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fill]);

  return {
    containerRef,
    resolvedWidth: fill ? fillDimensions.width : width,
    resolvedHeight: fill ? fillDimensions.height : height,
  };
}

function buildCompactStripCells(input: {
  columns: number;
  rows: number;
  gridSize: number;
  cellGap: number;
  ambientBlinkMs: number;
  waveMs: number;
}): DecodeGridCell[] {
  const cellWithGap = input.gridSize + input.cellGap;
  const cells: DecodeGridCell[] = [];

  for (let row = 0; row < input.rows; row++) {
    for (let col = 0; col < input.columns; col++) {
      cells.push({
        id: `${row}-${col}`,
        x: col * cellWithGap,
        y: row * cellWithGap,
        row,
        col,
        ambientDelay: Math.random() * input.ambientBlinkMs,
        ambientSeed: Math.random() * 0.35 + 0.35,
        waveDelay: (col / Math.max(input.columns, 1)) * input.waveMs,
      });
    }
  }

  return cells;
}

function compactStripDimensions(
  columns: number,
  rows: number,
  gridSize: number,
  cellGap: number,
) {
  const cellWithGap = gridSize + cellGap;
  return {
    width: columns * cellWithGap - cellGap,
    height: rows * cellWithGap - cellGap,
  };
}

function buildCompactRingCells(input: {
  size: number;
  dotCount: number;
  gridSize: number;
  ambientBlinkMs: number;
  waveMs: number;
}): DecodeGridCell[] {
  const center = input.size / 2;
  const radius = Math.max(0, center - input.gridSize / 2 - 1);
  const cells: DecodeGridCell[] = [];

  for (let index = 0; index < input.dotCount; index++) {
    const angle = (index / input.dotCount) * Math.PI * 2 - Math.PI / 2;
    const x = center + radius * Math.cos(angle) - input.gridSize / 2;
    const y = center + radius * Math.sin(angle) - input.gridSize / 2;
    cells.push({
      id: `ring-${index}`,
      x,
      y,
      row: 0,
      col: index,
      ambientDelay: Math.random() * input.ambientBlinkMs,
      ambientSeed: Math.random() * 0.35 + 0.35,
      waveDelay: (index / input.dotCount) * input.waveMs,
    });
  }

  return cells;
}

export interface GridDotDecodeLoaderProps {
  width?: number;
  height?: number;
  gridSize?: number;
  cellGap?: number;
  ambientColor?: string;
  waveColor?: string;
  ambientBlinkMs?: number;
  waveMs?: number;
  className?: string;
  fill?: boolean;
  /** Small fixed indicator — minimal decrypt / loading. */
  compact?: boolean;
  compactShape?: "strip" | "ring";
  columns?: number;
  rows?: number;
  dotCount?: number;
  ringSize?: number;
}

export function GridDotDecodeLoader({
  width = 320,
  height = 200,
  gridSize: gridSizeProp,
  cellGap: cellGapProp,
  ambientColor = "color-mix(in oklch, var(--muted-foreground) 28%, transparent)",
  waveColor = "color-mix(in oklch, var(--foreground) 42%, transparent)",
  ambientBlinkMs = 900,
  waveMs = 2600,
  className,
  fill = false,
  compact = false,
  compactShape = "ring",
  columns = 11,
  rows = 2,
  dotCount = 12,
  ringSize = 52,
}: GridDotDecodeLoaderProps) {
  const compactGridSize = gridSizeProp ?? 4;
  const compactCellGap = cellGapProp ?? 4;
  const isRing = compact && compactShape === "ring";
  const stripDims = useMemo(
    () => compactStripDimensions(columns, rows, compactGridSize, compactCellGap),
    [columns, rows, compactGridSize, compactCellGap],
  );

  const { containerRef, resolvedWidth, resolvedHeight } = useGridDimensions(
    fill && !compact,
    width,
    height,
  );
  const derivedMetrics = useMemo(
    () => deriveGridMetrics(resolvedWidth, resolvedHeight),
    [resolvedWidth, resolvedHeight],
  );
  const gridSize = compact
    ? compactGridSize
    : (gridSizeProp ?? derivedMetrics.gridSize);
  const cellGap = compact
    ? compactCellGap
    : (cellGapProp ?? derivedMetrics.cellGap);
  const waveDotSize = Math.max(2, gridSize - 1);
  const panelWidth = compact
    ? isRing
      ? ringSize
      : stripDims.width
    : resolvedWidth;
  const panelHeight = compact
    ? isRing
      ? ringSize
      : stripDims.height
    : resolvedHeight;
  const resolvedWaveMs = compact ? 1600 : waveMs;
  const resolvedAmbientMs = compact ? 750 : ambientBlinkMs;

  const decodeCells = useMemo(
    () =>
      panelWidth > 0 && panelHeight > 0
        ? compact
          ? isRing
            ? buildCompactRingCells({
                size: ringSize,
                dotCount,
                gridSize,
                ambientBlinkMs: resolvedAmbientMs,
                waveMs: resolvedWaveMs,
              })
            : buildCompactStripCells({
                columns,
                rows,
                gridSize,
                cellGap,
                ambientBlinkMs: resolvedAmbientMs,
                waveMs: resolvedWaveMs,
              })
          : buildDecodeGridCells({
              width: panelWidth,
              height: panelHeight,
              gridSize,
              cellGap,
              ambientBlinkMs: resolvedAmbientMs,
              waveMs: resolvedWaveMs,
            }).cells
        : [],
    [
      compact,
      isRing,
      columns,
      rows,
      dotCount,
      ringSize,
      panelWidth,
      panelHeight,
      gridSize,
      cellGap,
      resolvedAmbientMs,
      resolvedWaveMs,
    ],
  );

  const grid =
    decodeCells.length > 0 ? (
      <div
        className="relative shrink-0 overflow-hidden"
        style={{ width: panelWidth, height: panelHeight }}
        aria-hidden
      >
        {decodeCells.map((cell) => (
          <div
            key={cell.id}
            className="absolute"
            style={{ left: cell.x, top: cell.y, width: gridSize, height: gridSize }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                backgroundColor: ambientColor,
                opacity: cell.ambientSeed,
                animation: `grid-dot-blink ${resolvedAmbientMs}ms ease-in-out infinite`,
                animationDelay: `${cell.ambientDelay}ms`,
              }}
            />
            <div
              className="absolute rounded-[1px]"
              style={{
                left: (gridSize - waveDotSize) / 2,
                top: (gridSize - waveDotSize) / 2,
                width: waveDotSize,
                height: waveDotSize,
                backgroundColor: waveColor,
                animation: `grid-dot-decode-wave ${resolvedWaveMs}ms linear infinite`,
                animationDelay: `${cell.waveDelay}ms`,
              }}
            />
          </div>
        ))}
        {!compact ? (
          <div
            className="pointer-events-none absolute inset-y-0 w-1/4"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in oklch, var(--foreground) 18%, transparent), transparent)",
              opacity: 0.35,
              animation: "decode-scan-band 2.8s linear infinite",
            }}
          />
        ) : null}
      </div>
    ) : null;

  if (fill && !compact) {
    return (
      <div ref={containerRef} className={cn("h-full w-full", className)}>
        {grid}
      </div>
    );
  }

  return <div className={cn("relative shrink-0", className)}>{grid}</div>;
}

export function GridDotLoader({
  width = 240,
  height = 72,
  gridSize: gridSizeProp,
  cellShape = "circle",
  cellGap: cellGapProp,
  cellColor = "color-mix(in oklch, var(--muted-foreground) 30%, transparent)",
  blinkSpeed = 320,
  label,
  className,
  fill = false,
}: GridDotLoaderProps) {
  const { containerRef, resolvedWidth, resolvedHeight } = useGridDimensions(
    fill,
    width,
    height,
  );
  const derivedMetrics = useMemo(
    () => deriveGridMetrics(resolvedWidth, resolvedHeight),
    [resolvedWidth, resolvedHeight],
  );
  const gridSize = gridSizeProp ?? derivedMetrics.gridSize;
  const cellGap = cellGapProp ?? derivedMetrics.cellGap;

  const gridCells = useMemo(
    () =>
      resolvedWidth > 0 && resolvedHeight > 0
        ? buildGridCells({
            width: resolvedWidth,
            height: resolvedHeight,
            gridSize,
            cellGap,
            blinkSpeed,
          })
        : [],
    [resolvedWidth, resolvedHeight, gridSize, cellGap, blinkSpeed],
  );

  const grid = gridCells.length > 0 ? (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ width: resolvedWidth, height: resolvedHeight }}
      aria-hidden
    >
      {gridCells.map((cell) => (
        <div
          key={cell.id}
          className={cellShape === "circle" ? "rounded-full" : "rounded-sm"}
          style={{
            position: "absolute",
            left: cell.x,
            top: cell.y,
            width: gridSize,
            height: gridSize,
            backgroundColor: cellColor,
            opacity: cell.initialOpacity,
            animation: `grid-dot-blink ${blinkSpeed}ms ease-in-out infinite`,
            animationDelay: `${cell.blinkDelay}ms`,
          }}
        />
      ))}
    </div>
  ) : null;

  if (fill) {
    return (
      <div
        ref={containerRef}
        className={cn("h-full w-full", className)}
        aria-hidden={!label}
      >
        {grid}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center", className)}>
      {grid}
      {label ? (
        <p className="mt-4 text-xs text-muted-foreground">{label}</p>
      ) : null}
    </div>
  );
}

export interface GridDotSpinnerProps {
  size?: number;
  dotCount?: number;
  dotSize?: number;
  cellShape?: "circle" | "square";
  cellColor?: string;
  blinkSpeed?: number;
  className?: string;
}

function buildSpinnerCells(input: {
  size: number;
  dotCount: number;
  dotSize: number;
  blinkSpeed: number;
}): GridCell[] {
  const center = input.size / 2;
  const radius = Math.max(0, center - input.dotSize);
  const cells: GridCell[] = [];

  for (let index = 0; index < input.dotCount; index++) {
    const angle = (index / input.dotCount) * Math.PI * 2 - Math.PI / 2;
    cells.push({
      id: `spinner-${index}`,
      x: center + radius * Math.cos(angle) - input.dotSize / 2,
      y: center + radius * Math.sin(angle) - input.dotSize / 2,
      blinkDelay: (index / input.dotCount) * input.blinkSpeed,
      fadeDelay: 0,
      initialOpacity: 0.18,
      color: null,
    });
  }

  return cells;
}

export function GridDotSpinner({
  size = 56,
  dotCount = 12,
  dotSize = 5,
  cellShape = "circle",
  cellColor = "color-mix(in oklch, var(--muted-foreground) 30%, transparent)",
  blinkSpeed = 320,
  className,
}: GridDotSpinnerProps) {
  const spinnerCells = useMemo(
    () =>
      buildSpinnerCells({
        size,
        dotCount,
        dotSize,
        blinkSpeed,
      }),
    [size, dotCount, dotSize, blinkSpeed],
  );

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {spinnerCells.map((cell) => (
        <div
          key={cell.id}
          className={cellShape === "circle" ? "rounded-full" : "rounded-sm"}
          style={{
            position: "absolute",
            left: cell.x,
            top: cell.y,
            width: dotSize,
            height: dotSize,
            backgroundColor: cellColor,
            opacity: cell.initialOpacity,
            animation: `grid-dot-blink ${blinkSpeed}ms ease-in-out infinite`,
            animationDelay: `${cell.blinkDelay}ms`,
          }}
        />
      ))}
    </div>
  );
}

interface ImageLoaderProps {
  src: string;
  alt?: string;
  gridSize?: number;
  cellShape?: "circle" | "square";
  cellGap?: number;
  cellColor?: string;
  blinkSpeed?: number;
  transitionDuration?: number;
  fadeOutDuration?: number;
  loadingDelay?: number;
  onLoad?: () => void;
  className?: string;
  width?: string | number;
  height?: string | number;
}

export default function ImageLoader({
  src,
  alt = "",
  gridSize = 20,
  cellShape = "circle",
  cellGap = 2,
  cellColor = "#cbd5e1",
  blinkSpeed = 1000,
  transitionDuration = 800,
  fadeOutDuration = 600,
  loadingDelay = 1500,
  onLoad = () => {},
  className = "",
  width,
  height,
}: ImageLoaderProps) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showImage, setShowImage] = useState<boolean>(false);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const [gridCells, setGridCells] = useState<GridCell[]>([]);

  const imageRef = useRef<HTMLImageElement>(null);
  const processedRef = useRef<boolean>(false);
  const loadStartTimeRef = useRef<number>(Date.now());

  const dimensions = useMemo(
    () => ({
      width: parseInt(String(width)) || 800,
      height: parseInt(String(height)) || 600,
    }),
    [width, height],
  );

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return;

    setGridCells(
      buildGridCells({
        width: dimensions.width,
        height: dimensions.height,
        gridSize,
        cellGap,
        blinkSpeed,
        fadeOutDuration,
      }),
    );
  }, [
    dimensions.width,
    dimensions.height,
    gridSize,
    cellGap,
    blinkSpeed,
    fadeOutDuration,
  ]);

  const sampleColorFromRegion = useCallback(
    (
      canvas: HTMLCanvasElement,
      x: number,
      y: number,
      sampleWidth: number,
      sampleHeight: number,
    ): string => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return cellColor;

      const imageData = ctx.getImageData(x, y, sampleWidth, sampleHeight);
      const data = imageData.data;

      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;

      for (let i = 0; i < data.length; i += 16) {
        r += data[i] ?? 0;
        g += data[i + 1] ?? 0;
        b += data[i + 2] ?? 0;
        count++;
      }

      return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
    },
    [cellColor],
  );

  const processImage = useCallback(
    (img: HTMLImageElement, currentGridCells: GridCell[]) => {
      if (processedRef.current || currentGridCells.length === 0) return;
      processedRef.current = true;

      const doProcess = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);

        const scaleX = img.naturalWidth / dimensions.width;
        const scaleY = img.naturalHeight / dimensions.height;

        const updatedCells = currentGridCells.map((cell) => ({
          ...cell,
          color: sampleColorFromRegion(
            canvas,
            Math.floor(cell.x * scaleX),
            Math.floor(cell.y * scaleY),
            Math.floor(gridSize * scaleX),
            Math.floor(gridSize * scaleY),
          ),
        }));

        setGridCells(updatedCells);
        setIsLoading(false);
        setIsTransitioning(true);

        setTimeout(() => setShowImage(true), transitionDuration);

        setTimeout(() => {
          setIsTransitioning(false);
          setIsFadingOut(true);
        }, transitionDuration);

        onLoad();
      };

      if (loadingDelay > 0) {
        const elapsedTime = Date.now() - loadStartTimeRef.current;
        const remainingDelay = Math.max(0, loadingDelay - elapsedTime);
        setTimeout(doProcess, remainingDelay);
      } else {
        doProcess();
      }
    },
    [
      dimensions,
      gridSize,
      transitionDuration,
      loadingDelay,
      sampleColorFromRegion,
      onLoad,
    ],
  );

  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;

    if (img.complete && img.naturalWidth > 0) {
      processImage(img, gridCells);
    } else {
      const handleLoad = () => processImage(img, gridCells);
      img.addEventListener("load", handleLoad);
      return () => img.removeEventListener("load", handleLoad);
    }
  }, [gridCells, processImage]);

  const getCellStyle = useCallback(
    (cell: GridCell): CSSProperties => {
      const baseStyle: CSSProperties = {
        position: "absolute",
        left: cell.x,
        top: cell.y,
        willChange: "opacity, background-color, width, height, left, top",
      };

      if (isLoading) {
        return {
          ...baseStyle,
          animation: `grid-dot-blink ${blinkSpeed}ms ease-in-out infinite`,
          animationDelay: `${cell.blinkDelay}ms`,
          animationFillMode: "backwards",
          backgroundColor: cellColor,
          width: gridSize,
          height: gridSize,
          opacity: cell.initialOpacity,
        };
      }

      if (isTransitioning) {
        return {
          ...baseStyle,
          backgroundColor: cell.color || cellColor,
          transition: `background-color ${transitionDuration}ms ease, width ${transitionDuration}ms ease, height ${transitionDuration}ms ease, left ${transitionDuration}ms ease, top ${transitionDuration}ms ease, opacity ${transitionDuration}ms ease`,
          width: gridSize + cellGap,
          height: gridSize + cellGap,
          left: cell.x - cellGap / 2,
          top: cell.y - cellGap / 2,
          opacity: 1,
          animation: "none",
        };
      }

      if (isFadingOut) {
        return {
          ...baseStyle,
          backgroundColor: cell.color || cellColor,
          opacity: 0,
          transition: `opacity ${fadeOutDuration}ms ease`,
          transitionDelay: `${cell.fadeDelay}ms`,
          width: gridSize + cellGap,
          height: gridSize + cellGap,
          left: cell.x - cellGap / 2,
          top: cell.y - cellGap / 2,
        };
      }

      return baseStyle;
    },
    [
      isLoading,
      isTransitioning,
      isFadingOut,
      blinkSpeed,
      cellColor,
      gridSize,
      cellGap,
      transitionDuration,
      fadeOutDuration,
    ],
  );

  return (
    <div className={cn("relative", className)}>
      <div
        className="relative mx-auto overflow-hidden"
        style={{
          width: width || "100%",
          height: height || "auto",
          aspectRatio: `${dimensions.width} / ${dimensions.height}`,
        }}
      >
        {gridCells.length > 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10">
            {gridCells.map((cell) => (
              <div
                key={cell.id}
                className={cellShape === "circle" ? "rounded-full" : "rounded"}
                style={getCellStyle(cell)}
              />
            ))}
          </div>
        ) : null}

        <img
          ref={imageRef}
          src={src}
          alt={alt}
          crossOrigin="anonymous"
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            opacity: showImage ? 1 : 0,
            transition: "opacity 300ms ease",
          }}
        />
      </div>
    </div>
  );
}
