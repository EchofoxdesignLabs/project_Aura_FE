/**
 * CatalogItem — Individual furniture card in the catalog panel.
 *
 * Shows:
 *   - Isometric thumbnail (generated or loaded)
 *   - Item name
 *   - Footprint label (e.g., "2×1")
 *   - Selected state highlight
 */

import { useMemo } from 'react';
import type { FurnitureDefinition } from '../../catalog/furniture-catalog';
import { generateThumbnailDataUrl } from '../../catalog/asset-loader';

interface CatalogItemProps {
  definition: FurnitureDefinition;
  isSelected: boolean;
  onSelect: (definition: FurnitureDefinition) => void;
}

export function CatalogItem({ definition, isSelected, onSelect }: CatalogItemProps) {
  const thumbnailSrc = useMemo(() => generateThumbnailDataUrl(definition), [definition]);

  const [cols, rows] = definition.footprint;

  return (
    <button
      id={`catalog-item-${definition.id}`}
      onClick={() => onSelect(definition)}
      className={`
        group relative flex flex-col items-center gap-1.5 rounded-lg border p-2
        transition-all duration-150 cursor-pointer
        ${isSelected
          ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
          : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800/70'
        }
      `}
    >
      {/* Thumbnail */}
      <div className="relative h-14 w-14 overflow-hidden rounded-md bg-slate-900/60">
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={definition.name}
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-3 w-3 animate-pulse rounded-full bg-slate-600" />
          </div>
        )}

        {/* Selected checkmark */}
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-cyan-500/10">
            <svg className="h-5 w-5 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Name */}
      <span className={`text-[11px] font-medium leading-tight text-center ${
        isSelected ? 'text-cyan-300' : 'text-slate-300 group-hover:text-white'
      }`}>
        {definition.name}
      </span>

      {/* Footprint badge */}
      <span className="text-[9px] font-mono text-slate-500">
        {cols}×{rows}
      </span>
    </button>
  );
}
