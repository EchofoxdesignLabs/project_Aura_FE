/**
 * CatalogPanel — Slide-out sidebar listing all available furniture items.
 *
 * Features:
 *   - Category filter tabs
 *   - Search input
 *   - Grid of CatalogItem cards
 *   - Click to select → ghost placement cursor appears
 */

import { useState, useMemo } from 'react';
import { useBuilderStore } from '../state/builder.store';
import { DEFAULT_CATALOG } from '../catalog/default-catalog';
import {
  FurnitureCategory,
  CATEGORY_LABELS,
  type FurnitureDefinition,
} from '../catalog/furniture-catalog';
import { getActiveCategories } from '../catalog/default-catalog';
import { CatalogItem } from './components/CatalogItem';

export function CatalogPanel() {
  const isCatalogOpen = useBuilderStore((s) => s.isCatalogOpen);
  const selectedCatalogItem = useBuilderStore((s) => s.selectedCatalogItem);
  const selectCatalogItem = useBuilderStore((s) => s.selectCatalogItem);
  const clearSelection = useBuilderStore((s) => s.clearSelection);

  const [activeCategory, setActiveCategory] = useState<FurnitureCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = useMemo(() => getActiveCategories(), []);

  const filteredItems = useMemo(() => {
    let items = DEFAULT_CATALOG;

    // Category filter
    if (activeCategory !== 'ALL') {
      items = items.filter((item) => item.category === activeCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query),
      );
    }

    return items;
  }, [activeCategory, searchQuery]);

  const handleSelect = (definition: FurnitureDefinition) => {
    if (selectedCatalogItem?.id === definition.id) {
      clearSelection();
    } else {
      selectCatalogItem(definition);
    }
  };

  if (!isCatalogOpen) return null;

  return (
    <div
      id="builder-catalog-panel"
      className="absolute left-0 top-0 z-30 flex h-full w-72 flex-col border-r border-slate-700/50 bg-slate-900/95 backdrop-blur-md"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-700/40 px-4 py-3">
        <svg className="h-5 w-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <h2 className="text-sm font-semibold text-white">Furniture</h2>
        <span className="ml-auto text-[10px] text-slate-500">{filteredItems.length} items</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          type="text"
          id="catalog-search"
          placeholder="Search furniture..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
        />
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-700/40 px-3 pb-2">
        <button
          onClick={() => setActiveCategory('ALL')}
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
            activeCategory === 'ALL'
              ? 'bg-cyan-500/20 text-cyan-300'
              : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Item Grid */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {filteredItems.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-slate-500">No items found</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filteredItems.map((item) => (
              <CatalogItem
                key={item.id}
                definition={item}
                isSelected={selectedCatalogItem?.id === item.id}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Selected Item Info */}
      {selectedCatalogItem && (
        <div className="border-t border-slate-700/40 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white">{selectedCatalogItem.name}</p>
              <p className="text-[10px] text-slate-400">
                {selectedCatalogItem.footprint[0]}×{selectedCatalogItem.footprint[1]} tiles
                {selectedCatalogItem.blocksMovement && ' • Blocks movement'}
              </p>
            </div>
            <button
              onClick={clearSelection}
              className="rounded-md bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700 hover:text-white"
            >
              Deselect
            </button>
          </div>
          <p className="mt-1 text-[10px] text-cyan-400/80">
            Click on the grid to place • Press R to rotate
          </p>
        </div>
      )}
    </div>
  );
}
