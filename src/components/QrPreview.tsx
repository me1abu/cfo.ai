// Minimal SVG QR-like preview generator (deterministic pseudo-QR from string).
// Not a real ZATCA TLV QR — for UI demonstration only.
import { useMemo } from "react";

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function QrPreview({ value, size = 200 }: { value: string; size?: number }) {
  const cells = 25;
  const matrix = useMemo(() => {
    const m: boolean[][] = [];
    let seed = hash(value || "n/a");
    for (let y = 0; y < cells; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < cells; x++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        row.push((seed & 1) === 1);
      }
      m.push(row);
    }
    // Finder patterns corners
    const setBlock = (bx: number, by: number) => {
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 7; x++) {
          const border = x === 0 || y === 0 || x === 6 || y === 6;
          const inner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          m[by + y][bx + x] = border || inner;
        }
      // clear ring
      for (let y = 1; y < 6; y++)
        for (let x = 1; x < 6; x++) {
          if (!(x >= 2 && x <= 4 && y >= 2 && y <= 4)) m[by + y][bx + x] = false;
        }
    };
    setBlock(0, 0);
    setBlock(cells - 7, 0);
    setBlock(0, cells - 7);
    return m;
  }, [value]);

  const cell = size / cells;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="rounded-md bg-white p-2"
    >
      <rect width={size} height={size} fill="white" />
      {matrix.flatMap((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect
              key={`${x}-${y}`}
              x={x * cell}
              y={y * cell}
              width={cell}
              height={cell}
              fill="black"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
