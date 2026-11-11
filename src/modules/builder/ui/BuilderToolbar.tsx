/**
 * BuilderToolbar — Floating toolbar for the office builder.
 *
 * Visible only in edit mode. Contains:
 *   - Furniture catalog toggle
 *   - Rotate button (R shortcut)
 *   - Delete mode toggle
 *   - Undo / Redo buttons
 *   - Save indicator
 *   - Exit edit mode button
 *
 * Glassmorphic styling matching the existing HUD.
 */

import { useEffect, useCallback } from 'react';
import { useBuilderStore } from '../state/builder.store';

export function BuilderToolbar() {
  const isEditMode = useBuilderStore((s) => s.isEditMode);
  const selectedCatalogItem = useBuilderStore((s) => s.selectedCatalogItem);
  const isDeleteMode = useBuilderStore((s) => s.isDeleteMode);
  const isCatalogOpen = useBuilderStore((s) => s.isCatalogOpen);
  const undoStack = useBuilderStore((s) => s.undoStack);
  const redoStack = useBuilderStore((s) => s.redoStack);
  const isDirty = useBuilderStore((s) => s.isDirty);
  const isSaving = useBuilderStore((s) => s.isSaving);
  const placedItems = useBuilderStore((s) => s.placedItems);

  const toggleCatalog = useBuilderStore((s) => s.toggleCatalog);
  const toggleDeleteMode = useBuilderStore((s) => s.toggleDeleteMode);
  const rotateCurrent = useBuilderStore((s) => s.rotateCurrent);
  const undo = useBuilderStore((s) => s.undo);
  const redo = useBuilderStore((s) => s.redo);
  const exitEditMode = useBuilderStore((s) => s.exitEditMode);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isEditMode) return;

      // Prevent shortcuts when typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        rotateCurrent();
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        exitEditMode();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = useBuilderStore.getState().selectedInstanceId;
        if (selected) {
          e.preventDefault();
          useBuilderStore.getState().removeItem(selected);
        }
      }
    },
    [isEditMode, rotateCurrent, exitEditMode, undo, redo],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isEditMode) return null;

  return (
    <div
      id="builder-toolbar"
      className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-900/90 px-3 py-2 shadow-2xl backdrop-blur-md"
    >
      {/* Catalog Toggle */}
      <ToolbarButton
        id="btn-toggle-catalog"
        label="Furniture"
        icon={
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        }
        isActive={isCatalogOpen}
        onClick={toggleCatalog}
      />

      <ToolbarDivider />

      {/* Rotate */}
      <ToolbarButton
        id="btn-rotate"
        label="Rotate (R)"
        icon={
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        }
        disabled={!selectedCatalogItem}
        onClick={rotateCurrent}
      />

      {/* Delete Mode */}
      <ToolbarButton
        id="btn-delete-mode"
        label="Delete"
        icon={
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        }
        isActive={isDeleteMode}
        isDanger={isDeleteMode}
        onClick={toggleDeleteMode}
      />

      <ToolbarDivider />

      {/* Undo */}
      <ToolbarButton
        id="btn-undo"
        label="Undo (Ctrl+Z)"
        icon={
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        }
        disabled={undoStack.length === 0}
        onClick={undo}
      />

      {/* Redo */}
      <ToolbarButton
        id="btn-redo"
        label="Redo (Ctrl+Y)"
        icon={
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
          </svg>
        }
        disabled={redoStack.length === 0}
        onClick={redo}
      />

      <ToolbarDivider />

      {/* Item Counter */}
      <div className="flex items-center gap-1 px-1.5">
        <span className="text-[10px] font-mono text-slate-500">
          {placedItems.length} items
        </span>
        {isDirty && (
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes" />
        )}
        {isSaving && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" title="Saving..." />
        )}
      </div>

      <ToolbarDivider />

      {/* Exit Edit Mode */}
      <button
        id="btn-exit-edit"
        onClick={exitEditMode}
        className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
        title="Exit Edit Mode (Esc)"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        Done
      </button>
    </div>
  );
}

// ─── Sub-components ───

interface ToolbarButtonProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  isActive?: boolean;
  isDanger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolbarButton({
  id,
  label,
  icon,
  isActive = false,
  isDanger = false,
  disabled = false,
  onClick,
}: ToolbarButtonProps) {
  let colorClasses = 'text-slate-400 hover:text-white hover:bg-slate-800';
  if (isActive && isDanger) {
    colorClasses = 'text-red-400 bg-red-500/15 hover:bg-red-500/25';
  } else if (isActive) {
    colorClasses = 'text-cyan-400 bg-cyan-500/15 hover:bg-cyan-500/25';
  }
  if (disabled) {
    colorClasses = 'text-slate-600 cursor-not-allowed';
  }

  return (
    <button
      id={id}
      onClick={disabled ? undefined : onClick}
      className={`rounded-lg p-2 transition-colors ${colorClasses}`}
      title={label}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-6 w-px bg-slate-700/50" />;
}
