import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import LZString from 'lz-string';

// =====================================================
// CONSTANTS
// =====================================================
const SHAPE_SIZE = 50;
const TRI_HEIGHT = (SHAPE_SIZE * Math.sqrt(3)) / 2;
const SNAP_THRESHOLD = 100;
const EDGE_TOLERANCE = 2;
const ARC_SEGMENTS = 12; // Higher = smoother collision detection
const CELL_SIZE = 50; // Size of one grid cell for fief calculations
const STAKE_COUNTDOWN = 5; // Seconds for stake to be claimed

const BUILDING_TYPES = {
  atreides: { label: 'Atreides', cornerStyle: 'stepped', material: 'plastone', cost: 18 },
  harkonnen: { label: 'Harkonnen', cornerStyle: 'round', material: 'plastone', cost: 18 },
  choamShelter: { label: 'Choam Shelter', cornerStyle: 'round', material: 'granite', cost: 12 },
  choamFacility: { label: 'Choam Facility', cornerStyle: 'diagonal', material: 'granite', cost: 15 },
};

// Color schemes for each building type - shades differentiate shape types
const COLOR_SCHEMES = {
  atreides: {
    // Green palette
    square:   { fill: '#22c55e', stroke: '#4ade80' },  // green-500/400
    triangle: { fill: '#16a34a', stroke: '#22c55e' },  // green-600/500
    corner:   { fill: '#15803d', stroke: '#16a34a' },  // green-700/600
    stair:    { fill: '#166534', stroke: '#22c55e' },  // green-800/500
  },
  harkonnen: {
    // Red palette
    square:   { fill: '#ef4444', stroke: '#f87171' },  // red-500/400
    triangle: { fill: '#dc2626', stroke: '#ef4444' },  // red-600/500
    corner:   { fill: '#b91c1c', stroke: '#dc2626' },  // red-700/600
    stair:    { fill: '#991b1b', stroke: '#ef4444' },  // red-800/500
  },
  choamShelter: {
    // Beige/tan palette
    square:   { fill: '#d4a574', stroke: '#e4c9a8' },  // warm beige
    triangle: { fill: '#c4956a', stroke: '#d4a574' },  // medium beige
    corner:   { fill: '#b08560', stroke: '#c4956a' },  // darker beige
    stair:    { fill: '#9a7556', stroke: '#d4a574' },  // darker beige
  },
  choamFacility: {
    // Gray palette
    square:   { fill: '#6b7280', stroke: '#9ca3af' },  // gray-500/400
    triangle: { fill: '#4b5563', stroke: '#6b7280' },  // gray-600/500
    corner:   { fill: '#374151', stroke: '#4b5563' },  // gray-700/600
    stair:    { fill: '#1f2937', stroke: '#6b7280' },  // gray-800/500
  },
};

const CORNER_STEPS = 3; // Number of steps for Atreides stepped corners
const DIAGONAL_FLAT_RATIO = 0.27; // Size of small flats on Choam Facility corners (27%)

const FIEF_DEFAULTS = {
  standard: { width: 5.5, height: 5.5, power: 15 },
  advanced: { width: 10.5, height: 10.5, power: 15 },
};
const MAX_STAKES = 5;

// =====================================================
// BASE MANAGEMENT ITEMS CATALOG
// =====================================================
const ITEM_CATEGORIES = {
  generator: { label: 'Generators', color: '#eab308' },    // yellow - produces power
  refiner: { label: 'Refiners', color: '#3b82f6' },        // blue - consumes power, produces water
  utilities: { label: 'Utilities', color: '#a855f7' },     // purple - windtraps, deathstills
  fabricator: { label: 'Fabricators', color: '#10b981' },  // green - consumes power
  storage: { label: 'Storage', color: '#06b6d4' },         // cyan - stores water
};

const BASE_ITEMS = {
  'spice-generator': {
    id: 'spice-generator',
    name: 'Spice-Powered Generator',
    category: 'generator',
    icon: '/items/spice-generator.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 0,
      powerGeneration: 1000,
      waterPerMinute: 0,
      waterStorage: 0,
    },
    materials: [
      { name: 'Plastanium Ingot', amount: 430 },
      { name: 'Silicone Block', amount: 180 },
      { name: 'Spice Melange', amount: 270 },
      { name: 'Complex Machinery', amount: 100 },
      { name: 'Cobalt Paste', amount: 300 },
      { name: 'Advanced Machinery', amount: 40 },
    ],
  },
  'wind-turbine': {
    id: 'wind-turbine',
    name: 'Wind Turbine Directional',
    category: 'generator',
    icon: '/items/wind-turbine.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 0,
      powerGeneration: 350,
      waterPerMinute: 0,
      waterStorage: 0,
    },
    materials: [
      { name: 'Duraluminum Ingot', amount: 120 },
      { name: 'Cobalt Paste', amount: 160 },
      { name: 'Calibrated Servok', amount: 50 },
      { name: 'Spice Melange', amount: 3 },
    ],
  },
  'wind-turbine-omni': {
    id: 'wind-turbine-omni',
    name: 'Wind Turbine Omnidirectional',
    category: 'generator',
    icon: '/items/wind-turbine-omni.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 0,
      powerGeneration: 150,
      waterPerMinute: 0,
      waterStorage: 0,
    },
    materials: [
      { name: 'Steel Ingot', amount: 45 },
      { name: 'Cobalt Paste', amount: 65 },
      { name: 'Calibrated Servok', amount: 20 },
    ],
  },
  'fuel-powered-generator': {
    id: 'fuel-powered-generator',
    name: 'Fuel-Powered Generator',
    category: 'generator',
    icon: '/items/fuel-powered-generator.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 0,
      powerGeneration: 75,
      waterPerMinute: 0,
      waterStorage: 0,
    },
    materials: [
      { name: 'Salvaged Metal', amount: 45 },
    ],
  },
  'windtrap': {
    id: 'windtrap',
    name: 'Windtrap',
    category: 'utilities',
    icon: '/items/windtrap.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 75,
      powerGeneration: 0,
      waterPerMinute: 45,
      waterStorage: 500,
    },
    materials: [
      { name: 'Steel Ingot', amount: 90 },
      { name: 'Silicone Block', amount: 30 },
      { name: 'Calibrated Servok', amount: 2 },
    ],
  },
  'large-windtrap': {
    id: 'large-windtrap',
    name: 'Large Windtrap',
    category: 'utilities',
    icon: '/items/large-windtrap.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 135,
      powerGeneration: 0,
      waterPerMinute: 105,
      waterStorage: 500,
    },
    materials: [
      { name: 'Duraluminum Ingot', amount: 240 },
      { name: 'Silicone Block', amount: 250 },
      { name: 'Calibrated Servok', amount: 70 },
      { name: 'Spice Melange', amount: 5 },
    ],
  },
  'deathstill': {
    id: 'deathstill',
    name: 'Fremen Deathstill',
    category: 'utilities',
    icon: '/items/deathstill.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 200,
      powerGeneration: 0,
      waterPerMinute: 416.67,
      waterStorage: 0,
      totalYield: 25000,
      processingTime: 60,
    },
    materials: [
      { name: 'Steel Ingot', amount: 60 },
      { name: 'Silicone Block', amount: 28 },
      { name: 'Complex Machinery', amount: 32 },
    ],
  },
  'deathstill-advanced': {
    id: 'deathstill-advanced',
    name: 'Advanced Fremen Deathstill',
    category: 'utilities',
    icon: '/items/deathstill-advanced.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 350,
      powerGeneration: 0,
      waterPerMinute: 900,
      waterStorage: 0,
      totalYield: 45000,
      processingTime: 50,
    },
    materials: [
      { name: 'Duraluminum Ingot', amount: 240 },
      { name: 'Silicone Block', amount: 170 },
      { name: 'Complex Machinery', amount: 70 },
    ],
  },
  'water-cistern-medium': {
    id: 'water-cistern-medium',
    name: 'Medium Water Cistern',
    category: 'storage',
    icon: '/items/water-cistern-medium.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 0,
      powerGeneration: 0,
      waterPerMinute: 0,
      waterStorage: 25000,
    },
    materials: [
      { name: 'Steel Ingot', amount: 60 },
      { name: 'Silicone Block', amount: 30 },
    ],
  },
  'water-cistern-large': {
    id: 'water-cistern-large',
    name: 'Large Water Cistern',
    category: 'storage',
    icon: '/items/water-cistern-large.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 0,
      powerGeneration: 0,
      waterPerMinute: 0,
      waterStorage: 100000,
    },
    materials: [
      { name: 'Duraluminum Ingot', amount: 150 },
      { name: 'Silicone Block', amount: 160 },
      { name: 'Industrial Pump', amount: 25 },
    ],
  },
  'large-spice-refinery': {
    id: 'large-spice-refinery',
    name: 'Large Spice Refinery',
    category: 'refiner',
    icon: '/items/large-spice-refinery.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 500,
      powerGeneration: 0,
      waterPerMinute: 0,
      waterStorage: 0,
    },
    materials: [
      { name: 'Plastanium Ingot', amount: 950 },
      { name: 'Silicone Block', amount: 1080 },
      { name: 'Complex Machinery', amount: 350 },
      { name: 'Spice Melange', amount: 1000 },
      { name: 'Cobalt Paste', amount: 1110 },
      { name: 'Advanced Machinery', amount: 55 },
    ],
  },
  'large-ore-refinery': {
    id: 'large-ore-refinery',
    name: 'Large Ore Refinery',
    category: 'refiner',
    icon: '/items/large-ore-refinery.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 350,
      powerGeneration: 0,
      waterPerMinute: 0,
      waterStorage: 0,
    },
    materials: [
      { name: 'Plastanium Ingot', amount: 380 },
      { name: 'Silicone Block', amount: 540 },
      { name: 'Spice Melange', amount: 400 },
      { name: 'Complex Machinery', amount: 200 },
      { name: 'Cobalt Paste', amount: 745 },
      { name: 'Advanced Machinery', amount: 40 },
    ],
  },
  'medium-spice-refinery': {
    id: 'medium-spice-refinery',
    name: 'Medium Spice Refinery',
    category: 'refiner',
    icon: '/items/medium-spice-refinery.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 350,
      powerGeneration: 0,
      waterPerMinute: 0,
      waterStorage: 0,
    },
    materials: [
      { name: 'Plastanium Ingot', amount: 285 },
      { name: 'Silicone Block', amount: 225 },
      { name: 'Spice Melange', amount: 135 },
      { name: 'Complex Machinery', amount: 100 },
      { name: 'Cobalt Paste', amount: 190 },
    ],
  },
  'medium-ore-refinery': {
    id: 'medium-ore-refinery',
    name: 'Medium Ore Refinery',
    category: 'refiner',
    icon: '/items/medium-ore-refinery.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 45,
      powerGeneration: 0,
      waterPerMinute: 0,
      waterStorage: 0,
    },
    materials: [
      { name: 'Steel Ingot', amount: 125 },
      { name: 'Cobalt Paste', amount: 60 },
      { name: 'Complex Machinery', amount: 50 },
    ],
  },
  'medium-chemical-refinery': {
    id: 'medium-chemical-refinery',
    name: 'Medium Chemical Refinery',
    category: 'refiner',
    icon: '/items/medium-chemical-refinery.webp',
    size: { width: 1, height: 1 },
    stats: {
      powerConsumption: 350,
      powerGeneration: 0,
      waterPerMinute: 0,
      waterStorage: 0,
    },
    materials: [
      { name: 'Duraluminum Ingot', amount: 150 },
      { name: 'Silicone Block', amount: 90 },
      { name: 'Complex Machinery', amount: 50 },
      { name: 'Spice Melange', amount: 35 },
    ],
  },
};

const ITEM_GRID_SIZE = 50; // Size of one item grid unit in pixels

export default function App() {
  // Floor system state
  const [currentFloor, setCurrentFloor] = useState(0);
  const [allFloorShapes, setAllFloorShapes] = useState({ 0: [] });
  const [allFloorItems, setAllFloorItems] = useState({ 0: [] });
  const [showSilhouette, setShowSilhouette] = useState(true);

  // Derived values for current floor
  const shapes = allFloorShapes[currentFloor] || [];
  const placedItems = allFloorItems[currentFloor] || [];

  // Floor below for silhouette
  const floorBelowShapes = currentFloor > 0 ? (allFloorShapes[currentFloor - 1] || []) : [];
  const floorBelowItems = currentFloor > 0 ? (allFloorItems[currentFloor - 1] || []) : [];

  // Wrapper setters that update the correct floor
  const setShapes = useCallback((updater) => {
    setAllFloorShapes(prev => {
      const currentShapes = prev[currentFloor] || [];
      const newShapes = typeof updater === 'function' ? updater(currentShapes) : updater;
      return { ...prev, [currentFloor]: newShapes };
    });
  }, [currentFloor]);

  const setPlacedItems = useCallback((updater) => {
    setAllFloorItems(prev => {
      const currentItems = prev[currentFloor] || [];
      const newItems = typeof updater === 'function' ? updater(currentItems) : updater;
      return { ...prev, [currentFloor]: newItems };
    });
  }, [currentFloor]);

  const [shapesHistory, setShapesHistory] = useState([]); // Unified undo history for ALL actions

  // Refs to track current state for history saving (avoids stale closures)
  const allFloorShapesRef = useRef(allFloorShapes);
  const allFloorItemsRef = useRef(allFloorItems);
  useEffect(() => { allFloorShapesRef.current = allFloorShapes; }, [allFloorShapes]);
  useEffect(() => { allFloorItemsRef.current = allFloorItems; }, [allFloorItems]);

  // Save current state to unified history before any modification
  const saveToHistory = useCallback(() => {
    const currentShapes = allFloorShapesRef.current;
    const currentItems = allFloorItemsRef.current;
    // Deep copy shapes and items to prevent mutation
    const shapesCopy = {};
    for (const floor in currentShapes) {
      shapesCopy[floor] = currentShapes[floor].map(s => ({ ...s, _verts: s._verts ? [...s._verts.map(v => ({ ...v }))] : null }));
    }
    const itemsCopy = {};
    for (const floor in currentItems) {
      itemsCopy[floor] = currentItems[floor].map(i => ({ ...i }));
    }
    setShapesHistory(prev => [...prev.slice(-49), { shapes: shapesCopy, items: itemsCopy }]); // Keep last 50 states
  }, []);

  const [hoverInfo, setHoverInfo] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isWideMode, setIsWideMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [buildingType, setBuildingType] = useState('atreides');
  const [leftClickShape, setLeftClickShape] = useState('square'); // 'square', 'triangle', 'corner', 'stair', 'delete'
  const [rightClickShape, setRightClickShape] = useState('triangle'); // 'square', 'triangle', 'corner', 'stair', 'delete'
  const [middleClickAction, setMiddleClickAction] = useState('delete'); // 'square', 'triangle', 'corner', 'stair', 'delete'

  // Rotation mode state
  const [isRotating, setIsRotating] = useState(false);
  const [rotatingButton, setRotatingButton] = useState(null); // 'left' or 'right'
  const [rotationStartX, setRotationStartX] = useState(0);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [baseVertices, setBaseVertices] = useState(null);
  const [rotationShapeType, setRotationShapeType] = useState(null);

  // Fief mode state
  const [fiefMode, setFiefMode] = useState(false);
  const [fiefType, setFiefType] = useState('standard'); // 'standard' or 'advanced'
  const [fiefWidth, setFiefWidth] = useState(FIEF_DEFAULTS.standard.width);
  const [fiefHeight, setFiefHeight] = useState(FIEF_DEFAULTS.standard.height);
  const [fiefPosition, setFiefPosition] = useState(null); // { x, y } world coordinates where fief is placed
  const [draggingFief, setDraggingFief] = useState(null); // 'standard' or 'advanced' when dragging
  const [fiefPadding, setFiefPadding] = useState(0); // Padding percentage to EXPAND fief (0-5%)

  // Stakes state
  const [stakesInventory, setStakesInventory] = useState(MAX_STAKES);
  const [placedStakes, setPlacedStakes] = useState([]); // { id, direction, parentId, countdown, claimed }
  const [claimedAreas, setClaimedAreas] = useState([]); // { id, direction, parentId } - completed claims
  const [draggingStake, setDraggingStake] = useState(null); // stake being dragged from inventory
  const [stakeDropZone, setStakeDropZone] = useState(null); // which zone is being hovered
  const [linkCopied, setLinkCopied] = useState(false); // feedback for copy link button
  const [urlTooLong, setUrlTooLong] = useState(false); // warning when URL exceeds Discord limit
  const [middleMouseStart, setMiddleMouseStart] = useState(null); // track middle mouse for pan vs click detection

  // Discord webhook state
  const [showWebhookField, setShowWebhookField] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [sendingToDiscord, setSendingToDiscord] = useState(false);
  const [discordSent, setDiscordSent] = useState(false);

  // Lock mode state
  const [isLocked, setIsLocked] = useState(false);
  const [hoveredGroup, setHoveredGroup] = useState([]); // IDs of shapes in hovered group
  const [isDraggingGroup, setIsDraggingGroup] = useState(false);
  const [draggedGroupIds, setDraggedGroupIds] = useState([]);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isRotatingGroup, setIsRotatingGroup] = useState(false);
  const [groupRotationAngle, setGroupRotationAngle] = useState(0);
  const [groupRotationCenter, setGroupRotationCenter] = useState({ x: 0, y: 0 });
  const [originalGroupPositions, setOriginalGroupPositions] = useState([]);
  const [clipboard, setClipboard] = useState(null); // Copied shapes for paste
  const mousePositionRef = useRef({ x: 0, y: 0 }); // Track mouse position for paste

  // Grid mode state
  const [gridEnabled, setGridEnabled] = useState(false);

  // Track if current placement is free (not edge-snapped)
  const [isFreePlacement, setIsFreePlacement] = useState(false);

  // Base management state (placedItems is derived from allFloorItems above)
  const [itemSidebarOpen, setItemSidebarOpen] = useState(false);
  const [draggingItem, setDraggingItem] = useState(null); // itemType being dragged from palette
  const [dragItemPosition, setDragItemPosition] = useState({ x: 0, y: 0 }); // preview position

  // Item Mode state - for selecting, moving, and deleting placed items
  const [itemMode, setItemMode] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [isDraggingPlacedItem, setIsDraggingPlacedItem] = useState(false);
  const [itemDragOffset, setItemDragOffset] = useState({ x: 0, y: 0 });

  // Toast notification system
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  // Help modal state
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Saved patterns state
  const [savedPatterns, setSavedPatterns] = useState(() => {
    try {
      const stored = localStorage.getItem('dune-planner-patterns');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [showPatternNameModal, setShowPatternNameModal] = useState(false);
  const [pendingPatternShapes, setPendingPatternShapes] = useState(null);
  const [patternName, setPatternName] = useState('');
  const [draggingPattern, setDraggingPattern] = useState(null);

  // Auto-save and restore state
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [skipNextSave, setSkipNextSave] = useState(false);

  // =====================================================
  // KEYBOARD SHORTCUTS
  // =====================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      // Ctrl+Z - Undo (unified history - always undoes last action regardless of mode)
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (shapesHistory.length > 0) {
          const lastState = shapesHistory[shapesHistory.length - 1];
          if (lastState && lastState.shapes && lastState.items) {
            setAllFloorShapes(lastState.shapes);
            setAllFloorItems(lastState.items);
          }
          setShapesHistory(prev => prev.slice(0, -1));
        }
      }

      // Ctrl+C - Copy group (Lock mode only)
      if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey) && isLocked) {
        e.preventDefault();
        // Find shape at current mouse position
        const mousePos = mousePositionRef.current;
        const shapeAtMouse = shapes.find(shape => {
          const verts = shape._verts || [];
          if (verts.length < 3) return false;
          // Point-in-polygon test
          let inside = false;
          for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
            const xi = verts[i].x, yi = verts[i].y;
            const xj = verts[j].x, yj = verts[j].y;
            if (((yi > mousePos.y) !== (yj > mousePos.y)) &&
                (mousePos.x < (xj - xi) * (mousePos.y - yi) / (yj - yi) + xi)) {
              inside = !inside;
            }
          }
          return inside;
        });

        if (shapeAtMouse) {
          // Find connected group
          const group = new Set([shapeAtMouse.id]);
          const queue = [shapeAtMouse];
          while (queue.length > 0) {
            const current = queue.shift();
            for (const other of shapes) {
              if (group.has(other.id)) continue;
              // Check if shapes share an edge
              const verts1 = current._verts || [];
              const verts2 = other._verts || [];
              const tolerance = EDGE_TOLERANCE * 2;
              let sharesEdge = false;
              for (let i = 0; i < verts1.length && !sharesEdge; i++) {
                const a1 = verts1[i];
                const a2 = verts1[(i + 1) % verts1.length];
                for (let j = 0; j < verts2.length && !sharesEdge; j++) {
                  const b1 = verts2[j];
                  const b2 = verts2[(j + 1) % verts2.length];
                  const a1MatchesB1 = Math.hypot(a1.x - b1.x, a1.y - b1.y) < tolerance;
                  const a1MatchesB2 = Math.hypot(a1.x - b2.x, a1.y - b2.y) < tolerance;
                  const a2MatchesB1 = Math.hypot(a2.x - b1.x, a2.y - b1.y) < tolerance;
                  const a2MatchesB2 = Math.hypot(a2.x - b2.x, a2.y - b2.y) < tolerance;
                  if ((a1MatchesB1 && a2MatchesB2) || (a1MatchesB2 && a2MatchesB1)) {
                    sharesEdge = true;
                  }
                }
              }
              if (sharesEdge) {
                group.add(other.id);
                queue.push(other);
              }
            }
          }

          // Get group shapes and calculate centroid
          const groupShapes = shapes.filter(s => group.has(s.id));
          let totalX = 0, totalY = 0, totalVerts = 0;
          for (const shape of groupShapes) {
            const verts = shape._verts || [];
            for (const v of verts) {
              totalX += v.x;
              totalY += v.y;
              totalVerts++;
            }
          }
          const centroidX = totalX / totalVerts;
          const centroidY = totalY / totalVerts;

          // Store shapes with vertices relative to centroid
          const clipboardData = groupShapes.map(shape => ({
            type: shape.type,
            building: shape.building,
            rotation: shape.rotation,
            _verts: (shape._verts || []).map(v => ({
              x: v.x - centroidX,
              y: v.y - centroidY
            }))
          }));
          setClipboard(clipboardData);
        }
      }

      // Ctrl+V - Paste group (Lock mode only)
      if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey) && isLocked && clipboard) {
        e.preventDefault();
        const mousePos = mousePositionRef.current;
        const baseId = Date.now();

        // Create new shapes at mouse position
        const newShapes = clipboard.map((shape, i) => ({
          id: baseId + i,
          type: shape.type,
          building: shape.building,
          rotation: shape.rotation,
          x: mousePos.x,
          y: mousePos.y,
          _verts: shape._verts.map(v => ({
            x: v.x + mousePos.x,
            y: v.y + mousePos.y
          }))
        }));

        saveToHistory();
        setShapes(prev => [...prev, ...newShapes]);
      }

      // Delete selected item with Delete or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemId !== null) {
        e.preventDefault();
        saveToHistory();
        setPlacedItems(prev => prev.filter(item => item.id !== selectedItemId));
        setSelectedItemId(null);
      }

      // ? or H to open help modal
      if ((e.key === '?' || e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowHelpModal(prev => !prev);
      }

      // Escape to close modals or deselect
      if (e.key === 'Escape') {
        if (showHelpModal) {
          setShowHelpModal(false);
        } else if (selectedItemId !== null) {
          setSelectedItemId(null);
        }
      }

      // G to toggle grid
      if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setGridEnabled(prev => !prev);
      }

      // L to toggle lock mode
      if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsLocked(prev => {
          if (!prev) {
            // Entering lock mode - close sidebar
            setItemSidebarOpen(false);
          }
          return !prev;
        });
      }

      // Number keys 1-5 for shape selection (not in item mode or lock mode)
      // Without Shift: Left click shape
      // With Shift (! @ # $ %): Right click shape
      const shapeKeys = ['1', '2', '3', '4', '5'];
      const shiftedKeys = ['!', '@', '#', '$', '%']; // Shift+1-5 on US keyboard
      const shapeTypes = ['square', 'triangle', 'corner', 'stair', 'delete'];
      const shapeLabels = ['Square', 'Triangle', 'Corner', 'Stair', 'Delete'];

      // Check for unshifted number keys (left-click assignment)
      if (shapeKeys.includes(e.key) && !e.ctrlKey && !e.metaKey && !e.shiftKey && !isLocked && !itemMode) {
        e.preventDefault();
        const index = shapeKeys.indexOf(e.key);
        setLeftClickShape(shapeTypes[index]);
        showToast(`Left-click: ${shapeLabels[index]}`, 'info', 1500);
      }

      // Check for shifted keys (right-click assignment)
      if (shiftedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey && !isLocked && !itemMode) {
        e.preventDefault();
        const index = shiftedKeys.indexOf(e.key);
        setRightClickShape(shapeTypes[index]);
        showToast(`Right-click: ${shapeLabels[index]}`, 'info', 1500);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemId, currentFloor, isLocked, shapes, clipboard, setShapes, setPlacedItems, showHelpModal, itemMode, showToast, saveToHistory, shapesHistory]);

  // Prevent context menu globally when pattern modal is open or in lock mode
  useEffect(() => {
    const preventContextMenu = (e) => {
      if (showPatternNameModal || isLocked) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', preventContextMenu);
    return () => document.removeEventListener('contextmenu', preventContextMenu);
  }, [showPatternNameModal, isLocked]);

  // =====================================================
  // AUTO-SAVE & RESTORE
  // =====================================================
  const STORAGE_KEY = 'dune-base-planner-autosave';

  // Save current state to localStorage
  const saveToLocalStorage = useCallback(() => {
    if (skipNextSave) {
      setSkipNextSave(false);
      return;
    }
    const state = {
      allFloorShapes,
      allFloorItems,
      currentFloor,
      buildingType,
      fiefMode,
      fiefType,
      fiefWidth,
      fiefHeight,
      fiefPosition,
      claimedAreas,
      stakesInventory,
      leftClickShape,
      rightClickShape,
      middleClickAction,
      gridEnabled,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  }, [allFloorShapes, allFloorItems, currentFloor, buildingType, fiefMode, fiefType, fiefWidth, fiefHeight, fiefPosition, claimedAreas, stakesInventory, leftClickShape, rightClickShape, middleClickAction, gridEnabled, skipNextSave]);

  // Auto-save every 30 seconds when there are shapes
  useEffect(() => {
    const hasContent = Object.values(allFloorShapes).some(s => s.length > 0) ||
                       Object.values(allFloorItems).some(i => i.length > 0);
    if (!hasContent) return;

    const interval = setInterval(() => {
      saveToLocalStorage();
    }, 30000);

    return () => clearInterval(interval);
  }, [saveToLocalStorage, allFloorShapes, allFloorItems]);

  // Also save on significant changes (debounced)
  useEffect(() => {
    const hasContent = Object.values(allFloorShapes).some(s => s.length > 0) ||
                       Object.values(allFloorItems).some(i => i.length > 0);
    if (!hasContent) return;

    const timeout = setTimeout(() => {
      saveToLocalStorage();
    }, 2000);

    return () => clearTimeout(timeout);
  }, [allFloorShapes, allFloorItems, saveToLocalStorage]);

  // Save patterns to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('dune-planner-patterns', JSON.stringify(savedPatterns));
    } catch (e) {
      console.warn('Failed to save patterns:', e);
    }
  }, [savedPatterns]);

  // Save a pattern from a group of shapes
  const savePattern = useCallback((name, groupShapes) => {
    // Calculate centroid of the group (average of all shape centers)
    const patternCx = groupShapes.reduce((sum, s) => sum + s.x, 0) / groupShapes.length;
    const patternCy = groupShapes.reduce((sum, s) => sum + s.y, 0) / groupShapes.length;

    // Store shapes with relative positions and local vertices (relative to each shape's own center)
    const patternShapes = groupShapes.map(s => {
      // Use existing vertices - all shapes should have _verts
      const verts = s._verts;
      if (!verts) {
        console.warn('Shape missing _verts:', s);
        return null;
      }
      // Store vertices relative to the shape's own center
      const localVerts = verts.map(v => ({ x: v.x - s.x, y: v.y - s.y }));

      return {
        type: s.type,
        relX: s.x - patternCx,
        relY: s.y - patternCy,
        rotation: s.rotation,
        localVerts, // Vertices relative to shape center - preserves actual geometry
      };
    }).filter(Boolean);

    const newPattern = {
      id: Date.now(),
      name,
      shapes: patternShapes,
    };

    setSavedPatterns(prev => [...prev, newPattern]);
    showToast(`Pattern "${name}" saved!`, 'success');
  }, [showToast]);

  // Delete a saved pattern
  const deletePattern = useCallback((patternId) => {
    setSavedPatterns(prev => prev.filter(p => p.id !== patternId));
    showToast('Pattern deleted', 'info');
  }, [showToast]);

  // Place a pattern on the canvas
  const placePattern = useCallback((pattern, worldX, worldY) => {
    const newShapes = pattern.shapes.map((ps, i) => {
      const shape = {
        id: Date.now() + i,
        type: ps.type,
        x: worldX + ps.relX,
        y: worldY + ps.relY,
        rotation: ps.rotation,
        building: buildingType, // Always use current building type
      };

      // Use saved local vertices if available (preserves exact geometry)
      if (ps.localVerts) {
        shape._verts = ps.localVerts.map(v => ({
          x: shape.x + v.x,
          y: shape.y + v.y,
        }));
      } else {
        // Fallback for old patterns without localVerts
        const rad = (shape.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const h = SHAPE_SIZE / 2;
        let defaultLocalVerts;

        if (shape.type === 'square' || shape.type === 'stair') {
          defaultLocalVerts = [
            { x: -h, y: -h }, { x: h, y: -h },
            { x: h, y: h }, { x: -h, y: h },
          ];
        } else if (shape.type === 'corner') {
          defaultLocalVerts = [
            { x: -h, y: -h }, { x: h, y: -h }, { x: -h, y: h },
          ];
        } else {
          const apexY = -TRI_HEIGHT * 2 / 3;
          const baseY = TRI_HEIGHT / 3;
          defaultLocalVerts = [
            { x: 0, y: apexY },
            { x: h, y: baseY },
            { x: -h, y: baseY },
          ];
        }

        shape._verts = defaultLocalVerts.map(v => ({
          x: shape.x + v.x * cos - v.y * sin,
          y: shape.y + v.x * sin + v.y * cos,
        }));
      }

      return shape;
    });

    saveToHistory();
    setShapes(prev => [...prev, ...newShapes]);
    showToast(`Placed "${pattern.name}"`, 'success');
  }, [buildingType, showToast, setShapes, saveToHistory]);

  // Check for saved state on mount
  useEffect(() => {
    // Don't show restore prompt if loading from URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('d')) return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        const hasContent = Object.values(state.allFloorShapes || {}).some(s => s.length > 0) ||
                          Object.values(state.allFloorItems || {}).some(i => i.length > 0);
        if (hasContent) {
          setShowRestorePrompt(true);
        }
      }
    } catch (e) {
      console.warn('Failed to check localStorage:', e);
    }
  }, []);

  // Restore state from localStorage
  const restoreFromLocalStorage = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.allFloorShapes) setAllFloorShapes(state.allFloorShapes);
        if (state.allFloorItems) setAllFloorItems(state.allFloorItems);
        if (state.currentFloor !== undefined) setCurrentFloor(state.currentFloor);
        if (state.buildingType) setBuildingType(state.buildingType);
        if (state.fiefMode !== undefined) setFiefMode(state.fiefMode);
        if (state.fiefType) setFiefType(state.fiefType);
        if (state.fiefWidth) setFiefWidth(state.fiefWidth);
        if (state.fiefHeight) setFiefHeight(state.fiefHeight);
        if (state.fiefPosition) setFiefPosition(state.fiefPosition);
        if (state.claimedAreas) setClaimedAreas(state.claimedAreas);
        if (state.stakesInventory !== undefined) setStakesInventory(state.stakesInventory);
        if (state.leftClickShape) setLeftClickShape(state.leftClickShape);
        if (state.rightClickShape) setRightClickShape(state.rightClickShape);
        if (state.middleClickAction) setMiddleClickAction(state.middleClickAction);
        if (state.gridEnabled !== undefined) setGridEnabled(state.gridEnabled);
        showToast('Design restored!', 'success');
      }
    } catch (e) {
      console.warn('Failed to restore from localStorage:', e);
      showToast('Failed to restore design', 'error');
    }
    setShowRestorePrompt(false);
  }, [showToast]);

  // Dismiss restore prompt (Start Fresh)
  const dismissRestorePrompt = useCallback(() => {
    setShowRestorePrompt(false);
    setSkipNextSave(true);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // =====================================================
  // SHARE FUNCTIONALITY
  // =====================================================
  // Load shared state from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedData = params.get('d');
    if (sharedData) {
      try {
        const decompressed = LZString.decompressFromEncodedURIComponent(sharedData);
        if (decompressed) {
          const state = JSON.parse(decompressed);

          // Type maps for different formats
          const typeFromCode = ['square', 'triangle', 'corner', 'stair'];
          const typeFromChar = { s: 'square', t: 'triangle', c: 'corner', st: 'stair' };
          const buildingFromCode = ['atreides', 'harkonnen', 'choamShelter', 'choamFacility'];
          const buildingFromChar = { a: 'atreides', h: 'harkonnen', cs: 'choamShelter', cf: 'choamFacility' };
          const shapeFromCode = ['square', 'triangle', 'corner', 'delete', 'stair'];
          const shapeFromChar = { s: 'square', t: 'triangle', c: 'corner', d: 'delete', st: 'stair' };
          const dirFromCode = ['top', 'bottom', 'left', 'right'];
          const dirFromChar = { t: 'top', b: 'bottom', l: 'left', r: 'right' };

          // Get default building type from state (for backward compatibility)
          const defaultBuilding = state.b !== undefined
            ? (typeof state.b === 'number' ? buildingFromCode[state.b] : buildingFromChar[state.b] || 'atreides')
            : 'atreides';

          // Helper to expand compressed shapes
          const expandCompressedShapes = (compressedShapes, startId = 0) => {
            if (!compressedShapes || compressedShapes.length === 0) return [];
            const isUltraCompact = Array.isArray(compressedShapes[0]);
            return compressedShapes.map((s, i) => {
              let type, verts = [], building = defaultBuilding;
              if (isUltraCompact) {
                type = typeFromCode[s[0]] || 'square';
                let vertStart = 1;
                if (s.length >= 2 && s[1] >= 0 && s[1] <= 3 && (s.length - 2) % 2 === 0) {
                  building = buildingFromCode[s[1]] || defaultBuilding;
                  vertStart = 2;
                }
                for (let j = vertStart; j < s.length; j += 2) {
                  verts.push({ x: s[j], y: s[j + 1] });
                }
              } else {
                type = typeFromChar[s.t] || 'square';
                if (s.b !== undefined) {
                  building = typeof s.b === 'number' ? buildingFromCode[s.b] : buildingFromChar[s.b] || defaultBuilding;
                }
                if (s.v && s.v.length >= 4) {
                  for (let j = 0; j < s.v.length; j += 2) {
                    verts.push({ x: s.v[j], y: s.v[j + 1] });
                  }
                }
              }
              const cx = verts.length > 0 ? verts.reduce((sum, v) => sum + v.x, 0) / verts.length : 0;
              const cy = verts.length > 0 ? verts.reduce((sum, v) => sum + v.y, 0) / verts.length : 0;
              let rotation = 0;
              if (verts.length >= 2) {
                if (type === 'square' || type === 'stair') {
                  const dx = verts[1].x - verts[0].x;
                  const dy = verts[1].y - verts[0].y;
                  rotation = (Math.atan2(dy, dx) * 180 / Math.PI) + 180;
                } else if (type === 'corner') {
                  const dx = verts[1].x - verts[0].x;
                  const dy = verts[1].y - verts[0].y;
                  rotation = Math.atan2(dy, dx) * 180 / Math.PI;
                } else {
                  const dx = verts[0].x - cx;
                  const dy = verts[0].y - cy;
                  rotation = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
                }
              }
              return { id: Date.now() + startId + i, type, x: cx, y: cy, rotation, building, _verts: verts };
            });
          };

          // Helper to expand compressed items
          const expandCompressedItems = (compressedItems, startId = 0) => {
            if (!compressedItems || compressedItems.length === 0) return [];
            return compressedItems.map((item, i) => ({
              id: Date.now() + startId + i,
              itemType: item[0],
              x: item[1],
              y: item[2],
            }));
          };

          // Check for multi-floor format first
          if (state.fs || state.fi) {
            // Multi-floor format
            const newFloorShapes = { 0: [] };
            const newFloorItems = { 0: [] };
            let idOffset = 0;

            if (state.fs) {
              for (const [floor, shapes] of Object.entries(state.fs)) {
                newFloorShapes[parseInt(floor)] = expandCompressedShapes(shapes, idOffset);
                idOffset += shapes.length;
              }
            }
            if (state.fi) {
              for (const [floor, items] of Object.entries(state.fi)) {
                newFloorItems[parseInt(floor)] = expandCompressedItems(items, 2000 + idOffset);
                idOffset += items.length;
              }
            }

            setAllFloorShapes(newFloorShapes);
            setAllFloorItems(newFloorItems);
            if (state.cf !== undefined) setCurrentFloor(state.cf);
          } else if (state.s && state.s.length > 0) {
            // Single floor format (backward compatible)
            const isUltraCompact = Array.isArray(state.s[0]);

            // Restore shapes from vertex data
            const expandedShapes = state.s.map((s, i) => {
              let type, verts = [], building = defaultBuilding;

              if (isUltraCompact) {
                // Ultra-compact: [typeCode, x1, y1, x2, y2, ...] or [typeCode, buildingCode, x1, y1, ...]
                type = typeFromCode[s[0]] || 'square';
                let vertStart = 1;
                // Check if second element is a building code (0-3) and we have odd number of remaining elements
                if (s.length >= 2 && s[1] >= 0 && s[1] <= 3 && (s.length - 2) % 2 === 0) {
                  building = buildingFromCode[s[1]] || defaultBuilding;
                  vertStart = 2;
                }
                for (let j = vertStart; j < s.length; j += 2) {
                  verts.push({ x: s[j], y: s[j + 1] });
                }
              } else {
                // Compact: {t: 's', v: [x1, y1, x2, y2, ...], b: 'a'}
                type = typeFromChar[s.t] || 'square';
                if (s.b !== undefined) {
                  building = typeof s.b === 'number' ? buildingFromCode[s.b] : buildingFromChar[s.b] || defaultBuilding;
                }
                if (s.v && s.v.length >= 4) {
                  for (let j = 0; j < s.v.length; j += 2) {
                    verts.push({ x: s.v[j], y: s.v[j + 1] });
                  }
                }
              }

              // Calculate centroid for x, y
              const cx = verts.length > 0 ? verts.reduce((sum, v) => sum + v.x, 0) / verts.length : 0;
              const cy = verts.length > 0 ? verts.reduce((sum, v) => sum + v.y, 0) / verts.length : 0;

              // Calculate rotation from vertices
              let rotation = 0;
              if (verts.length >= 2) {
                if (type === 'square' || type === 'stair') {
                  const dx = verts[1].x - verts[0].x;
                  const dy = verts[1].y - verts[0].y;
                  rotation = (Math.atan2(dy, dx) * 180 / Math.PI) + 180;
                } else if (type === 'corner') {
                  const dx = verts[1].x - verts[0].x;
                  const dy = verts[1].y - verts[0].y;
                  rotation = Math.atan2(dy, dx) * 180 / Math.PI;
                } else {
                  const dx = verts[0].x - cx;
                  const dy = verts[0].y - cy;
                  rotation = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
                }
              }

              return {
                id: Date.now() + i,
                type,
                x: cx,
                y: cy,
                rotation,
                building,
                _verts: verts,
              };
            });
            setShapes(expandedShapes);

            // Restore other settings (handle both numeric codes and char codes)
            if (state.b !== undefined) {
              setBuildingType(typeof state.b === 'number' ? buildingFromCode[state.b] : buildingFromChar[state.b] || 'atreides');
            }
            if (state.l !== undefined) {
              setLeftClickShape(typeof state.l === 'number' ? shapeFromCode[state.l] : shapeFromChar[state.l] || 'square');
            }
            if (state.r !== undefined) {
              setRightClickShape(typeof state.r === 'number' ? shapeFromCode[state.r] : shapeFromChar[state.r] || 'triangle');
            }
            if (state.m !== undefined) {
              // New format: middle click action (0=square, 1=triangle, 2=corner, 3=delete, 4=stair)
              const actionFromCode = ['square', 'triangle', 'corner', 'delete', 'stair'];
              setMiddleClickAction(actionFromCode[state.m] || 'delete');
            }
            if (state.fm !== undefined) setFiefMode(state.fm === 1);
            if (state.fx !== undefined && state.fy !== undefined) {
              setFiefPosition({ x: state.fx, y: state.fy });
            }
            if (state.ft !== undefined) setFiefType(state.ft === 1 || state.ft === 'a' ? 'advanced' : 'standard');
            if (state.fw) setFiefWidth(state.fw);
            if (state.fh) setFiefHeight(state.fh);
            if (state.fp !== undefined) setFiefPadding(state.fp);
            if (state.si !== undefined) setStakesInventory(state.si);
            if (state.ca && state.ca.length > 0) {
              const isUltraCompactClaimed = Array.isArray(state.ca[0]);
              const expandedClaimed = state.ca.map((a, i) => ({
                id: Date.now() + 1000 + i,
                direction: isUltraCompactClaimed ? dirFromCode[a[0]] : dirFromChar[a.d] || 'top',
                parentId: isUltraCompactClaimed ? (a[1] === 0 ? 'main' : a[1]) : (a.p === 'm' ? 'main' : a.p),
              }));
              setClaimedAreas(expandedClaimed);
            }

            // Restore placed items from URL
            if (state.pi && state.pi.length > 0) {
              const expandedItems = state.pi.map((item, i) => ({
                id: Date.now() + 2000 + i,
                itemType: item[0],
                x: item[1],
                y: item[2],
              }));
              setPlacedItems(expandedItems);
            }
          } else if (state.s && state.s.length === 0) {
            // Empty design
            setShapes([]);
          } else {
            // Old format - direct mapping
            if (state.shapes) setShapes(state.shapes);
            if (state.buildingType) setBuildingType(state.buildingType);
            if (state.leftClickShape) setLeftClickShape(state.leftClickShape);
            if (state.rightClickShape) setRightClickShape(state.rightClickShape);
            if (state.middleClickAction) setMiddleClickAction(state.middleClickAction);
            if (state.fiefMode !== undefined) setFiefMode(state.fiefMode);
            if (state.fiefType) setFiefType(state.fiefType);
            if (state.fiefWidth) setFiefWidth(state.fiefWidth);
            if (state.fiefHeight) setFiefHeight(state.fiefHeight);
            if (state.fiefPadding !== undefined) setFiefPadding(state.fiefPadding);
            if (state.stakesInventory !== undefined) setStakesInventory(state.stakesInventory);
            if (state.claimedAreas) setClaimedAreas(state.claimedAreas);
            if (state.placedItems) setPlacedItems(state.placedItems);
          }

          // Clear URL after loading
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch (e) {
        console.error('Failed to load shared design:', e);
      }
    }
  }, []);

  // Compress state for sharing (ultra-compact format)
  const getCompressedState = useCallback(() => {
    // Helper to compress shapes for a floor
    const compressShapes = (floorShapes) => floorShapes.map(s => {
      const verts = s._verts || [];
      const typeCode = s.type === 'square' ? 0 : s.type === 'triangle' ? 1 : s.type === 'corner' ? 2 : s.type === 'stair' ? 3 : 0;
      const buildingCode = s.building === 'atreides' ? 0 : s.building === 'harkonnen' ? 1 : s.building === 'choamShelter' ? 2 : s.building === 'choamFacility' ? 3 : 0;
      return [typeCode, buildingCode, ...verts.flatMap(pt => [Math.round(pt.x), Math.round(pt.y)])];
    });

    // Helper to compress items for a floor
    const compressItems = (floorItems) => floorItems.map(item => [
      item.itemType,
      Math.round(item.x),
      Math.round(item.y),
    ]);

    // Minimal claimed areas as arrays [direction, parentId]
    const minClaimed = claimedAreas.map(a => [
      a.direction === 'top' ? 0 : a.direction === 'bottom' ? 1 : a.direction === 'left' ? 2 : 3,
      a.parentId === 'main' ? 0 : a.parentId,
    ]);

    // Check if we have multiple floors with data
    const floorsWithShapes = Object.entries(allFloorShapes).filter(([_, s]) => s.length > 0);
    const floorsWithItems = Object.entries(allFloorItems).filter(([_, i]) => i.length > 0);
    const hasMultipleFloors = floorsWithShapes.length > 1 || floorsWithItems.length > 1 ||
      floorsWithShapes.some(([f]) => f !== '0') || floorsWithItems.some(([f]) => f !== '0');

    // Build state object
    const state = {};

    if (hasMultipleFloors) {
      // Multi-floor format: fs = {floorNum: shapes}, fi = {floorNum: items}
      const fs = {};
      const fi = {};
      for (const [floor, floorShapes] of Object.entries(allFloorShapes)) {
        if (floorShapes.length > 0) {
          fs[floor] = compressShapes(floorShapes);
        }
      }
      for (const [floor, floorItems] of Object.entries(allFloorItems)) {
        if (floorItems.length > 0) {
          fi[floor] = compressItems(floorItems);
        }
      }
      if (Object.keys(fs).length > 0) state.fs = fs;
      if (Object.keys(fi).length > 0) state.fi = fi;
      if (currentFloor !== 0) state.cf = currentFloor;
    } else {
      // Single floor format (backward compatible)
      state.s = compressShapes(allFloorShapes[0] || []);
      if ((allFloorItems[0] || []).length > 0) {
        state.pi = compressItems(allFloorItems[0]);
      }
    }

    // Building type: 0=atreides, 1=harkonnen, 2=choamShelter, 3=choamFacility
    const btCode = buildingType === 'atreides' ? 0 : buildingType === 'harkonnen' ? 1 : buildingType === 'choamShelter' ? 2 : 3;
    if (btCode !== 0) state.b = btCode;

    // Only include if different from defaults
    const shapeToCode = { square: 0, triangle: 1, corner: 2, delete: 3, stair: 4 };
    if (leftClickShape !== 'square') state.l = shapeToCode[leftClickShape];
    if (rightClickShape !== 'triangle') state.r = shapeToCode[rightClickShape];
    if (middleClickAction !== 'delete') state.m = shapeToCode[middleClickAction];
    if (fiefMode && fiefPosition) {
      state.fm = 1;
      state.fx = Math.round(fiefPosition.x);
      state.fy = Math.round(fiefPosition.y);
      if (fiefType !== 'standard') state.ft = 1;
      if (fiefWidth !== FIEF_DEFAULTS[fiefType].width) state.fw = fiefWidth;
      if (fiefHeight !== FIEF_DEFAULTS[fiefType].height) state.fh = fiefHeight;
      if (fiefPadding !== 0) state.fp = Math.round(fiefPadding * 10) / 10;
      if (stakesInventory !== MAX_STAKES) state.si = stakesInventory;
      if (minClaimed.length > 0) state.ca = minClaimed;
    }

    return LZString.compressToEncodedURIComponent(JSON.stringify(state));
  }, [allFloorShapes, allFloorItems, currentFloor, buildingType, leftClickShape, rightClickShape, middleClickAction, fiefMode, fiefPosition, fiefType, fiefWidth, fiefHeight, fiefPadding, stakesInventory, claimedAreas]);

  // Generate and copy share link
  const handleCopyLink = useCallback(() => {
    const compressed = getCompressedState();
    const url = `${window.location.origin}${window.location.pathname}?d=${compressed}`;

    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy link:', err);
      prompt('Copy this link:', url);
    });
  }, [getCompressedState]);

  // Generate share URL
  const generateShareUrl = useCallback(() => {
    const compressed = getCompressedState();
    return `${window.location.origin}${window.location.pathname}?d=${compressed}`;
  }, [getCompressedState]);

  // Check if URL exceeds Discord's 2048 character limit
  useEffect(() => {
    const url = generateShareUrl();
    setUrlTooLong(url.length > 2048);
  }, [generateShareUrl]);

  // Update fief dimensions when type changes
  useEffect(() => {
    setFiefWidth(FIEF_DEFAULTS[fiefType].width);
    setFiefHeight(FIEF_DEFAULTS[fiefType].height);
  }, [fiefType]);

  // Reset stakes when fief mode is disabled
  useEffect(() => {
    if (!fiefMode) {
      setStakesInventory(MAX_STAKES);
      setPlacedStakes([]);
      setClaimedAreas([]);
      setDraggingStake(null);
      setStakeDropZone(null);
    }
  }, [fiefMode]);

  // Sync Item Mode with sidebar open state
  useEffect(() => {
    setItemMode(itemSidebarOpen);
    if (itemSidebarOpen) {
      // Disable Lock Mode when entering Item Mode
      setIsLocked(false);
      setHoveredGroup([]);
      setIsDraggingGroup(false);
      setIsRotatingGroup(false);
    }
    // Clear item selection when closing sidebar
    if (!itemSidebarOpen) {
      setSelectedItemId(null);
      setIsDraggingPlacedItem(false);
    }
  }, [itemSidebarOpen]);

  // Stake countdown timer
  useEffect(() => {
    if (placedStakes.length === 0) return;

    const interval = setInterval(() => {
      setPlacedStakes(prev => {
        const updated = prev.map(stake => {
          if (stake.claimed) return stake;
          const newCountdown = stake.countdown - 0.1;
          if (newCountdown <= 0) {
            // Claim the stake
            setClaimedAreas(areas => [...areas, {
              id: stake.id,
              direction: stake.direction,
              parentId: stake.parentId,
            }]);
            return { ...stake, countdown: 0, claimed: true };
          }
          return { ...stake, countdown: newCountdown };
        });
        // Remove claimed stakes from placed stakes
        return updated.filter(s => !s.claimed);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [placedStakes.length]);

  // =====================================================
  // COORDINATE CONVERSION
  // =====================================================
  const screenToWorld = useCallback((screenX, screenY) => ({
    x: (screenX - pan.x) / zoom,
    y: (screenY - pan.y) / zoom,
  }), [zoom, pan]);

  // =====================================================
  // GRID SNAP FUNCTIONS
  // =====================================================
  // Snap vertices to grid so shape edges align with grid lines
  // Grid lines are at 0, 50, 100, ... so centroid should be at 25, 75, 125, ... (cell centers)
  // force=true bypasses the gridEnabled check (used for first shape placement)
  const snapVerticesToGrid = useCallback((verts, force = false) => {
    if ((!gridEnabled && !force) || verts.length === 0) return verts;

    // Calculate current centroid
    const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
    const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;

    // Snap centroid to cell center so edges align with grid lines
    const halfCell = CELL_SIZE / 2;
    const snappedCx = Math.round((cx - halfCell) / CELL_SIZE) * CELL_SIZE + halfCell;
    const snappedCy = Math.round((cy - halfCell) / CELL_SIZE) * CELL_SIZE + halfCell;

    // Calculate offset and apply to all vertices
    const dx = snappedCx - cx;
    const dy = snappedCy - cy;
    return verts.map(v => ({ x: v.x + dx, y: v.y + dy }));
  }, [gridEnabled]);

  // Snap a group's bounding box to grid lines
  const snapGroupBoundingBoxToGrid = useCallback((transformedShapes) => {
    if (!gridEnabled || transformedShapes.length === 0) return transformedShapes;

    // Calculate bounding box of all shapes
    let minX = Infinity, minY = Infinity;
    for (const shape of transformedShapes) {
      for (const v of shape.newVerts) {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
      }
    }

    // Snap the bounding box corner to nearest grid intersection
    const snappedMinX = Math.round(minX / CELL_SIZE) * CELL_SIZE;
    const snappedMinY = Math.round(minY / CELL_SIZE) * CELL_SIZE;

    // Calculate offset needed
    const dx = snappedMinX - minX;
    const dy = snappedMinY - minY;

    // Apply offset to all shapes
    return transformedShapes.map(shape => ({
      ...shape,
      newVerts: shape.newVerts.map(v => ({ x: v.x + dx, y: v.y + dy }))
    }));
  }, [gridEnabled]);

  // =====================================================
  // FIEF AREA CALCULATIONS
  // Canvas center for fief positioning
  // =====================================================
  const canvasCenter = { x: 450, y: 300 }; // SVG center

  // Calculate all buildable areas (main fief + claimed stakes)
  const getBuildableAreas = useCallback(() => {
    if (!fiefMode || !fiefPosition) return [];

    const areas = [];
    const fiefW = fiefWidth * CELL_SIZE;
    const fiefH = fiefHeight * CELL_SIZE;

    // Main fief area - positioned where user placed it
    const mainFief = {
      id: 'main',
      x: fiefPosition.x,
      y: fiefPosition.y,
      width: fiefW,
      height: fiefH,
    };
    areas.push(mainFief);

    // Build a map of areas by ID for chaining
    const areaMap = { main: mainFief };

    // Add claimed areas
    for (const claim of claimedAreas) {
      const parent = areaMap[claim.parentId];
      if (!parent) continue;

      let newArea;
      switch (claim.direction) {
        case 'top':
          newArea = {
            id: claim.id,
            x: parent.x,
            y: parent.y - fiefH,
            width: fiefW,
            height: fiefH,
          };
          break;
        case 'bottom':
          newArea = {
            id: claim.id,
            x: parent.x,
            y: parent.y + parent.height,
            width: fiefW,
            height: fiefH,
          };
          break;
        case 'left':
          newArea = {
            id: claim.id,
            x: parent.x - fiefW,
            y: parent.y,
            width: fiefW,
            height: fiefH,
          };
          break;
        case 'right':
          newArea = {
            id: claim.id,
            x: parent.x + parent.width,
            y: parent.y,
            width: fiefW,
            height: fiefH,
          };
          break;
        default:
          continue;
      }
      areas.push(newArea);
      areaMap[claim.id] = newArea;
    }

    // Add pending stakes (not yet claimed) for drop zone calculation
    for (const stake of placedStakes) {
      const parent = areaMap[stake.parentId];
      if (!parent) continue;

      let pendingArea;
      switch (stake.direction) {
        case 'top':
          pendingArea = { id: stake.id, x: parent.x, y: parent.y - fiefH, width: fiefW, height: fiefH };
          break;
        case 'bottom':
          pendingArea = { id: stake.id, x: parent.x, y: parent.y + parent.height, width: fiefW, height: fiefH };
          break;
        case 'left':
          pendingArea = { id: stake.id, x: parent.x - fiefW, y: parent.y, width: fiefW, height: fiefH };
          break;
        case 'right':
          pendingArea = { id: stake.id, x: parent.x + parent.width, y: parent.y, width: fiefW, height: fiefH };
          break;
        default:
          continue;
      }
      areaMap[stake.id] = pendingArea;
    }

    return { areas, areaMap };
  }, [fiefMode, fiefPosition, fiefWidth, fiefHeight, claimedAreas, placedStakes]);

  // Check if a point is inside any buildable area (with padding to EXPAND the area)
  const isPointInBuildableArea = useCallback((px, py) => {
    if (!fiefMode) return true; // No restriction when fief mode is off

    const { areas } = getBuildableAreas();
    const paddingFraction = fiefPadding / 100;

    for (const area of areas) {
      // Calculate padding in pixels to EXPAND this area outward
      const padX = area.width * paddingFraction;
      const padY = area.height * paddingFraction;

      // Check if point is inside the expanded area
      if (px >= area.x - padX && px <= area.x + area.width + padX &&
          py >= area.y - padY && py <= area.y + area.height + padY) {
        return true;
      }
    }
    return false;
  }, [fiefMode, getBuildableAreas, fiefPadding]);

  // Check if all vertices of a shape are inside buildable area
  const isShapeInBuildableArea = useCallback((verts) => {
    if (!fiefMode) return true;
    return verts.every(v => isPointInBuildableArea(v.x, v.y));
  }, [fiefMode, isPointInBuildableArea]);

  // Check if item position is within buildable area (for fief mode)
  const isItemInBuildableArea = useCallback((x, y, itemDef) => {
    if (!fiefMode) return true;
    const itemWidth = (itemDef.size?.width || 1) * ITEM_GRID_SIZE;
    const itemHeight = (itemDef.size?.height || 1) * ITEM_GRID_SIZE;
    // Check all four corners of the item
    const corners = [
      { x, y },
      { x: x + itemWidth, y },
      { x, y: y + itemHeight },
      { x: x + itemWidth, y: y + itemHeight },
    ];
    return corners.every(corner => isPointInBuildableArea(corner.x, corner.y));
  }, [fiefMode, isPointInBuildableArea]);

  // Check if an item overlaps with any existing placed items
  const doesItemOverlap = useCallback((x, y, itemDef, excludeItemId = null) => {
    const newWidth = (itemDef.size?.width || 1) * ITEM_GRID_SIZE;
    const newHeight = (itemDef.size?.height || 1) * ITEM_GRID_SIZE;

    for (const placed of placedItems) {
      // Skip the item we're moving (if any)
      if (excludeItemId && placed.id === excludeItemId) continue;

      const placedDef = BASE_ITEMS[placed.itemType];
      if (!placedDef) continue;

      const placedWidth = (placedDef.size?.width || 1) * ITEM_GRID_SIZE;
      const placedHeight = (placedDef.size?.height || 1) * ITEM_GRID_SIZE;

      // Check for rectangle overlap
      const noOverlap =
        x + newWidth <= placed.x ||      // new item is to the left
        x >= placed.x + placedWidth ||   // new item is to the right
        y + newHeight <= placed.y ||     // new item is above
        y >= placed.y + placedHeight;    // new item is below

      if (!noOverlap) {
        return true; // Items overlap
      }
    }
    return false; // No overlap
  }, [placedItems]);

  // Get available drop zones for stakes
  const getStakeDropZones = useCallback(() => {
    if (!fiefMode) return [];

    const { areas, areaMap } = getBuildableAreas();
    const dropZones = [];
    const occupiedPositions = new Set();

    // Mark all occupied positions
    for (const area of areas) {
      occupiedPositions.add(`${area.x},${area.y}`);
    }
    for (const stake of placedStakes) {
      const parent = areaMap[stake.parentId];
      if (parent) {
        switch (stake.direction) {
          case 'top': occupiedPositions.add(`${parent.x},${parent.y - fiefHeight * CELL_SIZE}`); break;
          case 'bottom': occupiedPositions.add(`${parent.x},${parent.y + parent.height}`); break;
          case 'left': occupiedPositions.add(`${parent.x - fiefWidth * CELL_SIZE},${parent.y}`); break;
          case 'right': occupiedPositions.add(`${parent.x + parent.width},${parent.y}`); break;
        }
      }
    }

    // Find available positions around each area
    const fiefW = fiefWidth * CELL_SIZE;
    const fiefH = fiefHeight * CELL_SIZE;

    for (const area of areas) {
      const directions = [
        { dir: 'top', x: area.x, y: area.y - fiefH },
        { dir: 'bottom', x: area.x, y: area.y + area.height },
        { dir: 'left', x: area.x - fiefW, y: area.y },
        { dir: 'right', x: area.x + area.width, y: area.y },
      ];

      for (const d of directions) {
        const posKey = `${d.x},${d.y}`;
        if (!occupiedPositions.has(posKey)) {
          dropZones.push({
            parentId: area.id,
            direction: d.dir,
            x: d.x,
            y: d.y,
            width: fiefW,
            height: fiefH,
          });
          occupiedPositions.add(posKey); // Prevent duplicate zones
        }
      }
    }

    return dropZones;
  }, [fiefMode, getBuildableAreas, placedStakes, fiefWidth, fiefHeight]);

  // =====================================================
  // COLLISION POLYGON FOR CORNERS
  // Creates collision vertices based on corner style
  // =====================================================
  const getCornerCollisionVerts = useCallback((corner, end1, end2, cornerStyle = 'round') => {
    if (cornerStyle === 'diagonal') {
      // Clipped diagonal - small flats parallel to opposite edges
      const d1x = end1.x - corner.x;
      const d1y = end1.y - corner.y;
      const d2x = end2.x - corner.x;
      const d2y = end2.y - corner.y;

      // From end1, go in d2 direction (parallel to edge 2)
      const flat1End = {
        x: end1.x + d2x * DIAGONAL_FLAT_RATIO,
        y: end1.y + d2y * DIAGONAL_FLAT_RATIO,
      };
      // From end2, go in d1 direction (parallel to edge 1)
      const flat2Start = {
        x: end2.x + d1x * DIAGONAL_FLAT_RATIO,
        y: end2.y + d1y * DIAGONAL_FLAT_RATIO,
      };

      return [corner, end1, flat1End, flat2Start, end2];
    }

    if (cornerStyle === 'stepped') {
      // Stepped/staircase pattern
      const d1x = end1.x - corner.x;
      const d1y = end1.y - corner.y;
      const d2x = end2.x - corner.x;
      const d2y = end2.y - corner.y;

      const points = [corner, end1];
      let currentX = end1.x;
      let currentY = end1.y;

      for (let i = 0; i < CORNER_STEPS; i++) {
        // Move toward end2 direction
        currentX += d2x / CORNER_STEPS;
        currentY += d2y / CORNER_STEPS;
        points.push({ x: currentX, y: currentY });

        // Move toward corner (negative d1 direction)
        currentX -= d1x / CORNER_STEPS;
        currentY -= d1y / CORNER_STEPS;
        points.push({ x: currentX, y: currentY });
      }

      return points;
    }

    // Round corner (default) - arc approximation
    const angle1 = Math.atan2(end1.y - corner.y, end1.x - corner.x);
    const angle2 = Math.atan2(end2.y - corner.y, end2.x - corner.x);

    let angleDiff = angle2 - angle1;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    const arcPoints = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const angle = angle1 + t * angleDiff;
      arcPoints.push({
        x: corner.x + Math.cos(angle) * SHAPE_SIZE,
        y: corner.y + Math.sin(angle) * SHAPE_SIZE,
      });
    }

    return [corner, ...arcPoints];
  }, []);

  // =====================================================
  // VERTEX CALCULATIONS
  // =====================================================
  const getVertices = useCallback((shape) => {
    const { x, y, type, rotation } = shape;
    const rad = (rotation * Math.PI) / 180;

    let localVerts;
    if (type === 'square' || type === 'stair') {
      const h = SHAPE_SIZE / 2;
      localVerts = [
        { x: -h, y: -h }, { x: h, y: -h },
        { x: h, y: h }, { x: -h, y: h },
      ];
    } else if (type === 'corner') {
      const h = SHAPE_SIZE / 2;
      localVerts = [
        { x: -h, y: -h },  // corner vertex
        { x: h, y: -h },   // end of edge 1
        { x: -h, y: h },   // end of edge 2
      ];
    } else {
      const apexY = -TRI_HEIGHT * 2 / 3;
      const baseY = TRI_HEIGHT / 3;
      localVerts = [
        { x: 0, y: apexY },
        { x: SHAPE_SIZE / 2, y: baseY },
        { x: -SHAPE_SIZE / 2, y: baseY },
      ];
    }

    return localVerts.map(v => ({
      x: x + v.x * Math.cos(rad) - v.y * Math.sin(rad),
      y: y + v.x * Math.sin(rad) + v.y * Math.cos(rad),
    }));
  }, []);

  // Snap a group to external vertices (vertex-to-vertex snapping for perfect tessellation)
  const snapGroupToEdges = useCallback((transformedShapes, groupIds) => {
    if (transformedShapes.length === 0) return transformedShapes;

    // Get all vertices from shapes NOT in the group
    const externalVertices = [];
    for (const shape of shapes) {
      if (groupIds.includes(shape.id)) continue;
      const verts = shape._verts || getVertices(shape);
      for (const v of verts) {
        externalVertices.push({ x: v.x, y: v.y });
      }
    }

    if (externalVertices.length === 0) return transformedShapes;

    // Collect all vertices from the group
    const groupVertices = [];
    for (const shape of transformedShapes) {
      for (const v of shape.newVerts) {
        groupVertices.push(v);
      }
    }

    // Find the closest external vertex to any group vertex
    let bestSnap = null;
    let minDist = SNAP_THRESHOLD;

    for (const gv of groupVertices) {
      for (const ev of externalVertices) {
        const dist = Math.sqrt((gv.x - ev.x) ** 2 + (gv.y - ev.y) ** 2);
        if (dist < minDist) {
          minDist = dist;
          bestSnap = {
            dx: ev.x - gv.x,
            dy: ev.y - gv.y
          };
        }
      }
    }

    // If we found a snap, apply it to all shapes
    if (bestSnap) {
      return transformedShapes.map(shape => ({
        ...shape,
        newVerts: shape.newVerts.map(v => ({
          x: v.x + bestSnap.dx,
          y: v.y + bestSnap.dy
        }))
      }));
    }

    return transformedShapes;
  }, [shapes, getVertices]);

  // =====================================================
  // CONNECTED GROUP DETECTION (for lock mode)
  // =====================================================

  // Check if two shapes share an edge (not just a point)
  const shapesShareEdge = useCallback((shape1, shape2) => {
    const verts1 = shape1._verts || getVertices(shape1);
    const verts2 = shape2._verts || getVertices(shape2);
    const tolerance = EDGE_TOLERANCE * 2;

    // For each edge of shape1, check if it overlaps with any edge of shape2
    for (let i = 0; i < verts1.length; i++) {
      const a1 = verts1[i];
      const a2 = verts1[(i + 1) % verts1.length];

      for (let j = 0; j < verts2.length; j++) {
        const b1 = verts2[j];
        const b2 = verts2[(j + 1) % verts2.length];

        // Check if edges share at least 2 points (endpoints match within tolerance)
        const a1MatchesB1 = Math.hypot(a1.x - b1.x, a1.y - b1.y) < tolerance;
        const a1MatchesB2 = Math.hypot(a1.x - b2.x, a1.y - b2.y) < tolerance;
        const a2MatchesB1 = Math.hypot(a2.x - b1.x, a2.y - b1.y) < tolerance;
        const a2MatchesB2 = Math.hypot(a2.x - b2.x, a2.y - b2.y) < tolerance;

        // Edges share if endpoints match (in either direction)
        if ((a1MatchesB1 && a2MatchesB2) || (a1MatchesB2 && a2MatchesB1)) {
          return true;
        }
      }
    }
    return false;
  }, [getVertices]);

  // Find all shapes connected to a given shape (flood-fill)
  const findConnectedGroup = useCallback((startShape) => {
    const group = new Set([startShape.id]);
    const queue = [startShape];

    while (queue.length > 0) {
      const current = queue.shift();

      for (const other of shapes) {
        if (group.has(other.id)) continue;

        if (shapesShareEdge(current, other)) {
          group.add(other.id);
          queue.push(other);
        }
      }
    }

    return Array.from(group);
  }, [shapes, shapesShareEdge]);

  // Get shapes by their IDs
  const getShapesByIds = useCallback((ids) => {
    return shapes.filter(s => ids.includes(s.id));
  }, [shapes]);

  // Calculate centroid of a group of shapes
  const getGroupCentroid = useCallback((groupShapes) => {
    if (groupShapes.length === 0) return { x: 0, y: 0 };

    let totalX = 0, totalY = 0, totalVerts = 0;
    for (const shape of groupShapes) {
      const verts = shape._verts || getVertices(shape);
      for (const v of verts) {
        totalX += v.x;
        totalY += v.y;
        totalVerts++;
      }
    }
    return { x: totalX / totalVerts, y: totalY / totalVerts };
  }, [getVertices]);

  // Transform vertices by offset (for dragging)
  const offsetVertices = useCallback((verts, dx, dy) => {
    return verts.map(v => ({ x: v.x + dx, y: v.y + dy }));
  }, []);

  // Rotate vertices around a center point
  const rotateVertsAroundPoint = useCallback((verts, cx, cy, angleDeg) => {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return verts.map(v => ({
      x: cx + (v.x - cx) * cos - (v.y - cy) * sin,
      y: cy + (v.x - cx) * sin + (v.y - cy) * cos,
    }));
  }, []);

  // Send to Discord webhook
  const handleSendToDiscord = useCallback(async () => {
    if (!webhookUrl || shapes.length === 0) return;

    // Clean and validate webhook URL
    const cleanUrl = webhookUrl.trim();
    if (!cleanUrl.includes('discord.com/api/webhooks/') && !cleanUrl.includes('discordapp.com/api/webhooks/')) {
      alert('Invalid webhook URL. It should look like:\nhttps://discord.com/api/webhooks/...');
      return;
    }

    setSendingToDiscord(true);
    try {
      // Generate share URL
      const shareUrl = generateShareUrl();

      // Prepare stats
      const currentBuilding = BUILDING_TYPES[buildingType];
      const sqCount = shapes.filter(s => s.type === 'square').length;
      const triCount = shapes.filter(s => s.type === 'triangle').length;
      const cornCount = shapes.filter(s => s.type === 'corner').length;
      const stairCount = shapes.filter(s => s.type === 'stair').length;

      // Calculate costs per material type
      const exportMaterialCosts = shapes.reduce((acc, shape) => {
        const shapeBuilding = BUILDING_TYPES[shape.building] || BUILDING_TYPES.atreides;
        const material = shapeBuilding.material;
        acc[material] = (acc[material] || 0) + shapeBuilding.cost;
        return acc;
      }, {});
      const exportPlastoneCost = exportMaterialCosts.plastone || 0;
      const exportGraniteCost = exportMaterialCosts.granite || 0;

      // Create a clean SVG for export
      const svgNS = 'http://www.w3.org/2000/svg';
      const exportSvg = document.createElementNS(svgNS, 'svg');
      exportSvg.setAttribute('width', '900');
      exportSvg.setAttribute('height', '600');
      exportSvg.setAttribute('xmlns', svgNS);

      // Background
      const bg = document.createElementNS(svgNS, 'rect');
      bg.setAttribute('width', '900');
      bg.setAttribute('height', '600');
      bg.setAttribute('fill', '#1e293b');
      exportSvg.appendChild(bg);

      // Create a group for transformed content
      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('transform', `translate(${pan.x}, ${pan.y}) scale(${zoom})`);

      // Add fief areas if enabled
      if (fiefMode) {
        const { areas } = getBuildableAreas();
        const paddingFraction = fiefPadding / 100;

        for (const area of areas) {
          const padX = area.width * paddingFraction;
          const padY = area.height * paddingFraction;

          const baseRect = document.createElementNS(svgNS, 'rect');
          baseRect.setAttribute('x', String(area.x));
          baseRect.setAttribute('y', String(area.y));
          baseRect.setAttribute('width', String(area.width));
          baseRect.setAttribute('height', String(area.height));
          baseRect.setAttribute('fill', 'rgba(34, 197, 94, 0.1)');
          baseRect.setAttribute('stroke', 'rgba(34, 197, 94, 0.3)');
          baseRect.setAttribute('stroke-width', '2');
          baseRect.setAttribute('stroke-dasharray', '8,4');
          g.appendChild(baseRect);

          const expandRect = document.createElementNS(svgNS, 'rect');
          expandRect.setAttribute('x', String(area.x - padX));
          expandRect.setAttribute('y', String(area.y - padY));
          expandRect.setAttribute('width', String(area.width + padX * 2));
          expandRect.setAttribute('height', String(area.height + padY * 2));
          expandRect.setAttribute('fill', 'rgba(34, 197, 94, 0.15)');
          expandRect.setAttribute('stroke', 'rgba(34, 197, 94, 0.5)');
          expandRect.setAttribute('stroke-width', '1');
          g.appendChild(expandRect);
        }
      }

      // Add shapes
      for (const shape of shapes) {
        const verts = shape._verts || getVertices(shape);
        const shapeBuilding = shape.building || 'atreides';
        const cStyle = BUILDING_TYPES[shapeBuilding]?.cornerStyle || 'round';
        const colors = COLOR_SCHEMES[shapeBuilding]?.[shape.type] || COLOR_SCHEMES.atreides[shape.type];

        if (shape.type === 'corner') {
          const [corner, end1, end2] = verts;
          const v1x = end1.x - corner.x, v1y = end1.y - corner.y;
          const v2x = end2.x - corner.x, v2y = end2.y - corner.y;

          let pathD;
          if (cStyle === 'diagonal') {
            const flat1End = { x: end1.x + v2x * DIAGONAL_FLAT_RATIO, y: end1.y + v2y * DIAGONAL_FLAT_RATIO };
            const flat2Start = { x: end2.x + v1x * DIAGONAL_FLAT_RATIO, y: end2.y + v1y * DIAGONAL_FLAT_RATIO };
            pathD = `M ${corner.x} ${corner.y} L ${end1.x} ${end1.y} L ${flat1End.x} ${flat1End.y} L ${flat2Start.x} ${flat2Start.y} L ${end2.x} ${end2.y} Z`;
          } else if (cStyle === 'stepped') {
            let pathPoints = `M ${corner.x} ${corner.y} L ${end1.x} ${end1.y}`;
            let currentX = end1.x, currentY = end1.y;
            for (let i = 0; i < CORNER_STEPS; i++) {
              currentX += v2x / CORNER_STEPS; currentY += v2y / CORNER_STEPS;
              pathPoints += ` L ${currentX} ${currentY}`;
              currentX -= v1x / CORNER_STEPS; currentY -= v1y / CORNER_STEPS;
              pathPoints += ` L ${currentX} ${currentY}`;
            }
            pathD = pathPoints + ' Z';
          } else {
            const cross = v1x * v2y - v1y * v2x;
            const sweepFlag = cross > 0 ? 1 : 0;
            pathD = `M ${corner.x} ${corner.y} L ${end1.x} ${end1.y} A ${SHAPE_SIZE} ${SHAPE_SIZE} 0 0 ${sweepFlag} ${end2.x} ${end2.y} Z`;
          }

          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', pathD);
          path.setAttribute('fill', colors.fill);
          path.setAttribute('stroke', '#0f172a');
          path.setAttribute('stroke-width', '1.5');
          g.appendChild(path);
        } else {
          const polygon = document.createElementNS(svgNS, 'polygon');
          polygon.setAttribute('points', verts.map(v => `${v.x},${v.y}`).join(' '));
          polygon.setAttribute('fill', colors.fill);
          polygon.setAttribute('stroke', '#0f172a');
          polygon.setAttribute('stroke-width', '1.5');
          g.appendChild(polygon);
        }
      }

      exportSvg.appendChild(g);

      // Convert SVG to PNG using canvas
      const svgString = new XMLSerializer().serializeToString(exportSvg);
      // Properly encode UTF-8 to base64 (replaces deprecated unescape())
      const svgBase64 = btoa(encodeURIComponent(svgString).replace(/%([0-9A-F]{2})/g,
        (match, p1) => String.fromCharCode(parseInt(p1, 16))));
      const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;

      // Create image and canvas
      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create canvas context');
      }
      ctx.drawImage(img, 0, 0);

      // Get blob from canvas
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });

      if (!blob) {
        throw new Error('Failed to create image blob');
      }

      // Create form data for Discord
      const formData = new FormData();

      // Build description lines
      const costParts = [];
      if (exportPlastoneCost > 0) costParts.push(`${exportPlastoneCost.toLocaleString()} plastone`);
      if (exportGraniteCost > 0) costParts.push(`${exportGraniteCost.toLocaleString()} granite`);
      const costString = costParts.length > 0 ? costParts.join(' + ') : '0';

      const descLines = [
        `**Building Style:** ${currentBuilding.label}`,
        `**Pieces:** ${shapes.length} total`,
        `  • ${sqCount} squares, ${triCount} triangles, ${cornCount} corners, ${stairCount} stairs`,
        `**Material Cost:** ${costString}`,
      ];
      if (fiefMode) {
        const stakesUsed = MAX_STAKES - stakesInventory;
        descLines.push(`**Fief:** ${fiefType} (${fiefWidth}x${fiefHeight})`);
        descLines.push(`**Stakes Used:** ${stakesUsed}/${MAX_STAKES}`);
      }

      // Discord embed URL limit is 2048 chars
      const canIncludeUrl = shareUrl.length <= 2048;

      const embed = {
        title: canIncludeUrl ? 'Open this design in the planner' : 'Dune Base Design',
        description: descLines.join('\n'),
        color: 0xf59e0b,
        image: { url: 'attachment://design.png' },
        footer: { text: canIncludeUrl ? 'Dune: Awakening Base Planner' : 'Design too complex for share link - use Copy Link button instead' }
      };

      // Only add URL if it's within Discord's limit
      if (canIncludeUrl) {
        embed.url = shareUrl;
      }

      const payload = { embeds: [embed] };

      formData.append('payload_json', JSON.stringify(payload));
      formData.append('files[0]', blob, 'design.png');

      // Send to Discord
      const response = await fetch(cleanUrl, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setDiscordSent(true);
        setTimeout(() => setDiscordSent(false), 2000);
      } else {
        const text = await response.text();
        throw new Error(`Discord error ${response.status}: ${text}`);
      }
    } catch (err) {
      console.error('Failed to send to Discord:', err);
      alert('Failed to send to Discord: ' + err.message);
    } finally {
      setSendingToDiscord(false);
    }
  }, [webhookUrl, shapes, pan, zoom, fiefMode, fiefPadding, buildingType, fiefType, fiefWidth, fiefHeight, stakesInventory, generateShareUrl, getBuildableAreas, getVertices]);

  const getCollisionVertices = useCallback((shape) => {
    const verts = shape._verts || getVertices(shape);
    if (shape.type === 'corner') {
      // Use the shape's own building type for collision detection
      const shapeBuilding = shape.building || 'atreides';
      const style = BUILDING_TYPES[shapeBuilding]?.cornerStyle || 'round';
      return getCornerCollisionVerts(verts[0], verts[1], verts[2], style);
    }
    return verts;
  }, [getVertices, getCornerCollisionVerts]);

  // =====================================================
  // EDGE CALCULATIONS WITH CORRECT OUTWARD NORMALS
  // For corners, we compute normals that point AWAY from the arc
  // =====================================================
  const getShapeEdges = useCallback((shape) => {
    const verts = shape._verts || getVertices(shape);
    const edges = [];

    if (shape.type === 'corner') {
      const [cornerV, end1, end2] = verts;

      // Edge A: corner → end1
      // Normal should point AWAY from end2 (toward exterior)
      {
        const dx = end1.x - cornerV.x;
        const dy = end1.y - cornerV.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0.001) {
          const ux = dx / len, uy = dy / len;
          let nx = uy, ny = -ux; // default normal (perpendicular, rotated CW)

          // Check if normal points toward end2 (interior)
          const midX = (cornerV.x + end1.x) / 2;
          const midY = (cornerV.y + end1.y) / 2;
          const toEnd2X = end2.x - midX;
          const toEnd2Y = end2.y - midY;

          // If normal points toward end2, flip it
          if (nx * toEnd2X + ny * toEnd2Y > 0) {
            nx = -nx; ny = -ny;
          }

          edges.push({
            v1: { ...cornerV }, v2: { ...end1 },
            midX, midY, ux, uy, nx, ny, length: len,
            shapeId: shape.id, edgeIndex: 0,
          });
        }
      }

      // Edge B: end2 → corner
      // Normal should point AWAY from end1 (toward exterior)
      {
        const dx = cornerV.x - end2.x;
        const dy = cornerV.y - end2.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0.001) {
          const ux = dx / len, uy = dy / len;
          let nx = uy, ny = -ux;

          const midX = (end2.x + cornerV.x) / 2;
          const midY = (end2.y + cornerV.y) / 2;
          const toEnd1X = end1.x - midX;
          const toEnd1Y = end1.y - midY;

          if (nx * toEnd1X + ny * toEnd1Y > 0) {
            nx = -nx; ny = -ny;
          }

          edges.push({
            v1: { ...end2 }, v2: { ...cornerV },
            midX, midY, ux, uy, nx, ny, length: len,
            shapeId: shape.id, edgeIndex: 2,
          });
        }
      }
    } else {
      // Standard polygon edges
      for (let i = 0; i < verts.length; i++) {
        const v1 = verts[i];
        const v2 = verts[(i + 1) % verts.length];

        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) continue;

        const ux = dx / len, uy = dy / len;
        const nx = uy, ny = -ux;

        edges.push({
          v1: { ...v1 }, v2: { ...v2 },
          midX: (v1.x + v2.x) / 2, midY: (v1.y + v2.y) / 2,
          ux, uy, nx, ny, length: len,
          shapeId: shape.id, edgeIndex: i,
        });
      }
    }
    return edges;
  }, [getVertices]);

  const allEdges = useMemo(() => shapes.flatMap(s => getShapeEdges(s)), [shapes, getShapeEdges]);

  // =====================================================
  // DISTANCE & EDGE FINDING
  // =====================================================
  const pointToEdgeDistance = useCallback((px, py, edge) => {
    const { v1, v2 } = edge;
    const dx = v2.x - v1.x, dy = v2.y - v1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001) return Math.hypot(px - v1.x, py - v1.y);
    const t = Math.max(0, Math.min(1, ((px - v1.x) * dx + (py - v1.y) * dy) / lenSq));
    return Math.hypot(px - (v1.x + t * dx), py - (v1.y + t * dy));
  }, []);

  const findClosestEdge = useCallback((px, py) => {
    let closest = null, minDist = Infinity;
    for (const edge of allEdges) {
      const dist = pointToEdgeDistance(px, py, edge);
      if (dist < minDist) { minDist = dist; closest = edge; }
    }
    return { edge: closest, distance: minDist };
  }, [allEdges, pointToEdgeDistance]);

  // =====================================================
  // SNAPPING CALCULATIONS
  // =====================================================
  const calculateSnappedVertices = useCallback((edge, shapeType, mouseX = null, mouseY = null) => {
    const { v1, v2, nx, ny, midX, midY, ux, uy } = edge;

    if (shapeType === 'square' || shapeType === 'stair') {
      const offsetX = nx * SHAPE_SIZE;
      const offsetY = ny * SHAPE_SIZE;
      return [
        { x: v2.x, y: v2.y },
        { x: v1.x, y: v1.y },
        { x: v1.x + offsetX, y: v1.y + offsetY },
        { x: v2.x + offsetX, y: v2.y + offsetY },
      ];
    } else if (shapeType === 'corner') {
      // Corner placement based on mouse quadrant
      let perpOutward = true;
      let cornerAtV1 = true;

      if (mouseX !== null && mouseY !== null) {
        const relX = mouseX - midX;
        const relY = mouseY - midY;
        perpOutward = (relX * nx + relY * ny) >= 0;
        cornerAtV1 = (relX * ux + relY * uy) < 0;
      }

      const perpMult = perpOutward ? 1 : -1;
      const offsetX = nx * SHAPE_SIZE * perpMult;
      const offsetY = ny * SHAPE_SIZE * perpMult;

      if (cornerAtV1) {
        return [
          { x: v1.x, y: v1.y },
          { x: v2.x, y: v2.y },
          { x: v1.x + offsetX, y: v1.y + offsetY },
        ];
      } else {
        return [
          { x: v2.x, y: v2.y },
          { x: v1.x, y: v1.y },
          { x: v2.x + offsetX, y: v2.y + offsetY },
        ];
      }
    } else {
      const apexX = midX + nx * TRI_HEIGHT;
      const apexY = midY + ny * TRI_HEIGHT;
      return [
        { x: apexX, y: apexY },
        { x: v2.x, y: v2.y },
        { x: v1.x, y: v1.y },
      ];
    }
  }, []);

  // Rotate vertices around their centroid
  const rotateVertices = useCallback((verts, angleDeg) => {
    const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
    const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return verts.map(v => ({
      x: cx + (v.x - cx) * cos - (v.y - cy) * sin,
      y: cy + (v.x - cx) * sin + (v.y - cy) * cos,
    }));
  }, []);

  const verticesToShape = useCallback((verts, shapeType, id, building) => {
    const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
    const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;

    let rotation = 0;
    if (shapeType === 'square' || shapeType === 'stair') {
      const dx = verts[1].x - verts[0].x;
      const dy = verts[1].y - verts[0].y;
      rotation = (Math.atan2(dy, dx) * 180 / Math.PI) + 180;
    } else if (shapeType === 'corner') {
      const dx = verts[1].x - verts[0].x;
      const dy = verts[1].y - verts[0].y;
      rotation = Math.atan2(dy, dx) * 180 / Math.PI;
    } else {
      const dx = verts[0].x - cx;
      const dy = verts[0].y - cy;
      rotation = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
    }

    return { id, type: shapeType, x: cx, y: cy, rotation, building, _verts: verts };
  }, []);

  // =====================================================
  // OVERLAP DETECTION
  // =====================================================
  const pointStrictlyInPolygon = useCallback((px, py, verts) => {
    // Check if point is on any edge (within tolerance)
    for (let i = 0; i < verts.length; i++) {
      const v1 = verts[i];
      const v2 = verts[(i + 1) % verts.length];
      const dx = v2.x - v1.x, dy = v2.y - v1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq > 0.001) {
        const t = ((px - v1.x) * dx + (py - v1.y) * dy) / lenSq;
        if (t >= -0.01 && t <= 1.01) {
          const dist = Math.hypot(px - (v1.x + t * dx), py - (v1.y + t * dy));
          if (dist < EDGE_TOLERANCE) return false; // On edge = not strictly inside
        }
      }
    }

    // Ray casting for interior test
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const xi = verts[i].x, yi = verts[i].y;
      const xj = verts[j].x, yj = verts[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }, []);

  const segmentsIntersect = useCallback((a1, a2, b1, b2) => {
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const d1 = cross(b1, b2, a1), d2 = cross(b1, b2, a2);
    const d3 = cross(a1, a2, b1), d4 = cross(a1, a2, b2);
    const eps = 0.01;
    return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
           ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
  }, []);

  const checkOverlap = useCallback((newVerts, newType) => {
    // Check if shape is within buildable area when fief mode is enabled
    if (fiefMode && !isShapeInBuildableArea(newVerts)) {
      return true; // Treat as "overlap" to prevent placement
    }

    // Use current building type for the new shape being placed
    const newCornerStyle = BUILDING_TYPES[buildingType]?.cornerStyle || 'round';
    const newCollisionVerts = newType === 'corner'
      ? getCornerCollisionVerts(newVerts[0], newVerts[1], newVerts[2], newCornerStyle)
      : newVerts;

    // Calculate centroid of new shape for coincidence check
    const newCx = newVerts.reduce((s, v) => s + v.x, 0) / newVerts.length;
    const newCy = newVerts.reduce((s, v) => s + v.y, 0) / newVerts.length;

    for (const shape of shapes) {
      // Each existing shape uses its own building type for collision
      const existingVerts = getCollisionVertices(shape);

      // Check for nearly coincident shapes (same position)
      // This catches the case where shapes overlap exactly and vertices lie on edges
      const existingCx = existingVerts.reduce((s, v) => s + v.x, 0) / existingVerts.length;
      const existingCy = existingVerts.reduce((s, v) => s + v.y, 0) / existingVerts.length;
      const centroidDist = Math.hypot(newCx - existingCx, newCy - existingCy);
      if (centroidDist < SHAPE_SIZE * 0.5) {
        // Centroids are close - check if any vertices are nearly coincident
        const existingBaseVerts = shape._verts || getVertices(shape);
        for (const nv of newVerts) {
          for (const ev of existingBaseVerts) {
            if (Math.hypot(nv.x - ev.x, nv.y - ev.y) < EDGE_TOLERANCE * 2) {
              return true; // Vertices nearly coincident = overlapping shape
            }
          }
        }
      }

      // Check if any new vertex is strictly inside existing shape
      for (const v of newCollisionVerts) {
        if (pointStrictlyInPolygon(v.x, v.y, existingVerts)) return true;
      }

      // Check if any existing vertex is strictly inside new shape
      for (const v of existingVerts) {
        if (pointStrictlyInPolygon(v.x, v.y, newCollisionVerts)) return true;
      }

      // Check for edge intersections
      for (let i = 0; i < newCollisionVerts.length; i++) {
        const a1 = newCollisionVerts[i];
        const a2 = newCollisionVerts[(i + 1) % newCollisionVerts.length];
        for (let j = 0; j < existingVerts.length; j++) {
          const b1 = existingVerts[j];
          const b2 = existingVerts[(j + 1) % existingVerts.length];
          if (segmentsIntersect(a1, a2, b1, b2)) return true;
        }
      }
    }
    return false;
  }, [shapes, getCollisionVertices, getCornerCollisionVerts, pointStrictlyInPolygon, segmentsIntersect, buildingType, fiefMode, isShapeInBuildableArea]);

  // =====================================================
  // EVENT HANDLERS
  // =====================================================
  const pointInPolygon = useCallback((px, py, verts) => {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const xi = verts[i].x, yi = verts[i].y;
      const xj = verts[j].x, yj = verts[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }, []);

  const findShapeAtPoint = useCallback((px, py) => {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const shape = shapes[i];
      if (pointInPolygon(px, py, getCollisionVertices(shape))) return shape;
    }
    return null;
  }, [shapes, getCollisionVertices, pointInPolygon]);

  // Helper to get free-place vertices for a shape type
  const getFreeVertices = useCallback((px, py, shapeType) => {
    const h = SHAPE_SIZE / 2;
    if (shapeType === 'square' || shapeType === 'stair') {
      return [
        { x: px - h, y: py - h }, { x: px + h, y: py - h },
        { x: px + h, y: py + h }, { x: px - h, y: py + h },
      ];
    } else if (shapeType === 'corner') {
      return [{ x: px - h, y: py - h }, { x: px + h, y: py - h }, { x: px - h, y: py + h }];
    } else {
      return [
        { x: px, y: py - TRI_HEIGHT * 2/3 },
        { x: px + SHAPE_SIZE/2, y: py + TRI_HEIGHT/3 },
        { x: px - SHAPE_SIZE/2, y: py + TRI_HEIGHT/3 },
      ];
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Track mouse position in world coordinates for paste operations
    const worldPos = screenToWorld(screenX, screenY);
    mousePositionRef.current = worldPos;

    if (isPanning) {
      setPan({ x: screenX - panStart.x, y: screenY - panStart.y });
      return;
    }

    // Item mode: handle dragging placed items
    if (itemMode && isDraggingPlacedItem && selectedItemId !== null) {
      const mouseX = (screenX - pan.x) / zoom;
      const mouseY = (screenY - pan.y) / zoom;
      const rawX = mouseX - itemDragOffset.x;
      const rawY = mouseY - itemDragOffset.y;

      // Snap to grid
      const newX = Math.round(rawX / ITEM_GRID_SIZE) * ITEM_GRID_SIZE;
      const newY = Math.round(rawY / ITEM_GRID_SIZE) * ITEM_GRID_SIZE;

      // Check fief boundary if enabled
      const item = placedItems.find(i => i.id === selectedItemId);
      if (item) {
        const itemDef = BASE_ITEMS[item.itemType];
        if (fiefMode && itemDef && !isItemInBuildableArea(newX, newY, itemDef)) {
          return; // Don't allow moving outside fief
        }
        // Check for overlap with other items (exclude the item being dragged)
        if (itemDef && doesItemOverlap(newX, newY, itemDef, selectedItemId)) {
          return; // Don't allow moving on top of another item
        }
      }

      setPlacedItems(prev => prev.map(item =>
        item.id === selectedItemId
          ? { ...item, x: newX, y: newY }
          : item
      ));
      return;
    }

    const { x: px, y: py } = screenToWorld(screenX, screenY);

    // Lock mode handling
    if (isLocked) {
      // Handle group dragging
      if (isDraggingGroup && !isRotatingGroup) {
        const dx = px - dragStart.x;
        const dy = py - dragStart.y;
        setDragOffset({ x: dx, y: dy });
        return;
      }

      // Handle group rotation
      if (isRotatingGroup) {
        const deltaX = screenX - rotationStartX;
        const newAngle = deltaX * 0.5; // 0.5 degrees per pixel
        setGroupRotationAngle(newAngle);
        return;
      }

      // Update hovered group
      const shape = findShapeAtPoint(px, py);
      if (shape) {
        const groupIds = findConnectedGroup(shape);
        setHoveredGroup(groupIds);
      } else {
        setHoveredGroup([]);
      }
      setHoverInfo(null);
      return;
    }

    // Handle rotation mode - update angle based on horizontal drag
    if (isRotating && baseVertices) {
      const deltaX = screenX - rotationStartX;
      const newAngle = deltaX * 0.5; // 0.5 degrees per pixel
      setRotationAngle(newAngle);
      return;
    }

    // Don't show shape hover preview in item mode
    if (itemMode) {
      setHoverInfo(null);
      return;
    }

    const { edge, distance } = findClosestEdge(px, py);

    let leftVerts, rightVerts;

    if (!edge || distance > SNAP_THRESHOLD) {
      // Free placement - apply grid snap if enabled (always snap first shape)
      leftVerts = getFreeVertices(px, py, leftClickShape);
      rightVerts = getFreeVertices(px, py, rightClickShape);
      const isFirstShape = shapes.length === 0;
      if (gridEnabled || isFirstShape) {
        leftVerts = snapVerticesToGrid(leftVerts, isFirstShape);
        rightVerts = snapVerticesToGrid(rightVerts, isFirstShape);
      }
      setHoverInfo({ freePlace: true, x: px, y: py, leftVerts, rightVerts });
    } else {
      // Edge snap takes priority - no grid snap
      leftVerts = calculateSnappedVertices(edge, leftClickShape, px, py);
      rightVerts = calculateSnappedVertices(edge, rightClickShape, px, py);
      setHoverInfo({ freePlace: false, edge, leftVerts, rightVerts });
    }
  }, [findClosestEdge, calculateSnappedVertices, screenToWorld, isPanning, panStart, isRotating, baseVertices, rotationStartX, leftClickShape, rightClickShape, getFreeVertices, isLocked, isDraggingGroup, isRotatingGroup, dragStart, findShapeAtPoint, findConnectedGroup, gridEnabled, snapVerticesToGrid, itemMode, isDraggingPlacedItem, selectedItemId, pan, zoom, itemDragOffset, placedItems, fiefMode, isItemInBuildableArea, doesItemOverlap, shapes]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.1), 5);

    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    setPan({ x: mouseX - worldX * newZoom, y: mouseY - worldY * newZoom });
    setZoom(newZoom);
  }, [zoom, pan]);

  const handleMouseDown = useCallback((e) => {
    // Middle mouse button - start panning (also track for click detection)
    if (e.button === 1) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;
      setIsPanning(true);
      setPanStart({ x: startX - pan.x, y: startY - pan.y });
      setMiddleMouseStart({ x: startX, y: startY });
      return;
    }

    // Lock mode - handle group dragging, rotation, and right-click for pattern save
    if (isLocked && (e.button === 0 || e.button === 2)) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const { x: px, y: py } = screenToWorld(screenX, screenY);

      const shape = findShapeAtPoint(px, py);
      if (!shape) return;

      const groupIds = findConnectedGroup(shape);
      const groupShapes = getShapesByIds(groupIds);

      // Right-click in lock mode - save pattern
      if (e.button === 2) {
        setPendingPatternShapes(groupShapes);
        setPatternName('');
        setShowPatternNameModal(true);
        return;
      }

      // Store original positions for potential reset
      const originals = groupShapes.map(s => ({
        id: s.id,
        x: s.x,
        y: s.y,
        rotation: s.rotation,
        _verts: s._verts ? [...s._verts] : null,
      }));
      setOriginalGroupPositions(originals);
      setDraggedGroupIds(groupIds);

      if (e.shiftKey) {
        // Shift+drag = rotate group
        const centroid = getGroupCentroid(groupShapes);
        setGroupRotationCenter(centroid);
        setIsRotatingGroup(true);
        setRotationStartX(screenX);
        setGroupRotationAngle(0);
      } else {
        // Normal drag = move group
        setIsDraggingGroup(true);
        setDragStart({ x: px, y: py });
        setDragOffset({ x: 0, y: 0 });
      }
      return;
    }

    // Shift+left click for panning - NOT in lock mode
    if (!isLocked && e.button === 0 && e.shiftKey) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      setIsPanning(true);
      setPanStart({ x: e.clientX - rect.left - pan.x, y: e.clientY - rect.top - pan.y });
      return;
    }

    // Cancel rotation if other button is pressed
    if (isRotating) {
      const clickedButton = e.button === 0 ? 'left' : 'right';
      if (clickedButton !== rotatingButton) {
        e.preventDefault();
        setIsRotating(false);
        setRotatingButton(null);
        setBaseVertices(null);
        setRotationAngle(0);
        return;
      }
    }

    // Handle left or right click (NOT in lock mode or item mode)
    if (!isLocked && !itemMode && (e.button === 0 || e.button === 2)) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const { x: px, y: py } = screenToWorld(screenX, e.clientY - rect.top);

      const shapeType = e.button === 0 ? leftClickShape : rightClickShape;

      // If delete mode, delete shape immediately
      if (shapeType === 'delete') {
        const shape = findShapeAtPoint(px, py);
        if (shape) {
          saveToHistory();
          setShapes(prev => prev.filter(s => s.id !== shape.id));
        }
        return;
      }

      // Otherwise, start rotation mode for placing shapes
      const { edge, distance } = findClosestEdge(px, py);

      let verts;
      const isFree = !edge || distance > SNAP_THRESHOLD;
      if (isFree) {
        verts = getFreeVertices(px, py, shapeType);
        // Apply grid snap for free placements (always snap first shape)
        const isFirstShape = shapes.length === 0;
        if (gridEnabled || isFirstShape) {
          verts = snapVerticesToGrid(verts, isFirstShape);
        }
      } else {
        // Edge snap takes priority
        verts = calculateSnappedVertices(edge, shapeType, px, py);
      }

      setIsRotating(true);
      setRotatingButton(e.button === 0 ? 'left' : 'right');
      setRotationStartX(screenX);
      setRotationAngle(0);
      setBaseVertices(verts);
      setRotationShapeType(shapeType);
      setIsFreePlacement(isFree);
    }
  }, [pan, isRotating, rotatingButton, screenToWorld, findClosestEdge, calculateSnappedVertices, leftClickShape, rightClickShape, getFreeVertices, findShapeAtPoint, isLocked, itemMode, findConnectedGroup, getShapesByIds, getGroupCentroid, gridEnabled, snapVerticesToGrid, shapes, saveToHistory]);

  // Check if transformed group shapes overlap with any shapes outside the group
  const checkGroupOverlap = useCallback((transformedShapes, groupIds) => {
    const nonGroupShapes = shapes.filter(s => !groupIds.includes(s.id));

    for (const transformed of transformedShapes) {
      const newVerts = transformed.newVerts;
      const shapeBuilding = transformed.building || 'atreides';
      const cornerStyle = BUILDING_TYPES[shapeBuilding]?.cornerStyle || 'round';
      const newCollisionVerts = transformed.type === 'corner'
        ? getCornerCollisionVerts(newVerts[0], newVerts[1], newVerts[2], cornerStyle)
        : newVerts;

      for (const other of nonGroupShapes) {
        const existingVerts = getCollisionVertices(other);

        // Check vertex containment
        for (const v of newCollisionVerts) {
          if (pointStrictlyInPolygon(v.x, v.y, existingVerts)) return true;
        }
        for (const v of existingVerts) {
          if (pointStrictlyInPolygon(v.x, v.y, newCollisionVerts)) return true;
        }

        // Check edge intersections
        for (let i = 0; i < newCollisionVerts.length; i++) {
          const a1 = newCollisionVerts[i];
          const a2 = newCollisionVerts[(i + 1) % newCollisionVerts.length];
          for (let j = 0; j < existingVerts.length; j++) {
            const b1 = existingVerts[j];
            const b2 = existingVerts[(j + 1) % existingVerts.length];
            if (segmentsIntersect(a1, a2, b1, b2)) return true;
          }
        }

        // Check for coincident shapes
        const newCx = newVerts.reduce((s, v) => s + v.x, 0) / newVerts.length;
        const newCy = newVerts.reduce((s, v) => s + v.y, 0) / newVerts.length;
        const existingCx = existingVerts.reduce((s, v) => s + v.x, 0) / existingVerts.length;
        const existingCy = existingVerts.reduce((s, v) => s + v.y, 0) / existingVerts.length;
        if (Math.hypot(newCx - existingCx, newCy - existingCy) < SHAPE_SIZE * 0.5) {
          for (const nv of newVerts) {
            for (const ev of (other._verts || [])) {
              if (Math.hypot(nv.x - ev.x, nv.y - ev.y) < EDGE_TOLERANCE * 2) {
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  }, [shapes, getCollisionVertices, getCornerCollisionVerts, pointStrictlyInPolygon, segmentsIntersect]);

  const handleMouseUp = useCallback((e) => {
    // Handle middle mouse button release
    if (e.button === 1) {
      setIsPanning(false);
      // If minimal movement, perform middle click action - NOT in lock mode or item mode
      if (!isLocked && !itemMode && middleMouseStart) {
        const rect = e.currentTarget.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        const dist = Math.sqrt((endX - middleMouseStart.x) ** 2 + (endY - middleMouseStart.y) ** 2);
        if (dist < 5) {
          const { x: px, y: py } = screenToWorld(endX, endY);

          if (middleClickAction === 'delete') {
            // Delete shape
            const shape = findShapeAtPoint(px, py);
            if (shape) {
              saveToHistory();
              setShapes(prev => prev.filter(s => s.id !== shape.id));
            }
          } else {
            // Place shape (square, triangle, or corner)
            const { edge, distance } = findClosestEdge(px, py);
            let verts;
            if (!edge || distance > SNAP_THRESHOLD) {
              // Free placement - apply grid snap if enabled (always snap first shape)
              verts = getFreeVertices(px, py, middleClickAction);
              const isFirstShape = shapes.length === 0;
              if (gridEnabled || isFirstShape) {
                verts = snapVerticesToGrid(verts, isFirstShape);
              }
            } else {
              // Edge snap takes priority
              verts = calculateSnappedVertices(edge, middleClickAction, px, py);
            }
            if (!checkOverlap(verts, middleClickAction)) {
              saveToHistory();
              setShapes(prev => [...prev, verticesToShape(verts, middleClickAction, Date.now(), buildingType)]);
            }
          }
        }
      }
      setMiddleMouseStart(null);
      return;
    }

    setIsPanning(false);

    // End item mode dragging
    if (isDraggingPlacedItem) {
      setIsDraggingPlacedItem(false);
      return;
    }

    // Handle lock mode group operations
    if (isLocked && (isDraggingGroup || isRotatingGroup) && draggedGroupIds.length > 0) {
      const groupShapes = getShapesByIds(draggedGroupIds);

      // Calculate transformed vertices for each shape in the group
      let transformedShapes = groupShapes.map(shape => {
        const verts = shape._verts || getVertices(shape);
        let newVerts;

        if (isRotatingGroup) {
          // Rotate around group centroid
          newVerts = rotateVertsAroundPoint(verts, groupRotationCenter.x, groupRotationCenter.y, groupRotationAngle);
        } else {
          // Translate by drag offset
          newVerts = offsetVertices(verts, dragOffset.x, dragOffset.y);
        }

        return { ...shape, newVerts };
      });

      // Apply bounding box grid snap for dragging (not rotation)
      if (isDraggingGroup && gridEnabled) {
        transformedShapes = snapGroupBoundingBoxToGrid(transformedShapes);
      }

      // Save pre-snap position in case snap causes overlap
      const preSnapShapes = transformedShapes.map(s => ({
        ...s,
        newVerts: s.newVerts.map(v => ({ ...v }))
      }));

      // Apply edge snapping for dragging (snap to external shape vertices)
      if (isDraggingGroup) {
        transformedShapes = snapGroupToEdges(transformedShapes, draggedGroupIds);
      }

      // Check if snapped position causes overlap - if so, revert to pre-snap position
      let hasOverlap = checkGroupOverlap(transformedShapes, draggedGroupIds);
      if (hasOverlap && isDraggingGroup) {
        // Snap caused overlap, try without snap
        transformedShapes = preSnapShapes;
        hasOverlap = checkGroupOverlap(transformedShapes, draggedGroupIds);
      }

      if (!hasOverlap) {
        // Apply the transformation (use lock mode history)
        saveToHistory();
        setShapes(prev => prev.map(shape => {
          if (!draggedGroupIds.includes(shape.id)) return shape;

          // Find the transformed shape data
          const transformed = transformedShapes.find(t => t.id === shape.id);
          if (!transformed) return shape;

          const newVerts = transformed.newVerts;

          // Recalculate center and rotation from new vertices
          const cx = newVerts.reduce((s, v) => s + v.x, 0) / newVerts.length;
          const cy = newVerts.reduce((s, v) => s + v.y, 0) / newVerts.length;

          let newRotation = shape.rotation;
          if (isRotatingGroup) {
            newRotation = shape.rotation + groupRotationAngle;
          }

          return { ...shape, x: cx, y: cy, rotation: newRotation, _verts: newVerts };
        }));
      }

      // Reset group dragging state
      setIsDraggingGroup(false);
      setIsRotatingGroup(false);
      setDraggedGroupIds([]);
      setDragOffset({ x: 0, y: 0 });
      setGroupRotationAngle(0);
      setOriginalGroupPositions([]);
      return;
    }

    // Place shape on release if in rotation mode (not lock mode)
    if (isRotating && baseVertices) {
      const releasedButton = e.button === 0 ? 'left' : 'right';
      if (releasedButton === rotatingButton) {
        const rotatedVerts = rotateVertices(baseVertices, rotationAngle);
        if (!checkOverlap(rotatedVerts, rotationShapeType)) {
          saveToHistory();
          setShapes(prev => [...prev, verticesToShape(rotatedVerts, rotationShapeType, Date.now(), buildingType)]);
        }
      }
      setIsRotating(false);
      setRotatingButton(null);
      setBaseVertices(null);
      setRotationAngle(0);
      setIsFreePlacement(false);
    }
  }, [isRotating, rotatingButton, baseVertices, rotationAngle, rotationShapeType, rotateVertices, checkOverlap, verticesToShape, middleMouseStart, middleClickAction, screenToWorld, findShapeAtPoint, buildingType, isLocked, isDraggingGroup, isRotatingGroup, draggedGroupIds, dragOffset, groupRotationAngle, groupRotationCenter, getShapesByIds, getVertices, offsetVertices, rotateVertsAroundPoint, checkGroupOverlap, findClosestEdge, getFreeVertices, calculateSnappedVertices, gridEnabled, snapVerticesToGrid, snapGroupBoundingBoxToGrid, snapGroupToEdges, isDraggingPlacedItem, saveToHistory]);

  const handleClear = () => {
    // Save current state to history before clearing
    saveToHistory();
    // Clear all floors
    setAllFloorShapes({ 0: [] });
    setAllFloorItems({ 0: [] });
    setCurrentFloor(0);
    setHoverInfo(null);
    // Reset fief stakes
    setStakesInventory(MAX_STAKES);
    setPlacedStakes([]);
    setClaimedAreas([]);
    setSelectedItemId(null);
  };
  const handleResetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };


  // =====================================================
  // STAKE HANDLERS
  // =====================================================
  const handleStakeDragStart = useCallback((e) => {
    if (stakesInventory <= 0) return;
    e.dataTransfer.setData('text/plain', 'stake');
    setDraggingStake(true);
  }, [stakesInventory]);

  const handleStakeDragEnd = useCallback(() => {
    setDraggingStake(null);
    setStakeDropZone(null);
  }, []);

  const handleDropZoneDragOver = useCallback((e, zone) => {
    e.preventDefault();
    setStakeDropZone(zone);
  }, []);

  const handleDropZoneDragLeave = useCallback(() => {
    setStakeDropZone(null);
  }, []);

  const handleDropZoneDrop = useCallback((e, zone) => {
    e.preventDefault();
    if (!draggingStake || stakesInventory <= 0) return;

    // Place the stake
    const newStake = {
      id: Date.now(),
      direction: zone.direction,
      parentId: zone.parentId,
      countdown: STAKE_COUNTDOWN,
      claimed: false,
    };

    setPlacedStakes(prev => [...prev, newStake]);
    setStakesInventory(prev => prev - 1);
    setDraggingStake(null);
    setStakeDropZone(null);
  }, [draggingStake, stakesInventory]);

  const handleCancelStake = useCallback((stakeId) => {
    setPlacedStakes(prev => prev.filter(s => s.id !== stakeId));
    setStakesInventory(prev => prev + 1);
  }, []);

  // =====================================================
  // FIEF DRAG HANDLERS
  // =====================================================
  const handleFiefDragStart = useCallback((e, fiefTypeValue) => {
    e.dataTransfer.setData('text/plain', `fief:${fiefTypeValue}`);
    setDraggingFief(fiefTypeValue);
  }, []);

  const handleFiefDragEnd = useCallback(() => {
    setDraggingFief(null);
  }, []);

  const handleFiefDrop = useCallback((e) => {
    if (!draggingFief) return;

    const svgRect = e.currentTarget.getBoundingClientRect();
    const rawX = (e.clientX - svgRect.left - pan.x) / zoom;
    const rawY = (e.clientY - svgRect.top - pan.y) / zoom;

    // Get fief dimensions and calculate center offset
    const fiefW = FIEF_DEFAULTS[draggingFief].width * CELL_SIZE;
    const fiefH = FIEF_DEFAULTS[draggingFief].height * CELL_SIZE;

    // Offset so drop point becomes center of fief, then snap to grid
    const x = Math.round((rawX - fiefW / 2) / CELL_SIZE) * CELL_SIZE;
    const y = Math.round((rawY - fiefH / 2) / CELL_SIZE) * CELL_SIZE;

    // Set the fief type and position
    setFiefType(draggingFief);
    setFiefWidth(FIEF_DEFAULTS[draggingFief].width);
    setFiefHeight(FIEF_DEFAULTS[draggingFief].height);
    setFiefPosition({ x, y });
    setFiefMode(true);

    // Reset stakes when placing a new fief
    setStakesInventory(MAX_STAKES);
    setClaimedAreas([]);
    setPlacedStakes([]);

    setDraggingFief(null);
  }, [draggingFief, pan, zoom]);

  const handleClearFief = useCallback(() => {
    setFiefMode(false);
    setFiefPosition(null);
    setFiefType('standard');
    setFiefWidth(FIEF_DEFAULTS.standard.width);
    setFiefHeight(FIEF_DEFAULTS.standard.height);
    setFiefPadding(0);
    setStakesInventory(MAX_STAKES);
    setClaimedAreas([]);
    setPlacedStakes([]);
  }, []);

  // =====================================================
  // RENDERING
  // =====================================================
  const renderCorner = (verts, color, stroke, key, opacity = 1, dashed = false, cornerStyle = 'round') => {
    const [corner, end1, end2] = verts;
    const v1x = end1.x - corner.x, v1y = end1.y - corner.y;
    const v2x = end2.x - corner.x, v2y = end2.y - corner.y;

    let pathD;

    if (cornerStyle === 'diagonal') {
      // Clipped diagonal - small flats parallel to opposite edges
      // From end1, go in v2 direction (parallel to edge 2)
      const flat1End = {
        x: end1.x + v2x * DIAGONAL_FLAT_RATIO,
        y: end1.y + v2y * DIAGONAL_FLAT_RATIO,
      };
      // From end2, go in v1 direction (parallel to edge 1)
      const flat2Start = {
        x: end2.x + v1x * DIAGONAL_FLAT_RATIO,
        y: end2.y + v1y * DIAGONAL_FLAT_RATIO,
      };
      pathD = `M ${corner.x} ${corner.y} L ${end1.x} ${end1.y} L ${flat1End.x} ${flat1End.y} L ${flat2Start.x} ${flat2Start.y} L ${end2.x} ${end2.y} Z`;
    } else if (cornerStyle === 'stepped') {
      // Stepped/staircase pattern
      let pathPoints = `M ${corner.x} ${corner.y} L ${end1.x} ${end1.y}`;
      let currentX = end1.x;
      let currentY = end1.y;

      for (let i = 0; i < CORNER_STEPS; i++) {
        // Move toward end2 direction
        currentX += v2x / CORNER_STEPS;
        currentY += v2y / CORNER_STEPS;
        pathPoints += ` L ${currentX} ${currentY}`;

        // Move toward corner (negative v1 direction)
        currentX -= v1x / CORNER_STEPS;
        currentY -= v1y / CORNER_STEPS;
        pathPoints += ` L ${currentX} ${currentY}`;
      }

      pathD = pathPoints + ' Z';
    } else {
      // Round corner (default) - arc
      const cross = v1x * v2y - v1y * v2x;
      const sweepFlag = cross > 0 ? 1 : 0;
      pathD = `M ${corner.x} ${corner.y} L ${end1.x} ${end1.y} A ${SHAPE_SIZE} ${SHAPE_SIZE} 0 0 ${sweepFlag} ${end2.x} ${end2.y} Z`;
    }

    return (
      <path
        key={key}
        d={pathD}
        fill={color}
        fillOpacity={opacity}
        stroke={stroke}
        strokeWidth={dashed ? 2 : 1.5}
        strokeDasharray={dashed ? '5,5' : 'none'}
        style={!dashed ? { filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))' } : { pointerEvents: 'none' }}
      />
    );
  };

  const renderPolygon = (verts, color, stroke, key, opacity = 1, dashed = false, shapeType = 'square', cornerStyle = 'round') => {
    if (shapeType === 'corner') {
      return renderCorner(verts, color, stroke, key, opacity, dashed, cornerStyle);
    }

    // For stair type, render square with horizontal lines
    if (shapeType === 'stair') {
      // Calculate center from vertices
      const centerX = verts.reduce((s, v) => s + v.x, 0) / verts.length;
      const centerY = verts.reduce((s, v) => s + v.y, 0) / verts.length;

      // Calculate rotation angle from first edge
      const dx = verts[1].x - verts[0].x;
      const dy = verts[1].y - verts[0].y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;

      // Use fixed SHAPE_SIZE for consistent line rendering regardless of rotation
      const size = SHAPE_SIZE;
      const numLines = 4;
      const padding = size * 0.15;
      const lineSpacing = (size - 2 * padding) / (numLines + 1);

      return (
        <g key={key}>
          <polygon
            points={verts.map(v => `${v.x},${v.y}`).join(' ')}
            fill={color}
            fillOpacity={opacity}
            stroke={stroke}
            strokeWidth={dashed ? 2 : 1.5}
            strokeDasharray={dashed ? '5,5' : 'none'}
            style={!dashed ? { filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))' } : { pointerEvents: 'none' }}
          />
          {/* Stair lines */}
          {Array.from({ length: numLines }, (_, i) => {
            const yOffset = -size/2 + padding + (i + 1) * lineSpacing;
            return (
              <line
                key={`${key}-line-${i}`}
                x1={-size * 0.35}
                y1={yOffset}
                x2={size * 0.35}
                y2={yOffset}
                stroke={stroke}
                strokeWidth={2}
                strokeOpacity={opacity * 0.8}
                strokeLinecap="round"
                transform={`translate(${centerX}, ${centerY}) rotate(${angle})`}
                style={{ pointerEvents: 'none' }}
              />
            );
          })}
        </g>
      );
    }

    return (
      <polygon
        key={key}
        points={verts.map(v => `${v.x},${v.y}`).join(' ')}
        fill={color}
        fillOpacity={opacity}
        stroke={stroke}
        strokeWidth={dashed ? 2 : 1.5}
        strokeDasharray={dashed ? '5,5' : 'none'}
        style={!dashed ? { filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))' } : { pointerEvents: 'none' }}
      />
    );
  };

  const renderShapes = () => {
    return shapes.map(shape => {
      // Skip rendering shapes that are being dragged/rotated (they'll be rendered as preview)
      if ((isDraggingGroup || isRotatingGroup) && draggedGroupIds.includes(shape.id)) {
        return null;
      }

      const verts = shape._verts || getVertices(shape);
      const shapeBuilding = shape.building || 'atreides';
      const cornerStyle = BUILDING_TYPES[shapeBuilding]?.cornerStyle || 'round';
      const colors = COLOR_SCHEMES[shapeBuilding]?.[shape.type] || COLOR_SCHEMES.atreides[shape.type];

      // Highlight if part of hovered group in lock mode
      const isHovered = isLocked && hoveredGroup.includes(shape.id) && !isDraggingGroup && !isRotatingGroup;
      const strokeColor = isHovered ? '#fbbf24' : '#0f172a';
      const strokeWidth = isHovered ? 3 : 1.5;

      return (
        <g key={shape.id}>
          {renderPolygon(verts, colors.fill, strokeColor, shape.id, 1, false, shape.type, cornerStyle)}
          {isHovered && (
            <polygon
              points={verts.map(v => `${v.x},${v.y}`).join(' ')}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={strokeWidth}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </g>
      );
    });
  };


  // Render silhouette of floor below (faded shapes and items)
  const renderFloorBelowSilhouette = () => {
    if (!showSilhouette || currentFloor === 0) return null;

    return (
      <g opacity={0.25} style={{ pointerEvents: 'none' }}>
        {/* Render shapes from floor below */}
        {floorBelowShapes.map(shape => {
          const verts = shape._verts || getVertices(shape);
          const cornerStyle = BUILDING_TYPES[shape.building || 'atreides']?.cornerStyle || 'round';

          // Render with gray fill
          return (
            <g key={`silhouette-shape-${shape.id}`}>
              {renderPolygon(verts, '#64748b', '#475569', `sil-${shape.id}`, 1, false, shape.type, cornerStyle)}
            </g>
          );
        })}
        {/* Render items from floor below */}
        {floorBelowItems.map(item => {
          const itemDef = BASE_ITEMS[item.itemType];
          if (!itemDef) return null;
          const width = (itemDef.size?.width || 1) * ITEM_GRID_SIZE;
          const height = (itemDef.size?.height || 1) * ITEM_GRID_SIZE;
          return (
            <g key={`silhouette-item-${item.id}`} transform={`translate(${item.x}, ${item.y})`}>
              <rect
                width={width}
                height={height}
                fill="#64748b"
                stroke="#475569"
                strokeWidth={1}
                rx={4}
              />
            </g>
          );
        })}
      </g>
    );
  };

  // Render group being dragged or rotated
  const renderGroupPreview = () => {
    if (!isLocked || (!isDraggingGroup && !isRotatingGroup) || draggedGroupIds.length === 0) {
      return null;
    }

    const groupShapes = getShapesByIds(draggedGroupIds);

    // Calculate transformed shapes and check for overlap
    const transformedShapes = groupShapes.map(shape => {
      const verts = shape._verts || getVertices(shape);
      let newVerts;

      if (isRotatingGroup) {
        newVerts = rotateVertsAroundPoint(verts, groupRotationCenter.x, groupRotationCenter.y, groupRotationAngle);
      } else {
        newVerts = offsetVertices(verts, dragOffset.x, dragOffset.y);
      }

      return { ...shape, newVerts };
    });

    const hasOverlap = checkGroupOverlap(transformedShapes, draggedGroupIds);

    return (
      <g>
        {transformedShapes.map(shape => {
          const shapeBuilding = shape.building || 'atreides';
          const cornerStyle = BUILDING_TYPES[shapeBuilding]?.cornerStyle || 'round';
          const colors = COLOR_SCHEMES[shapeBuilding]?.[shape.type] || COLOR_SCHEMES.atreides[shape.type];

          return renderPolygon(
            shape.newVerts,
            hasOverlap ? '#ef4444' : colors.fill,
            hasOverlap ? '#f87171' : '#fbbf24',
            `preview-${shape.id}`,
            0.7,
            true,
            shape.type,
            cornerStyle
          );
        })}
        {isRotatingGroup && (
          <text
            x={groupRotationCenter.x}
            y={groupRotationCenter.y - 30}
            textAnchor="middle"
            fill="#fbbf24"
            fontSize="14"
            fontWeight="bold"
            style={{ pointerEvents: 'none' }}
          >
            {Math.round(groupRotationAngle)}°
          </text>
        )}
      </g>
    );
  };

  const renderHoverPreview = () => {
    // Don't show shape preview in item mode
    if (itemMode) return null;

    const cornerStyle = BUILDING_TYPES[buildingType]?.cornerStyle || 'round';

    // Show group drag/rotate preview in lock mode
    if (isLocked && (isDraggingGroup || isRotatingGroup)) {
      return renderGroupPreview();
    }

    // Show rotating shape preview
    if (isRotating && baseVertices) {
      const rotatedVerts = rotateVertices(baseVertices, rotationAngle);
      const colors = COLOR_SCHEMES[buildingType]?.[rotationShapeType] || COLOR_SCHEMES.atreides[rotationShapeType];
      const hasOverlap = checkOverlap(rotatedVerts, rotationShapeType);

      return (
        <g>
          {renderPolygon(rotatedVerts, hasOverlap ? '#ef4444' : colors.fill, hasOverlap ? '#f87171' : colors.stroke, 'rotating', 0.6, true, rotationShapeType, cornerStyle)}
          {rotationShapeType === 'corner' && (
            <circle cx={rotatedVerts[0].x} cy={rotatedVerts[0].y} r={6}
              fill="#fbbf24" stroke="#0f172a" strokeWidth={2} style={{ pointerEvents: 'none' }} />
          )}
          <text x={rotatedVerts[0].x} y={rotatedVerts[0].y - 20} textAnchor="middle" fill="#fbbf24" fontSize="12" style={{ pointerEvents: 'none' }}>
            {Math.round(rotationAngle)}°
          </text>
        </g>
      );
    }

    if (!hoverInfo) return null;

    const { freePlace, edge, leftVerts, rightVerts } = hoverInfo;
    const elements = [];

    // Helper to get colors for a shape type based on current building type
    const getShapeColors = (shapeType) => {
      return COLOR_SCHEMES[buildingType]?.[shapeType] || COLOR_SCHEMES.atreides[shapeType];
    };

    if (!freePlace && edge) {
      elements.push(
        <line key="edge-hl" x1={edge.v1.x} y1={edge.v1.y} x2={edge.v2.x} y2={edge.v2.y}
          stroke="#fbbf24" strokeWidth={4} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
      );
    }

    if (freePlace) {
      elements.push(
        <circle key="free" cx={hoverInfo.x} cy={hoverInfo.y} r={5} fill="#22c55e" style={{ pointerEvents: 'none' }} />
      );
    }

    // Left click preview (skip if delete mode)
    if (leftClickShape !== 'delete' && leftVerts && !checkOverlap(leftVerts, leftClickShape)) {
      const leftColors = getShapeColors(leftClickShape);
      elements.push(renderPolygon(leftVerts, leftColors.fill, leftColors.stroke, 'prev-left', 0.4, true, leftClickShape, cornerStyle));
      if (leftClickShape === 'corner') {
        elements.push(
          <circle key="corner-dot-left" cx={leftVerts[0].x} cy={leftVerts[0].y} r={6}
            fill="#fbbf24" stroke="#0f172a" strokeWidth={2} style={{ pointerEvents: 'none' }} />
        );
      }
    }

    // Right click preview (skip if delete mode)
    if (rightClickShape !== 'delete' && rightVerts && !checkOverlap(rightVerts, rightClickShape)) {
      const rightColors = getShapeColors(rightClickShape);
      elements.push(renderPolygon(rightVerts, rightColors.fill, rightColors.stroke, 'prev-right', 0.4, true, rightClickShape, cornerStyle));
      if (rightClickShape === 'corner') {
        elements.push(
          <circle key="corner-dot-right" cx={rightVerts[0].x} cy={rightVerts[0].y} r={6}
            fill="#fbbf24" stroke="#0f172a" strokeWidth={2} style={{ pointerEvents: 'none' }} />
        );
      }
    }

    return <g>{elements}</g>;
  };

  // Render fief buildable areas
  const renderFiefAreas = () => {
    if (!fiefMode) return null;

    const { areas } = getBuildableAreas();
    const dropZones = getStakeDropZones();
    const elements = [];
    const paddingFraction = fiefPadding / 100;

    // Render main buildable areas with a pleasant green shade
    for (const area of areas) {
      const padX = area.width * paddingFraction;
      const padY = area.height * paddingFraction;

      // Base fief boundary (dashed)
      elements.push(
        <rect
          key={`area-${area.id}`}
          x={area.x}
          y={area.y}
          width={area.width}
          height={area.height}
          fill="rgba(34, 197, 94, 0.1)"
          stroke="rgba(34, 197, 94, 0.3)"
          strokeWidth={2}
          strokeDasharray="8,4"
        />
      );

      // Expanded buildable boundary (solid) - shows actual buildable area with padding
      elements.push(
        <rect
          key={`area-expanded-${area.id}`}
          x={area.x - padX}
          y={area.y - padY}
          width={area.width + padX * 2}
          height={area.height + padY * 2}
          fill="rgba(34, 197, 94, 0.15)"
          stroke="rgba(34, 197, 94, 0.5)"
          strokeWidth={1}
        />
      );
    }

    // Render pending stakes (being claimed)
    for (const stake of placedStakes) {
      const { areaMap } = getBuildableAreas();
      const parent = areaMap[stake.parentId];
      if (!parent) continue;

      const fiefW = fiefWidth * CELL_SIZE;
      const fiefH = fiefHeight * CELL_SIZE;
      let stakeArea;

      switch (stake.direction) {
        case 'top':
          stakeArea = { x: parent.x, y: parent.y - fiefH, width: fiefW, height: fiefH };
          break;
        case 'bottom':
          stakeArea = { x: parent.x, y: parent.y + parent.height, width: fiefW, height: fiefH };
          break;
        case 'left':
          stakeArea = { x: parent.x - fiefW, y: parent.y, width: fiefW, height: fiefH };
          break;
        case 'right':
          stakeArea = { x: parent.x + parent.width, y: parent.y, width: fiefW, height: fiefH };
          break;
        default:
          continue;
      }

      // Pending stake area with countdown
      const progress = stake.countdown / STAKE_COUNTDOWN;
      elements.push(
        <g key={`stake-${stake.id}`}>
          <rect
            x={stakeArea.x}
            y={stakeArea.y}
            width={stakeArea.width}
            height={stakeArea.height}
            fill="rgba(251, 191, 36, 0.2)"
            stroke="rgba(251, 191, 36, 0.6)"
            strokeWidth={2}
            strokeDasharray="4,4"
          />
          {/* Progress bar */}
          <rect
            x={stakeArea.x + 10}
            y={stakeArea.y + stakeArea.height - 20}
            width={(stakeArea.width - 20) * (1 - progress)}
            height={10}
            fill="rgba(34, 197, 94, 0.8)"
            rx={2}
          />
          <rect
            x={stakeArea.x + 10}
            y={stakeArea.y + stakeArea.height - 20}
            width={stakeArea.width - 20}
            height={10}
            fill="none"
            stroke="rgba(251, 191, 36, 0.6)"
            strokeWidth={1}
            rx={2}
          />
          {/* Countdown text */}
          <text
            x={stakeArea.x + stakeArea.width / 2}
            y={stakeArea.y + stakeArea.height / 2}
            textAnchor="middle"
            fill="#fbbf24"
            fontSize="24"
            fontWeight="bold"
          >
            {Math.ceil(stake.countdown)}s
          </text>
          {/* Cancel button */}
          <g
            style={{ cursor: 'pointer' }}
            onClick={() => handleCancelStake(stake.id)}
          >
            <circle
              cx={stakeArea.x + stakeArea.width - 15}
              cy={stakeArea.y + 15}
              r={12}
              fill="rgba(239, 68, 68, 0.8)"
              stroke="#fff"
              strokeWidth={1}
            />
            <text
              x={stakeArea.x + stakeArea.width - 15}
              y={stakeArea.y + 20}
              textAnchor="middle"
              fill="#fff"
              fontSize="16"
              fontWeight="bold"
            >
              ×
            </text>
          </g>
        </g>
      );
    }

    return <g>{elements}</g>;
  };

  // Render grid lines when grid mode is enabled
  const renderGrid = () => {
    if (!gridEnabled) return null;

    const elements = [];
    // Calculate visible area based on current pan and zoom
    const viewportWidth = 900;
    const viewportHeight = 600;

    // Convert viewport bounds to world coordinates with padding
    const worldMinX = -pan.x / zoom - viewportWidth;
    const worldMaxX = (viewportWidth - pan.x) / zoom + viewportWidth;
    const worldMinY = -pan.y / zoom - viewportHeight;
    const worldMaxY = (viewportHeight - pan.y) / zoom + viewportHeight;

    // Snap to grid boundaries
    const startX = Math.floor(worldMinX / CELL_SIZE) * CELL_SIZE;
    const endX = Math.ceil(worldMaxX / CELL_SIZE) * CELL_SIZE;
    const startY = Math.floor(worldMinY / CELL_SIZE) * CELL_SIZE;
    const endY = Math.ceil(worldMaxY / CELL_SIZE) * CELL_SIZE;

    // Vertical lines
    for (let x = startX; x <= endX; x += CELL_SIZE) {
      elements.push(
        <line
          key={`grid-v-${x}`}
          x1={x}
          y1={startY}
          x2={x}
          y2={endY}
          stroke="rgba(148, 163, 184, 0.2)"
          strokeWidth={1 / zoom}
        />
      );
    }

    // Horizontal lines
    for (let y = startY; y <= endY; y += CELL_SIZE) {
      elements.push(
        <line
          key={`grid-h-${y}`}
          x1={startX}
          y1={y}
          x2={endX}
          y2={y}
          stroke="rgba(148, 163, 184, 0.2)"
          strokeWidth={1 / zoom}
        />
      );
    }

    // Origin marker (slightly brighter lines at 0,0)
    if (startX <= 0 && endX >= 0) {
      elements.push(
        <line
          key="grid-origin-v"
          x1={0}
          y1={startY}
          x2={0}
          y2={endY}
          stroke="rgba(148, 163, 184, 0.4)"
          strokeWidth={2 / zoom}
        />
      );
    }
    if (startY <= 0 && endY >= 0) {
      elements.push(
        <line
          key="grid-origin-h"
          x1={startX}
          y1={0}
          x2={endX}
          y2={0}
          stroke="rgba(148, 163, 184, 0.4)"
          strokeWidth={2 / zoom}
        />
      );
    }

    return <g style={{ pointerEvents: 'none' }}>{elements}</g>;
  };

  // Render drop zones for stakes (shown when dragging)
  const renderStakeDropZones = () => {
    if (!fiefMode || !draggingStake) return null;

    const dropZones = getStakeDropZones();
    return (
      <g>
        {dropZones.map((zone, i) => {
          const isHovered = stakeDropZone &&
            stakeDropZone.parentId === zone.parentId &&
            stakeDropZone.direction === zone.direction;

          return (
            <rect
              key={`drop-${zone.parentId}-${zone.direction}`}
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              fill={isHovered ? 'rgba(251, 191, 36, 0.3)' : 'rgba(100, 116, 139, 0.2)'}
              stroke={isHovered ? '#fbbf24' : '#64748b'}
              strokeWidth={isHovered ? 3 : 2}
              strokeDasharray="8,4"
              style={{ cursor: 'pointer' }}
              onDragOver={(e) => handleDropZoneDragOver(e, zone)}
              onDragLeave={handleDropZoneDragLeave}
              onDrop={(e) => handleDropZoneDrop(e, zone)}
            />
          );
        })}
      </g>
    );
  };

  const squareCount = shapes.filter(s => s.type === 'square').length;
  const triangleCount = shapes.filter(s => s.type === 'triangle').length;
  const cornerCount = shapes.filter(s => s.type === 'corner').length;
  const stairCount = shapes.filter(s => s.type === 'stair').length;
  const currentBuilding = BUILDING_TYPES[buildingType];

  // Calculate costs per material type based on each shape's building type
  const materialCosts = shapes.reduce((acc, shape) => {
    const shapeBuilding = BUILDING_TYPES[shape.building] || BUILDING_TYPES.atreides;
    const material = shapeBuilding.material;
    acc[material] = (acc[material] || 0) + shapeBuilding.cost;
    return acc;
  }, {});
  const plastoneCost = materialCosts.plastone || 0;
  const graniteCost = materialCosts.granite || 0;

  // Calculate resource totals from placed items
  const resourceTotals = useMemo(() => {
    const totals = placedItems.reduce((totals, placedItem) => {
      const itemDef = BASE_ITEMS[placedItem.itemType];
      if (!itemDef) return totals;

      totals.powerGenerated += itemDef.stats.powerGeneration || 0;
      totals.powerConsumed += itemDef.stats.powerConsumption || 0;
      totals.waterPerMinute += itemDef.stats.waterPerMinute || 0;
      totals.waterStorage += itemDef.stats.waterStorage || 0;
      return totals;
    }, {
      powerGenerated: 0,
      powerConsumed: 0,
      waterPerMinute: 0,
      waterStorage: 0,
    });

    // Add fief power consumption if fief is enabled
    if (fiefMode) {
      totals.powerConsumed += FIEF_DEFAULTS[fiefType].power || 0;
    }

    return totals;
  }, [placedItems, fiefMode, fiefType]);

  // Calculate material totals from placed items
  const materialTotals = useMemo(() => {
    const totals = {};
    placedItems.forEach(placedItem => {
      const itemDef = BASE_ITEMS[placedItem.itemType];
      if (!itemDef || !itemDef.materials) return;

      itemDef.materials.forEach(mat => {
        totals[mat.name] = (totals[mat.name] || 0) + mat.amount;
      });
    });
    // Sort by amount descending
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [placedItems]);

  const netPower = resourceTotals.powerGenerated - resourceTotals.powerConsumed;
  const waterPerHour = resourceTotals.waterPerMinute * 60;

  // Handle item drag start from palette
  const handleItemDragStart = useCallback((itemType, e) => {
    setDraggingItem(itemType);
    setDragItemPosition({ x: e.clientX, y: e.clientY });
  }, []);

  // Handle item drag over canvas
  const handleItemDragOver = useCallback((e) => {
    if (!draggingItem) return;
    setDragItemPosition({ x: e.clientX, y: e.clientY });
  }, [draggingItem]);

  // Handle item drop on canvas
  const handleItemDrop = useCallback((e) => {
    if (!draggingItem) return;

    const svgRect = e.currentTarget.getBoundingClientRect();
    const rawX = (e.clientX - svgRect.left - pan.x) / zoom;
    const rawY = (e.clientY - svgRect.top - pan.y) / zoom;

    // Snap to grid
    const x = Math.round(rawX / ITEM_GRID_SIZE) * ITEM_GRID_SIZE;
    const y = Math.round(rawY / ITEM_GRID_SIZE) * ITEM_GRID_SIZE;

    const itemDef = BASE_ITEMS[draggingItem];
    if (!itemDef) return;

    // Check fief boundary
    if (fiefMode && !isItemInBuildableArea(x, y, itemDef)) {
      setDraggingItem(null);
      return;
    }

    // Check for overlap with existing items
    if (doesItemOverlap(x, y, itemDef)) {
      setDraggingItem(null);
      return;
    }

    const newItem = {
      id: Date.now(),
      itemType: draggingItem,
      x,
      y,
    };

    saveToHistory();
    setPlacedItems(prev => [...prev, newItem]);
    setDraggingItem(null);
  }, [draggingItem, pan, zoom, fiefMode, isItemInBuildableArea, doesItemOverlap, saveToHistory]);

  // Handle pattern drop from saved patterns panel
  const handlePatternDrop = useCallback((e) => {
    if (!draggingPattern) return;

    const svgRect = e.currentTarget.getBoundingClientRect();
    const worldX = (e.clientX - svgRect.left - pan.x) / zoom;
    const worldY = (e.clientY - svgRect.top - pan.y) / zoom;

    placePattern(draggingPattern, worldX, worldY);
    setDraggingPattern(null);
  }, [draggingPattern, pan, zoom, placePattern]);

  // Handle item deletion
  const handleItemDelete = useCallback((itemId) => {
    saveToHistory();
    setPlacedItems(prev => prev.filter(item => item.id !== itemId));
    if (selectedItemId === itemId) {
      setSelectedItemId(null);
    }
  }, [selectedItemId, saveToHistory]);

  // Handle placed item mouse down (for selection and dragging in item mode)
  const handlePlacedItemMouseDown = useCallback((e, item) => {
    if (!itemMode) return;
    e.stopPropagation();

    // Save history before moving item
    saveToHistory();

    // Select the item
    setSelectedItemId(item.id);

    // Start dragging
    const svgRect = e.currentTarget.closest('svg').getBoundingClientRect();
    const mouseX = (e.clientX - svgRect.left - pan.x) / zoom;
    const mouseY = (e.clientY - svgRect.top - pan.y) / zoom;

    setItemDragOffset({
      x: mouseX - item.x,
      y: mouseY - item.y,
    });
    setIsDraggingPlacedItem(true);
  }, [itemMode, pan, zoom, saveToHistory]);

  // Render placed items on canvas
  const renderPlacedItems = () => {
    return placedItems.map(item => {
      const itemDef = BASE_ITEMS[item.itemType];
      if (!itemDef) return null;

      const width = (itemDef.size?.width || 1) * ITEM_GRID_SIZE;
      const height = (itemDef.size?.height || 1) * ITEM_GRID_SIZE;
      const isSelected = selectedItemId === item.id;

      return (
        <g key={item.id} transform={`translate(${item.x}, ${item.y})`}>
          {/* Selection highlight */}
          {isSelected && (
            <rect
              x={-4}
              y={-4}
              width={width + 8}
              height={height + 8}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={3}
              strokeDasharray="6,3"
              pointerEvents="none"
            />
          )}
          <image
            href={itemDef.icon}
            width={width}
            height={height}
            style={{ cursor: itemMode ? (isDraggingPlacedItem ? 'grabbing' : 'grab') : 'pointer' }}
            onMouseDown={(e) => handlePlacedItemMouseDown(e, item)}
            onClick={(e) => {
              e.stopPropagation();
              if (itemMode) {
                // In item mode, click to select
                setSelectedItemId(item.id);
              } else if (e.button === 0 && leftClickShape === 'delete') {
                handleItemDelete(item.id);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (itemMode) {
                // In item mode, right-click to delete
                handleItemDelete(item.id);
              } else if (rightClickShape === 'delete') {
                handleItemDelete(item.id);
              }
            }}
          />
          {/* Border based on category color */}
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="none"
            stroke={isSelected ? '#fbbf24' : (ITEM_CATEGORIES[itemDef.category]?.color || '#888')}
            strokeWidth={isSelected ? 3 : 2}
            pointerEvents="none"
          />
        </g>
      );
    });
  };

  return (
    <div className={`min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 p-4 flex flex-col items-center ${isWideMode ? 'px-2' : ''}`}>
      <div className="mb-4 text-center w-full relative">
        <div className="flex items-center justify-center gap-3">
          <img src="/logo.png" alt="Logo" className="w-[95px] h-14" />
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              Dune: Awakening Base Planner
            </h1>
            <p className="text-slate-400 text-base">A <a href="https://www.holidyspice.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline">Holidy Spice</a> Community Tool</p>
          </div>
        </div>
        {/* Wide mode toggle */}
        <button
          onClick={() => setIsWideMode(!isWideMode)}
          className="absolute top-0 right-0 bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white p-2 rounded-lg transition-colors"
          title={isWideMode ? 'Exit wide mode' : 'Expand horizontally'}
        >
          {isWideMode ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l-6 7 6 7M15 5l6 7-6 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5l6 7-6 7M21 5l-6 7 6 7" />
            </svg>
          )}
        </button>
      </div>

      {/* Controls row: mouse assignments, clear, reset view, zoom */}
      {/* ml-[96px] offsets to align with canvas (sidebar 192px + gap 16px = 208px, centered adjustment) */}
      <div className={`flex flex-wrap items-center justify-center gap-2 mb-3 ${isWideMode ? 'w-full px-48' : 'ml-[96px]'}`} style={isWideMode ? {} : { width: '900px' }}>
        {/* Unified controls panel */}
        <div className="bg-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-3">
          {/* Mouse button assignments */}
          {!itemMode && (
            <>
              <div className="flex items-center gap-1.5">
                {/* Left mouse button icon */}
                <svg className="w-5 h-6" viewBox="0 0 24 32" fill="none" title="Left Click">
                  <rect x="3" y="4" width="18" height="24" rx="9" stroke="#64748b" strokeWidth="2" fill="none" />
                  <line x1="12" y1="4" x2="12" y2="14" stroke="#64748b" strokeWidth="1.5" />
                  <rect x="4" y="5" width="7" height="8" rx="2" fill="#3b82f6" />
                </svg>
                <select value={leftClickShape} onChange={(e) => setLeftClickShape(e.target.value)}
                  className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-blue-500">
                  <option value="square">Square</option>
                  <option value="triangle">Triangle</option>
                  <option value="corner">Corner</option>
                  <option value="stair">Stair</option>
                  <option value="delete">Delete</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Right mouse button icon */}
                <svg className="w-5 h-6" viewBox="0 0 24 32" fill="none" title="Right Click">
                  <rect x="3" y="4" width="18" height="24" rx="9" stroke="#64748b" strokeWidth="2" fill="none" />
                  <line x1="12" y1="4" x2="12" y2="14" stroke="#64748b" strokeWidth="1.5" />
                  <rect x="13" y="5" width="7" height="8" rx="2" fill="#f97316" />
                </svg>
                <select value={rightClickShape} onChange={(e) => setRightClickShape(e.target.value)}
                  className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-orange-500">
                  <option value="square">Square</option>
                  <option value="triangle">Triangle</option>
                  <option value="corner">Corner</option>
                  <option value="stair">Stair</option>
                  <option value="delete">Delete</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Middle mouse button icon */}
                <svg className="w-5 h-6" viewBox="0 0 24 32" fill="none" title="Middle Click">
                  <rect x="3" y="4" width="18" height="24" rx="9" stroke="#64748b" strokeWidth="2" fill="none" />
                  <line x1="12" y1="4" x2="12" y2="14" stroke="#64748b" strokeWidth="1.5" />
                  <rect x="9" y="5" width="6" height="8" rx="2" fill="#a855f7" />
                </svg>
                <select value={middleClickAction} onChange={(e) => setMiddleClickAction(e.target.value)}
                  className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-purple-500">
                  <option value="square">Square</option>
                  <option value="triangle">Triangle</option>
                  <option value="corner">Corner</option>
                  <option value="stair">Stair</option>
                  <option value="delete">Delete</option>
                </select>
              </div>

              <div className="w-px h-6 bg-slate-600" />
            </>
          )}

          {/* Action buttons */}
          <button onClick={handleClear} disabled={shapes.length === 0 && placedItems.length === 0 && !fiefMode}
            className="bg-red-600/80 hover:bg-red-500 disabled:opacity-40 text-white w-8 h-8 rounded text-sm transition-colors flex items-center justify-center"
            title="Clear all shapes, items, and fief"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          <button
            onClick={() => setGridEnabled(!gridEnabled)}
            className={`${gridEnabled ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-slate-700 hover:bg-slate-600'} text-white w-8 h-8 rounded text-sm transition-colors flex items-center justify-center`}
            title={gridEnabled ? 'Disable grid snap' : 'Enable grid snap'}
          >
            <span className="font-bold text-base">#</span>
          </button>

          <button
            onClick={() => {
              const newLocked = !isLocked;
              setIsLocked(newLocked);
              setHoveredGroup([]);
              setIsDraggingGroup(false);
              setIsRotatingGroup(false);
              if (newLocked) {
                setItemSidebarOpen(false);
              }
            }}
            className={`${isLocked ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-700 hover:bg-slate-600'} text-white w-8 h-8 rounded text-sm transition-colors flex items-center justify-center`}
            title={isLocked ? 'Unlock to edit shapes' : 'Lock to move groups'}
          >
            {isLocked ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          <div className="w-px h-6 bg-slate-600" />

          {/* Floor selector */}
          <div className="flex items-center gap-1.5">
            {/* Layers/floors icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" title="Floor">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#10b981" opacity="0.3" />
              <path d="M2 12l10 5 10-5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 17l10 5 10-5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <select
              value={currentFloor}
              onChange={(e) => setCurrentFloor(parseInt(e.target.value))}
              className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-emerald-500"
            >
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowSilhouette(!showSilhouette)}
              className={`${showSilhouette ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'} text-white w-6 h-6 rounded flex items-center justify-center`}
              title={showSilhouette ? 'Hide floor below silhouette' : 'Show floor below silhouette'}
              disabled={currentFloor === 0}
              style={{ opacity: currentFloor === 0 ? 0.4 : 1 }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </button>
          </div>

          <div className="w-px h-6 bg-slate-600" />

          {/* Zoom */}
          <div className="flex items-center gap-1.5">
            {/* Magnifying glass icon */}
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" title="Zoom">
              <circle cx="11" cy="11" r="7" stroke="#94a3b8" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-slate-300 text-sm">{Math.round(zoom * 100)}%</span>
            <button onClick={handleResetView}
              className="bg-slate-700 hover:bg-slate-600 text-white w-6 h-6 rounded flex items-center justify-center"
              title="Reset View"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Items / Back to Design Mode button */}
          <div className="w-px h-6 bg-slate-600" />
          {itemSidebarOpen ? (
            <button
              onClick={() => setItemSidebarOpen(false)}
              className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium px-3 py-1 rounded text-sm flex items-center gap-1.5 transition-colors"
              title="Back to Design Mode"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Design Mode
            </button>
          ) : (
            <button
              onClick={() => setItemSidebarOpen(true)}
              className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium px-3 py-1 rounded text-sm flex items-center gap-1.5 transition-colors"
              title="Open item placement panel"
            >
              Items
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className={`flex ${isWideMode ? 'w-full' : ''}`}>
        {/* Left Sidebar - Building Type & Fief Controls */}
        <div className="bg-slate-800 rounded-l-xl border-2 border-r-0 border-slate-700 w-48 p-4 flex-shrink-0">
          {/* Building Type */}
          <div className="text-slate-300 font-bold text-center text-lg mb-3">Building Type</div>
          <div className="flex flex-col gap-1 mb-3">
            <select value={buildingType} onChange={(e) => setBuildingType(e.target.value)}
              className="bg-slate-700 text-white text-sm px-2 py-1.5 rounded border border-slate-600 focus:outline-none focus:border-amber-500">
              {Object.entries(BUILDING_TYPES).map(([key, bt]) => (
                <option key={key} value={key}>{bt.label}</option>
              ))}
            </select>
          </div>

          {/* Place Fief */}
          <div className="text-blue-400 font-bold text-center text-lg mb-3 border-t border-slate-600 pt-3">Place Fief</div>

          {/* Draggable Fief Images */}
          <div className="flex gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                draggable
                onDragStart={(e) => handleFiefDragStart(e, 'standard')}
                onDragEnd={handleFiefDragEnd}
                className={`w-16 h-16 rounded-lg cursor-grab active:cursor-grabbing transition-all overflow-hidden border-2 ${
                  fiefMode && fiefType === 'standard'
                    ? 'border-amber-400 ring-2 ring-amber-400/50'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
                title="Drag to place Standard Fief"
              >
                <img
                  src="/items/fief-standard.webp"
                  alt="Standard Fief"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
              <span className="text-xs text-slate-400">Standard</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div
                draggable
                onDragStart={(e) => handleFiefDragStart(e, 'advanced')}
                onDragEnd={handleFiefDragEnd}
                className={`w-16 h-16 rounded-lg cursor-grab active:cursor-grabbing transition-all overflow-hidden border-2 ${
                  fiefMode && fiefType === 'advanced'
                    ? 'border-amber-400 ring-2 ring-amber-400/50'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
                title="Drag to place Advanced Fief"
              >
                <img
                  src="/items/fief-advanced.webp"
                  alt="Advanced Fief"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
              <span className="text-xs text-slate-400">Advanced</span>
            </div>
          </div>
          <p className="text-slate-500 text-xs mt-2">Drag onto canvas to place</p>

          {/* Fief Settings - shown when fief is placed */}
          {fiefMode && fiefPosition && (
            <>
              {/* Clear Fief Button */}
              <button
                onClick={handleClearFief}
                className="w-full bg-red-600/80 hover:bg-red-500 text-white text-sm py-1.5 rounded-lg transition-colors flex items-center justify-center gap-2 mt-3"
                title="Remove fief"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear Fief
              </button>

              <div className="text-slate-300 text-xs font-medium mt-2">
                {fiefType === 'standard' ? 'Standard' : 'Advanced'} Fief ({fiefWidth} x {fiefHeight})
              </div>

              {/* Size Adjusters */}
              <div className="flex flex-col gap-1 mt-2">
                <label className="text-slate-400 text-xs">Width (cells)</label>
                <input
                  type="number"
                  value={fiefWidth}
                  onChange={(e) => setFiefWidth(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                  min="0.5"
                  max="20"
                  step="0.5"
                  className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-amber-500 w-full"
                />
              </div>

              <div className="flex flex-col gap-1 mt-2">
                <label className="text-slate-400 text-xs">Height (cells)</label>
                <input
                  type="number"
                  value={fiefHeight}
                  onChange={(e) => setFiefHeight(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                  min="0.5"
                  max="20"
                  step="0.5"
                  className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-amber-500 w-full"
                />
              </div>

              <div className="flex flex-col gap-1 mt-2">
                <label className="text-slate-400 text-xs">Build Padding ({fiefPadding}%)</label>
                <input
                  type="range"
                  value={fiefPadding}
                  onChange={(e) => setFiefPadding(parseFloat(e.target.value))}
                  min="0"
                  max="10"
                  step="0.5"
                  className="w-full accent-amber-500"
                />
                <p className="text-slate-500 text-[10px]">Expands buildable area beyond fief boundary</p>
              </div>

              {/* Stakes Section */}
              <div className="border-t border-slate-600 pt-2 mt-3">
                <div className="text-slate-300 font-medium text-sm mb-2">Stakes ({stakesInventory}/{MAX_STAKES})</div>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: MAX_STAKES }).map((_, i) => {
                    const isAvailable = i < stakesInventory;
                    const usedIndex = i - stakesInventory;
                    const claimedArea = !isAvailable ? claimedAreas[usedIndex] : null;

                    if (isAvailable) {
                      return (
                        <div
                          key={i}
                          draggable
                          onDragStart={handleStakeDragStart}
                          onDragEnd={handleStakeDragEnd}
                          className="w-10 h-10 rounded-lg flex items-center justify-center cursor-grab active:cursor-grabbing transition-all hover:scale-110"
                          title="Drag to place stake"
                        >
                          <img src="/items/staking-unit.webp" alt="Stake" className="w-full h-full object-contain" />
                        </div>
                      );
                    } else {
                      return (
                        <div
                          key={i}
                          onClick={() => {
                            if (claimedArea) {
                              setClaimedAreas(prev => prev.filter(a => a.id !== claimedArea.id));
                              setStakesInventory(prev => prev + 1);
                            }
                          }}
                          className="w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-all hover:scale-110 opacity-40 grayscale"
                          title="Click to remove this claim"
                        >
                          <img src="/items/staking-unit.webp" alt="Used Stake" className="w-full h-full object-contain" />
                        </div>
                      );
                    }
                  })}
                </div>
                <p className="text-slate-500 text-xs mt-2">
                  Drag to place · Click gray to remove
                </p>
              </div>

              {/* Claimed Areas Count */}
              {claimedAreas.length > 0 && (
                <div className="text-xs text-slate-400 mt-2">
                  Claimed areas: {claimedAreas.length + 1}
                </div>
              )}
            </>
          )}
        </div>

        {/* Canvas */}
        <div className={`bg-slate-800 shadow-2xl overflow-hidden border-y-2 border-slate-700 ${itemSidebarOpen ? '' : 'border-r-2 rounded-r-xl'} ${isWideMode ? 'flex-1' : ''}`} style={{ height: '680px' }}>
        <svg
          width={isWideMode ? "100%" : "900"} height="680"
          viewBox={isWideMode ? "-300 0 1500 680" : "0 0 900 680"}
          preserveAspectRatio="xMidYMin meet"
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setHoverInfo(null); setIsPanning(false); setIsRotating(false); setBaseVertices(null); setRotationAngle(0); }}
          onWheel={handleWheel}
          onDragOver={(e) => { e.preventDefault(); handleItemDragOver(e); }}
          onDrop={(e) => { handleItemDrop(e); handleFiefDrop(e); handlePatternDrop(e); }}
          className={isPanning ? "cursor-grabbing" : "cursor-crosshair"}
        >
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <circle cx="25" cy="25" r="1" fill="#334155" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="#1e293b" />
          <rect width="100%" height="100%" fill="url(#grid)" />

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {renderGrid()}
            {renderFiefAreas()}
            {renderStakeDropZones()}
            {renderFloorBelowSilhouette()}
            {renderShapes()}
            {renderPlacedItems()}
            {renderHoverPreview()}

            {shapes.length === 0 && !fiefMode && (
              <text x="450" y="300" textAnchor="middle" fill="#64748b" fontSize="16">
                Click anywhere to start building your foundation
              </text>
            )}
            {shapes.length === 0 && fiefMode && (
              <text x="450" y="300" textAnchor="middle" fill="#64748b" fontSize="16">
                Build within the green area. Drag stakes to expand.
              </text>
            )}
          </g>
        </svg>
        </div>

        {/* Right Sidebar - Items Panel (shows/hides on button click) */}
        {itemSidebarOpen && (
          <div className="bg-slate-800 rounded-r-xl border-2 border-l-0 border-slate-700 w-48 p-4 flex-shrink-0">
            <div className="text-amber-400 font-bold text-center text-lg mb-3">Item Mode</div>
            <div className="text-slate-300 font-medium text-sm mb-3">Base Items</div>

            {/* Item palette by category */}
            <div className="mb-4 max-h-64 overflow-y-auto custom-scrollbar">
              {Object.entries(ITEM_CATEGORIES).map(([categoryKey, category]) => {
                const categoryItems = Object.values(BASE_ITEMS).filter(item => item.category === categoryKey);
                if (categoryItems.length === 0) return null;

                return (
                  <div key={categoryKey} className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: category.color }} />
                      <span className="text-xs font-medium text-slate-300">{category.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 pl-2">
                      {categoryItems.map(item => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(e) => handleItemDragStart(item.id, e)}
                          className="bg-slate-700 rounded-lg p-1.5 cursor-grab active:cursor-grabbing hover:bg-slate-600 transition-colors"
                          title={item.name}
                        >
                          <img
                            src={item.icon}
                            alt={item.name}
                            className="w-full aspect-square object-contain rounded"
                            draggable={false}
                          />
                          <div className="text-[9px] text-slate-300 text-center mt-1 truncate">{item.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resource totals */}
            <div className="border-t border-slate-600 pt-3">
              <div className="text-slate-300 font-medium text-sm mb-2">Resources</div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-yellow-400">⚡ Power</span>
                <span className={netPower < 0 ? 'text-red-400 font-bold' : 'text-green-400'}>
                  {netPower >= 0 ? '+' : ''}{netPower}
                </span>
              </div>
              <div className="text-xs text-slate-500 mb-2 pl-4">
                +{resourceTotals.powerGenerated} / -{resourceTotals.powerConsumed}
              </div>
              {netPower < 0 && (
                <div className="bg-red-900/50 border border-red-500 rounded px-2 py-1 mb-2">
                  <span className="text-red-400 text-xs">⚠ Insufficient power!</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-blue-400">💧 Water/hr</span>
                <span className="text-blue-300">{waterPerHour.toFixed(1)} ml</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-cyan-400">🪣 Storage</span>
                <span className="text-cyan-300">{resourceTotals.waterStorage} ml</span>
              </div>
            </div>

            {/* Item count */}
            <div className="border-t border-slate-600 pt-3 mt-3">
              <div className="text-xs text-slate-500">Items on floor {currentFloor + 1}: {placedItems.length}</div>
            </div>

            {/* Material totals */}
            {materialTotals.length > 0 && (
              <div className="border-t border-slate-600 pt-3 mt-3">
                <div className="text-slate-300 font-medium text-sm mb-2">Total Materials</div>
                <div className="max-h-40 overflow-y-auto custom-scrollbar">
                  {materialTotals.map(([name, amount]) => (
                    <div key={name} className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400 truncate mr-2">{name}</span>
                      <span className="text-amber-300 font-medium">{amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clear Items button */}
            {placedItems.length > 0 && (
              <button
                onClick={() => { saveToHistory(); setPlacedItems([]); }}
                className="w-full bg-red-600/80 hover:bg-red-500 text-white text-sm py-1.5 rounded-lg transition-colors flex items-center justify-center gap-2 mt-3"
                title="Clear all items on this floor"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear Items
              </button>
            )}
          </div>
        )}
      </div>

      {/* Saved Patterns Panel - visible only in lock mode, right under canvas */}
      {isLocked && (
        <div className={`mt-3 ${isWideMode ? 'w-full px-48' : 'ml-[96px]'}`} style={isWideMode ? {} : { width: '900px' }}>
          <div className="bg-slate-800 rounded-xl border-2 border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-amber-400 font-bold text-lg">Saved Patterns</h3>
              <span className="text-slate-500 text-xs">Right-click a group to save · Drag to place</span>
            </div>
            {savedPatterns.length === 0 ? (
              <div className="text-slate-500 text-sm py-4 text-center">
                No patterns saved. Right-click on a connected group to save it as a pattern.
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2">
                {savedPatterns.map(pattern => {
                  // Calculate bounds of pattern shapes for thumbnail sizing
                  const minX = Math.min(...pattern.shapes.map(s => s.relX)) - SHAPE_SIZE/2;
                  const maxX = Math.max(...pattern.shapes.map(s => s.relX)) + SHAPE_SIZE/2;
                  const minY = Math.min(...pattern.shapes.map(s => s.relY)) - SHAPE_SIZE/2;
                  const maxY = Math.max(...pattern.shapes.map(s => s.relY)) + SHAPE_SIZE/2;
                  const width = maxX - minX;
                  const height = maxY - minY;
                  const scale = Math.min(60 / width, 60 / height, 1);
                  const offsetX = (70 - width * scale) / 2 - minX * scale;
                  const offsetY = (70 - height * scale) / 2 - minY * scale;

                  return (
                    <div
                      key={pattern.id}
                      className="relative flex-shrink-0 cursor-grab active:cursor-grabbing group"
                      draggable
                      onDragStart={(e) => {
                        setDraggingPattern(pattern);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onDragEnd={() => setDraggingPattern(null)}
                    >
                      <div className="w-[80px] h-[90px] bg-slate-700 rounded-lg border border-slate-600 hover:border-amber-500 transition-colors p-1 flex flex-col">
                        <svg width="70" height="70" className="flex-shrink-0">
                          <g transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}>
                            {pattern.shapes.map((ps, i) => {
                              // Preview always uses current building type colors
                              const colors = COLOR_SCHEMES[buildingType] || COLOR_SCHEMES.atreides;
                              const shapeColors = colors[ps.type] || colors.square;

                              // Use saved localVerts if available, otherwise calculate from rotation
                              let corners;
                              if (ps.localVerts) {
                                // localVerts are relative to shape center, add relX/relY to position
                                corners = ps.localVerts.map(v => ({
                                  x: ps.relX + v.x,
                                  y: ps.relY + v.y,
                                }));
                              } else {
                                // Fallback for old patterns
                                const h = SHAPE_SIZE / 2;
                                const rad = (ps.rotation * Math.PI) / 180;
                                const cos = Math.cos(rad);
                                const sin = Math.sin(rad);
                                let localVerts;

                                if (ps.type === 'square' || ps.type === 'stair') {
                                  localVerts = [
                                    { x: -h, y: -h }, { x: h, y: -h },
                                    { x: h, y: h }, { x: -h, y: h },
                                  ];
                                } else if (ps.type === 'corner') {
                                  localVerts = [
                                    { x: -h, y: -h }, { x: h, y: -h }, { x: -h, y: h },
                                  ];
                                } else {
                                  const apexY = -TRI_HEIGHT * 2 / 3;
                                  const baseY = TRI_HEIGHT / 3;
                                  localVerts = [
                                    { x: 0, y: apexY },
                                    { x: h, y: baseY },
                                    { x: -h, y: baseY },
                                  ];
                                }

                                corners = localVerts.map(c => ({
                                  x: ps.relX + c.x * cos - c.y * sin,
                                  y: ps.relY + c.x * sin + c.y * cos,
                                }));
                              }

                              return (
                                <polygon
                                  key={i}
                                  points={corners.map(c => `${c.x},${c.y}`).join(' ')}
                                  fill={shapeColors.fill}
                                  stroke={shapeColors.stroke}
                                  strokeWidth="2"
                                />
                              );
                            })}
                          </g>
                        </svg>
                        <div className="text-[10px] text-slate-400 text-center truncate px-1" title={pattern.name}>
                          {pattern.name}
                        </div>
                      </div>
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePattern(pattern.id);
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 hover:bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        title="Delete pattern"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instructions bar with stats and Share/Discord */}
      <div className="mt-3 bg-slate-800/50 px-4 py-2 rounded-lg ml-[96px]" style={{ width: '900px' }}>
        {/* Top row: Help, Grid, Stats, Share, Discord */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Help button */}
            <button
              onClick={() => setShowHelpModal(true)}
              className="bg-green-600 hover:bg-green-500 text-white w-7 h-7 rounded-lg text-base font-bold transition-colors flex items-center justify-center flex-shrink-0"
              title="Help (Press ? or H)"
            >
              ?
            </button>
            {gridEnabled && (
              <span className="text-cyan-400 font-medium text-sm">Grid Snap</span>
            )}
          </div>
          <div className="flex items-center gap-2">
          {/* Pieces and Cost */}
          <div className="bg-slate-800 px-3 py-1 rounded text-xs flex items-center gap-2">
            <span className="text-blue-400 font-medium">{squareCount}</span><span className="text-slate-500">□</span>
            <span className="text-orange-400 font-medium">{triangleCount}</span><span className="text-slate-500">△</span>
            <span className="text-green-400 font-medium">{cornerCount}</span><span className="text-slate-500">◗</span>
            <span className="text-purple-400 font-medium">{stairCount}</span><span className="text-slate-500">≡</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Cost:</span>
            {plastoneCost > 0 && (
              <><span className="text-amber-400 font-bold">{plastoneCost.toLocaleString()}</span><span className="text-slate-500">p</span></>
            )}
            {plastoneCost > 0 && graniteCost > 0 && <span className="text-slate-600">+</span>}
            {graniteCost > 0 && (
              <><span className="text-amber-400 font-bold">{graniteCost.toLocaleString()}</span><span className="text-slate-500">g</span></>
            )}
            {plastoneCost === 0 && graniteCost === 0 && <span className="text-slate-500">0</span>}
          </div>
          <button onClick={handleCopyLink}
            className={`${linkCopied ? 'bg-green-600' : 'bg-amber-600 hover:bg-amber-500'} text-white px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1`}>
            {linkCopied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </>
            )}
          </button>
          {urlTooLong && (
            <span className="text-orange-400 text-xs" title="Design is too large for Discord embeds. Link will still work in browsers.">
              URL exceeds Discord limit
            </span>
          )}
          <button onClick={() => setShowWebhookField(!showWebhookField)}
            className={`${showWebhookField ? 'bg-indigo-600' : 'bg-slate-700 hover:bg-slate-600'} text-white px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Discord
          </button>
        </div>
      </div>

      {/* Discord webhook input row */}
      {showWebhookField && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="Paste webhook URL..."
            className="bg-slate-700 text-white text-sm px-3 py-1.5 rounded-lg border border-slate-600 focus:outline-none focus:border-indigo-500 w-80"
          />
          <button
            onClick={handleSendToDiscord}
            disabled={!webhookUrl || shapes.length === 0 || sendingToDiscord}
            className={`${discordSent ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-500'} disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1`}
          >
            {sendingToDiscord ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending...
              </>
            ) : discordSent ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Sent!
              </>
            ) : (
              'Send to Discord'
            )}
          </button>
        </div>
      )}
        {/* Bottom row: Mode-specific instructions */}
        <div className="mt-2 pt-2 border-t border-slate-700/50">
          {itemMode ? (
            <p className="text-slate-400 text-sm text-center">
              <span className="text-purple-400 font-medium">Item Mode:</span>
              <span className="ml-2">Drag</span> to move ·
              <span className="ml-2">Right-click</span> to delete
            </p>
          ) : isLocked ? (
            <p className="text-slate-400 text-sm text-center">
              <span className="text-amber-400 font-medium">Lock Mode:</span>
              <span className="ml-2">Drag</span> to move ·
              <span className="ml-2">Shift+drag</span> to rotate ·
              <span className="ml-2">Right-click</span> to save pattern
            </p>
          ) : (
            <p className="text-slate-400 text-sm text-center">
              <span className="text-blue-400 font-medium">Design:</span>
              <span className="ml-2">Hold+drag</span> to rotate ·
              <span className="ml-2">1-5</span> to change shape ·
              <span className="ml-2">Scroll</span> to zoom
            </p>
          )}
        </div>
      </div>

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm flex items-center gap-2 animate-slide-in ${
              toast.type === 'success' ? 'bg-green-600' :
              toast.type === 'error' ? 'bg-red-600' :
              toast.type === 'warning' ? 'bg-amber-600' :
              'bg-slate-700'
            }`}
          >
            {toast.type === 'success' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {toast.message}
          </div>
        ))}
      </div>

      {/* Restore Session Prompt */}
      {showRestorePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl border-2 border-slate-700 max-w-md">
            <h3 className="text-xl font-bold text-white mb-3">Welcome Back!</h3>
            <p className="text-slate-300 mb-4">
              We found a saved design from your last session. Would you like to continue where you left off?
            </p>
            <div className="flex gap-3">
              <button
                onClick={restoreFromLocalStorage}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Restore Design
              </button>
              <button
                onClick={dismissRestorePrompt}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowHelpModal(false)}>
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl border-2 border-slate-700 max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Help</h3>
              <button onClick={() => setShowHelpModal(false)} className="text-slate-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Navigation */}
              <div>
                <h4 className="text-slate-400 font-medium mb-2">Navigation</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Pan</span>
                    <span className="text-slate-400 text-xs">Middle-drag or Shift+drag</span>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Zoom</span>
                    <span className="text-slate-400 text-xs">Scroll wheel</span>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Undo</span>
                    <kbd className="bg-slate-600 px-2 py-0.5 rounded text-xs text-white">Ctrl+Z</kbd>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Toggle grid snap</span>
                    <kbd className="bg-slate-600 px-2 py-0.5 rounded text-xs text-white">G</kbd>
                  </div>
                </div>
              </div>

              {/* Design Mode */}
              <div>
                <h4 className="text-blue-400 font-medium mb-2">Design Mode</h4>
                <p className="text-slate-500 text-xs mb-2">Place foundation shapes on the canvas</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Place with rotation</span>
                    <span className="text-slate-400 text-xs">Hold click + drag</span>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Place without rotation</span>
                    <span className="text-slate-400 text-xs">Click or middle-click</span>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Set left-click shape</span>
                    <span className="text-slate-400 text-xs">1-5</span>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Set right-click shape</span>
                    <span className="text-slate-400 text-xs">Shift + 1-5</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  1=Square · 2=Triangle · 3=Corner · 4=Stair · 5=Delete
                </div>
              </div>

              {/* Lock Mode */}
              <div>
                <h4 className="text-amber-400 font-medium mb-2">Lock Mode <kbd className="bg-slate-600 px-1.5 py-0.5 rounded text-xs text-white ml-2">L</kbd></h4>
                <p className="text-slate-500 text-xs mb-2">Move and copy connected shape groups</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Move group</span>
                    <span className="text-slate-400 text-xs">Drag</span>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Rotate group</span>
                    <span className="text-slate-400 text-xs">Shift + drag</span>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Copy/Paste group</span>
                    <span className="text-slate-400 text-xs">Ctrl+C / Ctrl+V</span>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Save as pattern</span>
                    <span className="text-slate-400 text-xs">Right-click group</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Saved patterns appear in a bar below the canvas. Drag to place.
                </div>
              </div>

              {/* Item Mode */}
              <div>
                <h4 className="text-purple-400 font-medium mb-2">Item Mode</h4>
                <p className="text-slate-500 text-xs mb-2">Place base management items (generators, refiners, etc.)</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Add item</span>
                    <span className="text-slate-400 text-xs">Drag from right panel</span>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Move item</span>
                    <span className="text-slate-400 text-xs">Drag on canvas</span>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Delete item</span>
                    <span className="text-slate-400 text-xs">Right-click or Del</span>
                  </div>
                  <div className="flex justify-between bg-slate-700/50 px-3 py-1.5 rounded">
                    <span className="text-slate-300">Deselect</span>
                    <kbd className="bg-slate-600 px-2 py-0.5 rounded text-xs text-white">Esc</kbd>
                  </div>
                </div>
              </div>

              {/* Fief & Floors */}
              <div>
                <h4 className="text-green-400 font-medium mb-2">Fief & Floors</h4>
                <div className="text-sm text-slate-300 space-y-1">
                  <p>• Drag a <span className="text-amber-400">fief</span> from the left panel to set your build boundary</p>
                  <p>• Drag <span className="text-amber-400">stakes</span> to adjacent zones to expand your territory</p>
                  <p>• Use the <span className="text-amber-400">floor selector</span> in the toolbar for multi-story builds</p>
                </div>
              </div>

              {/* Saving & Sharing */}
              <div className="border-t border-slate-600 pt-4">
                <h4 className="text-cyan-400 font-medium mb-2">Saving & Sharing</h4>
                <div className="text-sm text-slate-300 space-y-1">
                  <p>• Your design <span className="text-green-400">auto-saves</span> every 30 seconds</p>
                  <p>• Click <span className="text-amber-400">Share</span> to copy a link to your design</p>
                  <p>• Use the <span className="text-indigo-400">Discord</span> button to post directly to a channel</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pattern Name Modal */}
      {showPatternNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowPatternNameModal(false)}>
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl border-2 border-slate-700 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Save Pattern</h3>
            <input
              type="text"
              value={patternName}
              onChange={(e) => setPatternName(e.target.value)}
              placeholder="Enter pattern name..."
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && patternName.trim() && pendingPatternShapes) {
                  savePattern(patternName.trim(), pendingPatternShapes);
                  setShowPatternNameModal(false);
                  setPendingPatternShapes(null);
                  setPatternName('');
                } else if (e.key === 'Escape') {
                  setShowPatternNameModal(false);
                  setPendingPatternShapes(null);
                  setPatternName('');
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowPatternNameModal(false);
                  setPendingPatternShapes(null);
                  setPatternName('');
                }}
                className="flex-1 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (patternName.trim() && pendingPatternShapes) {
                    savePattern(patternName.trim(), pendingPatternShapes);
                    setShowPatternNameModal(false);
                    setPendingPatternShapes(null);
                    setPatternName('');
                  }
                }}
                disabled={!patternName.trim()}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
