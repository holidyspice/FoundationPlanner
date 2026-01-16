import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  },
  harkonnen: {
    // Red palette
    square:   { fill: '#ef4444', stroke: '#f87171' },  // red-500/400
    triangle: { fill: '#dc2626', stroke: '#ef4444' },  // red-600/500
    corner:   { fill: '#b91c1c', stroke: '#dc2626' },  // red-700/600
  },
  choamShelter: {
    // Beige/tan palette
    square:   { fill: '#d4a574', stroke: '#e4c9a8' },  // warm beige
    triangle: { fill: '#c4956a', stroke: '#d4a574' },  // medium beige
    corner:   { fill: '#b08560', stroke: '#c4956a' },  // darker beige
  },
  choamFacility: {
    // Gray palette
    square:   { fill: '#6b7280', stroke: '#9ca3af' },  // gray-500/400
    triangle: { fill: '#4b5563', stroke: '#6b7280' },  // gray-600/500
    corner:   { fill: '#374151', stroke: '#4b5563' },  // gray-700/600
  },
};

const CORNER_STEPS = 3; // Number of steps for Atreides stepped corners
const DIAGONAL_FLAT_RATIO = 0.27; // Size of small flats on Choam Facility corners (27%)

const FIEF_DEFAULTS = {
  basic: { width: 5, height: 5 },
  advanced: { width: 10, height: 10 },
};
const MAX_STAKES = 5;

export default function App() {
  const [shapes, setShapes] = useState([]);
  const [hoverInfo, setHoverInfo] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [buildingType, setBuildingType] = useState('atreides');
  const [leftClickShape, setLeftClickShape] = useState('square');
  const [rightClickShape, setRightClickShape] = useState('triangle');
  const [deleteMethod, setDeleteMethod] = useState('middle'); // 'middle' or 'shift'

  // Rotation mode state
  const [isRotating, setIsRotating] = useState(false);
  const [rotatingButton, setRotatingButton] = useState(null); // 'left' or 'right'
  const [rotationStartX, setRotationStartX] = useState(0);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [baseVertices, setBaseVertices] = useState(null);
  const [rotationShapeType, setRotationShapeType] = useState(null);

  // Fief mode state
  const [fiefMode, setFiefMode] = useState(false);
  const [fiefType, setFiefType] = useState('basic'); // 'basic' or 'advanced'
  const [fiefWidth, setFiefWidth] = useState(FIEF_DEFAULTS.basic.width);
  const [fiefHeight, setFiefHeight] = useState(FIEF_DEFAULTS.basic.height);
  const [fiefPadding, setFiefPadding] = useState(0); // Padding percentage to EXPAND fief (0-5%)

  // Stakes state
  const [stakesInventory, setStakesInventory] = useState(MAX_STAKES);
  const [placedStakes, setPlacedStakes] = useState([]); // { id, direction, parentId, countdown, claimed }
  const [claimedAreas, setClaimedAreas] = useState([]); // { id, direction, parentId } - completed claims
  const [draggingStake, setDraggingStake] = useState(null); // stake being dragged from inventory
  const [stakeDropZone, setStakeDropZone] = useState(null); // which zone is being hovered
  const [linkCopied, setLinkCopied] = useState(false); // feedback for copy link button
  const [middleMouseStart, setMiddleMouseStart] = useState(null); // track middle mouse for pan vs click detection

  // Discord webhook state
  const [showWebhookField, setShowWebhookField] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [sendingToDiscord, setSendingToDiscord] = useState(false);
  const [discordSent, setDiscordSent] = useState(false);

  // =====================================================
  // KEYBOARD SHORTCUTS
  // =====================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShapes(prev => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

          // Detect format: ultra-compact (arrays), compact (objects with t/v), or old (shapes key)
          if (state.s && state.s.length > 0) {
            const isUltraCompact = Array.isArray(state.s[0]);

            // Type maps for different formats
            const typeFromCode = ['square', 'triangle', 'corner'];
            const typeFromChar = { s: 'square', t: 'triangle', c: 'corner' };
            const buildingFromCode = ['atreides', 'harkonnen', 'choamShelter', 'choamFacility'];
            const buildingFromChar = { a: 'atreides', h: 'harkonnen', cs: 'choamShelter', cf: 'choamFacility' };
            const shapeFromCode = ['square', 'triangle', 'corner'];
            const shapeFromChar = { s: 'square', t: 'triangle', c: 'corner' };
            const dirFromCode = ['top', 'bottom', 'left', 'right'];
            const dirFromChar = { t: 'top', b: 'bottom', l: 'left', r: 'right' };

            // Get default building type from state (for backward compatibility)
            const defaultBuilding = state.b !== undefined
              ? (typeof state.b === 'number' ? buildingFromCode[state.b] : buildingFromChar[state.b] || 'atreides')
              : 'atreides';

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
                if (type === 'square') {
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
            if (state.d !== undefined) {
              setDeleteMethod(state.d === 1 || state.d === 's' ? 'shift' : 'middle');
            }
            if (state.fm !== undefined) setFiefMode(state.fm === 1);
            if (state.ft !== undefined) setFiefType(state.ft === 1 || state.ft === 'a' ? 'advanced' : 'basic');
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
          } else if (state.s && state.s.length === 0) {
            // Empty design
            setShapes([]);
          } else {
            // Old format - direct mapping
            if (state.shapes) setShapes(state.shapes);
            if (state.buildingType) setBuildingType(state.buildingType);
            if (state.leftClickShape) setLeftClickShape(state.leftClickShape);
            if (state.rightClickShape) setRightClickShape(state.rightClickShape);
            if (state.deleteMethod) setDeleteMethod(state.deleteMethod);
            if (state.fiefMode !== undefined) setFiefMode(state.fiefMode);
            if (state.fiefType) setFiefType(state.fiefType);
            if (state.fiefWidth) setFiefWidth(state.fiefWidth);
            if (state.fiefHeight) setFiefHeight(state.fiefHeight);
            if (state.fiefPadding !== undefined) setFiefPadding(state.fiefPadding);
            if (state.stakesInventory !== undefined) setStakesInventory(state.stakesInventory);
            if (state.claimedAreas) setClaimedAreas(state.claimedAreas);
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
    // Ultra-compact shape format: [type, building, x1, y1, x2, y2, ...] as flat array with integers
    const minShapes = shapes.map(s => {
      const verts = s._verts || [];
      // First element is type code (0=square, 1=triangle, 2=corner)
      // Second element is building code (0=atreides, 1=harkonnen, 2=choamShelter, 3=choamFacility)
      // Rest are integer coordinates
      const typeCode = s.type === 'square' ? 0 : s.type === 'triangle' ? 1 : 2;
      const buildingCode = s.building === 'atreides' ? 0 : s.building === 'harkonnen' ? 1 : s.building === 'choamShelter' ? 2 : s.building === 'choamFacility' ? 3 : 0;
      return [typeCode, buildingCode, ...verts.flatMap(pt => [Math.round(pt.x), Math.round(pt.y)])];
    });

    // Minimal claimed areas as arrays [direction, parentId]
    const minClaimed = claimedAreas.map(a => [
      a.direction === 'top' ? 0 : a.direction === 'bottom' ? 1 : a.direction === 'left' ? 2 : 3,
      a.parentId === 'main' ? 0 : a.parentId,
    ]);

    // Build state object, only including non-default values
    const state = { s: minShapes };

    // Building type: 0=atreides, 1=harkonnen, 2=choamShelter, 3=choamFacility
    const btCode = buildingType === 'atreides' ? 0 : buildingType === 'harkonnen' ? 1 : buildingType === 'choamShelter' ? 2 : 3;
    if (btCode !== 0) state.b = btCode;

    // Only include if different from defaults
    if (leftClickShape !== 'square') state.l = leftClickShape === 'triangle' ? 1 : 2;
    if (rightClickShape !== 'triangle') state.r = rightClickShape === 'square' ? 0 : 2;
    if (deleteMethod !== 'middle') state.d = 1;
    if (fiefMode) {
      state.fm = 1;
      if (fiefType !== 'basic') state.ft = 1;
      if (fiefWidth !== FIEF_DEFAULTS[fiefType].width) state.fw = fiefWidth;
      if (fiefHeight !== FIEF_DEFAULTS[fiefType].height) state.fh = fiefHeight;
      if (fiefPadding !== 0) state.fp = Math.round(fiefPadding * 10) / 10;
      if (stakesInventory !== MAX_STAKES) state.si = stakesInventory;
      if (minClaimed.length > 0) state.ca = minClaimed;
    }

    return LZString.compressToEncodedURIComponent(JSON.stringify(state));
  }, [shapes, buildingType, leftClickShape, rightClickShape, deleteMethod, fiefMode, fiefType, fiefWidth, fiefHeight, fiefPadding, stakesInventory, claimedAreas]);

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
  // FIEF AREA CALCULATIONS
  // Canvas center for fief positioning
  // =====================================================
  const canvasCenter = { x: 450, y: 300 }; // SVG center

  // Calculate all buildable areas (main fief + claimed stakes)
  const getBuildableAreas = useCallback(() => {
    if (!fiefMode) return [];

    const areas = [];
    const fiefW = fiefWidth * CELL_SIZE;
    const fiefH = fiefHeight * CELL_SIZE;

    // Main fief area (centered)
    const mainFief = {
      id: 'main',
      x: canvasCenter.x - fiefW / 2,
      y: canvasCenter.y - fiefH / 2,
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
  }, [fiefMode, fiefWidth, fiefHeight, claimedAreas, placedStakes]);

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
    if (type === 'square') {
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
      const totalCost = shapes.length * currentBuilding.cost;

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
      const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
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
      const descLines = [
        `**Building Style:** ${currentBuilding.label}`,
        `**Pieces:** ${shapes.length} total`,
        `  • ${sqCount} squares, ${triCount} triangles, ${cornCount} corners`,
        `**Material Cost:** ${totalCost.toLocaleString()} ${currentBuilding.material}`,
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

    if (shapeType === 'square') {
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
    if (shapeType === 'square') {
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

    for (const shape of shapes) {
      // Each existing shape uses its own building type for collision
      const existingVerts = getCollisionVertices(shape);

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
    if (shapeType === 'square') {
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

    if (isPanning) {
      setPan({ x: screenX - panStart.x, y: screenY - panStart.y });
      return;
    }

    // Handle rotation mode - update angle based on horizontal drag
    if (isRotating && baseVertices) {
      const deltaX = screenX - rotationStartX;
      const newAngle = deltaX * 0.5; // 0.5 degrees per pixel
      setRotationAngle(newAngle);
      return;
    }

    const { x: px, y: py } = screenToWorld(screenX, screenY);
    const { edge, distance } = findClosestEdge(px, py);

    let leftVerts, rightVerts;

    if (!edge || distance > SNAP_THRESHOLD) {
      leftVerts = getFreeVertices(px, py, leftClickShape);
      rightVerts = getFreeVertices(px, py, rightClickShape);
      setHoverInfo({ freePlace: true, x: px, y: py, leftVerts, rightVerts });
    } else {
      leftVerts = calculateSnappedVertices(edge, leftClickShape, px, py);
      rightVerts = calculateSnappedVertices(edge, rightClickShape, px, py);
      setHoverInfo({ freePlace: false, edge, leftVerts, rightVerts });
    }
  }, [findClosestEdge, calculateSnappedVertices, screenToWorld, isPanning, panStart, isRotating, baseVertices, rotationStartX, leftClickShape, rightClickShape, getFreeVertices]);

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

    // Shift+click delete (when shift click is the delete method)
    if (e.shiftKey && deleteMethod === 'shift' && (e.button === 0 || e.button === 2)) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const { x: px, y: py } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const shape = findShapeAtPoint(px, py);
      if (shape) setShapes(prev => prev.filter(s => s.id !== shape.id));
      return;
    }

    // Shift+left click for panning (only when delete method is middle mouse)
    if (e.button === 0 && e.shiftKey && deleteMethod === 'middle') {
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

    // Start rotation mode on left or right click
    if (e.button === 0 || e.button === 2) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const { x: px, y: py } = screenToWorld(screenX, e.clientY - rect.top);

      const shapeType = e.button === 0 ? leftClickShape : rightClickShape;
      const { edge, distance } = findClosestEdge(px, py);

      let verts;
      if (!edge || distance > SNAP_THRESHOLD) {
        verts = getFreeVertices(px, py, shapeType);
      } else {
        verts = calculateSnappedVertices(edge, shapeType, px, py);
      }

      setIsRotating(true);
      setRotatingButton(e.button === 0 ? 'left' : 'right');
      setRotationStartX(screenX);
      setRotationAngle(0);
      setBaseVertices(verts);
      setRotationShapeType(shapeType);
    }
  }, [pan, isRotating, rotatingButton, screenToWorld, findClosestEdge, calculateSnappedVertices, leftClickShape, rightClickShape, getFreeVertices, deleteMethod, findShapeAtPoint]);

  const handleMouseUp = useCallback((e) => {
    // Handle middle mouse button release
    if (e.button === 1) {
      setIsPanning(false);
      // If minimal movement, treat as click for delete (when delete method is middle)
      if (middleMouseStart && deleteMethod === 'middle') {
        const rect = e.currentTarget.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        const dist = Math.sqrt((endX - middleMouseStart.x) ** 2 + (endY - middleMouseStart.y) ** 2);
        if (dist < 5) {
          // Treat as click - delete shape
          const { x: px, y: py } = screenToWorld(endX, endY);
          const shape = findShapeAtPoint(px, py);
          if (shape) setShapes(prev => prev.filter(s => s.id !== shape.id));
        }
      }
      setMiddleMouseStart(null);
      return;
    }

    setIsPanning(false);

    // Place shape on release if in rotation mode
    if (isRotating && baseVertices) {
      const releasedButton = e.button === 0 ? 'left' : 'right';
      if (releasedButton === rotatingButton) {
        const rotatedVerts = rotateVertices(baseVertices, rotationAngle);
        if (!checkOverlap(rotatedVerts, rotationShapeType)) {
          setShapes(prev => [...prev, verticesToShape(rotatedVerts, rotationShapeType, Date.now(), buildingType)]);
        }
      }
      setIsRotating(false);
      setRotatingButton(null);
      setBaseVertices(null);
      setRotationAngle(0);
    }
  }, [isRotating, rotatingButton, baseVertices, rotationAngle, rotationShapeType, rotateVertices, checkOverlap, verticesToShape, middleMouseStart, deleteMethod, screenToWorld, findShapeAtPoint, buildingType]);

  const handleClear = () => {
    setShapes([]);
    setHoverInfo(null);
    // Reset fief stakes
    setStakesInventory(MAX_STAKES);
    setPlacedStakes([]);
    setClaimedAreas([]);
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
      const verts = shape._verts || getVertices(shape);
      const shapeBuilding = shape.building || 'atreides';
      const cornerStyle = BUILDING_TYPES[shapeBuilding]?.cornerStyle || 'round';
      const colors = COLOR_SCHEMES[shapeBuilding]?.[shape.type] || COLOR_SCHEMES.atreides[shape.type];
      return renderPolygon(verts, colors.fill, '#0f172a', shape.id, 1, false, shape.type, cornerStyle);
    });
  };

  const renderHoverPreview = () => {
    const cornerStyle = BUILDING_TYPES[buildingType]?.cornerStyle || 'round';

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

    // Left click preview
    if (leftVerts && !checkOverlap(leftVerts, leftClickShape)) {
      const leftColors = getShapeColors(leftClickShape);
      elements.push(renderPolygon(leftVerts, leftColors.fill, leftColors.stroke, 'prev-left', 0.4, true, leftClickShape, cornerStyle));
      if (leftClickShape === 'corner') {
        elements.push(
          <circle key="corner-dot-left" cx={leftVerts[0].x} cy={leftVerts[0].y} r={6}
            fill="#fbbf24" stroke="#0f172a" strokeWidth={2} style={{ pointerEvents: 'none' }} />
        );
      }
    }

    // Right click preview (only if different from left)
    if (rightVerts && !checkOverlap(rightVerts, rightClickShape)) {
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
  const currentBuilding = BUILDING_TYPES[buildingType];
  const totalCost = shapes.length * currentBuilding.cost;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 p-4 flex flex-col items-center">
      <div className="mb-4 text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
          Dune: Awakening Base Planner
        </h1>
        <p className="text-slate-400 text-base">A <a href="https://www.holidyspice.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline">Holidy Spice</a> Community Tool</p>
      </div>

      {/* Instructions bar with Share/Discord on right */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-4 bg-slate-800/50 px-4 py-2 rounded-lg">
        <p className="text-slate-400 text-sm">
          <span className="text-slate-400">Hold + Drag</span> Rotate ·
          <span className="text-slate-400 ml-2">Scroll</span> Zoom ·
          <span className="text-slate-400 ml-2">Middle Drag</span> Pan ·
          <span className="text-slate-400 ml-2">Ctrl+Z</span> Undo
        </p>
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2 mb-3">
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

      {/* Controls row: mouse assignments, clear, reset view, zoom */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
        <div className="bg-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
          <label className="text-blue-400 text-sm font-medium">Left Click:</label>
          <select value={leftClickShape} onChange={(e) => setLeftClickShape(e.target.value)}
            className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-blue-500">
            <option value="square">Square</option>
            <option value="triangle">Triangle</option>
            <option value="corner">Corner</option>
          </select>
        </div>

        <div className="bg-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
          <label className="text-orange-400 text-sm font-medium">Right Click:</label>
          <select value={rightClickShape} onChange={(e) => setRightClickShape(e.target.value)}
            className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-orange-500">
            <option value="square">Square</option>
            <option value="triangle">Triangle</option>
            <option value="corner">Corner</option>
          </select>
        </div>

        <div className="bg-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
          <label className="text-red-400 text-sm font-medium">Delete:</label>
          <select value={deleteMethod} onChange={(e) => setDeleteMethod(e.target.value)}
            className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-red-500">
            <option value="middle">Middle Mouse</option>
            <option value="shift">Shift + Click</option>
          </select>
        </div>

        <button onClick={handleClear} disabled={shapes.length === 0}
          className="bg-red-600/80 hover:bg-red-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
          Clear
        </button>
        <button onClick={handleResetView}
          className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
          Reset View
        </button>

        <div className="bg-slate-800 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
          <span className="text-slate-400">Zoom:</span>
          <span className="text-slate-300">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Left Sidebar - Building Type & Fief Controls */}
        <div className="bg-slate-800 rounded-xl p-4 w-48 flex flex-col gap-3 border-2 border-slate-700">
          {/* Building Type */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 font-medium text-sm">Building Type</label>
            <select value={buildingType} onChange={(e) => setBuildingType(e.target.value)}
              className="bg-slate-700 text-white text-sm px-2 py-1.5 rounded border border-slate-600 focus:outline-none focus:border-amber-500">
              {Object.entries(BUILDING_TYPES).map(([key, bt]) => (
                <option key={key} value={key}>{bt.label}</option>
              ))}
            </select>
          </div>

          <div className="text-slate-300 font-medium text-sm border-t border-slate-600 pt-3">Fief Mode</div>

          {/* Fief Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={fiefMode}
              onChange={(e) => setFiefMode(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            <span className={`text-sm ${fiefMode ? 'text-amber-400' : 'text-slate-400'}`}>
              {fiefMode ? 'Enabled' : 'Disabled'}
            </span>
          </label>

          {/* Fief Type Selector - shown when fief mode enabled */}
          {fiefMode && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-slate-400 text-xs">Fief Type</label>
                <select
                  value={fiefType}
                  onChange={(e) => setFiefType(e.target.value)}
                  className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-amber-500"
                >
                  <option value="basic">Basic</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              {/* Size Adjusters */}
              <div className="flex flex-col gap-1">
                <label className="text-slate-400 text-xs">Width (cells)</label>
                <input
                  type="number"
                  value={fiefWidth}
                  onChange={(e) => setFiefWidth(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  max="20"
                  className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-amber-500 w-full"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-400 text-xs">Height (cells)</label>
                <input
                  type="number"
                  value={fiefHeight}
                  onChange={(e) => setFiefHeight(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  max="20"
                  className="bg-slate-700 text-white text-sm px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-amber-500 w-full"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-400 text-xs">Padding (+{fiefPadding.toFixed(1)}%)</label>
                <input
                  type="range"
                  value={fiefPadding}
                  onChange={(e) => setFiefPadding(parseFloat(e.target.value))}
                  min="0"
                  max="5"
                  step="0.1"
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>0%</span>
                  <span>5%</span>
                </div>
              </div>

              {/* Stakes Section */}
              <div className="border-t border-slate-600 pt-2 mt-1">
                <div className="text-slate-300 font-medium text-sm mb-2">Stakes ({stakesInventory}/{MAX_STAKES})</div>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: stakesInventory }).map((_, i) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={handleStakeDragStart}
                      onDragEnd={handleStakeDragEnd}
                      className="w-10 h-10 bg-amber-600 hover:bg-amber-500 rounded-lg flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors border-2 border-amber-400"
                      title="Drag to place stake"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <path d="M12 2L12 14M12 14L8 10M12 14L16 10" />
                        <path d="M5 22H19" />
                        <path d="M12 14V22" />
                      </svg>
                    </div>
                  ))}
                  {stakesInventory === 0 && (
                    <div className="text-slate-500 text-xs italic">No stakes left</div>
                  )}
                </div>
                <p className="text-slate-500 text-xs mt-2">
                  Drag stakes to expand your claim
                </p>
              </div>

              {/* Claimed Areas Count */}
              {claimedAreas.length > 0 && (
                <div className="text-xs text-slate-400">
                  Claimed areas: {claimedAreas.length + 1}
                </div>
              )}
            </>
          )}
        </div>

        {/* Canvas */}
        <div className="bg-slate-800 rounded-xl shadow-2xl overflow-hidden border-2 border-slate-700">
        <svg
          width="900" height="600"
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setHoverInfo(null); setIsPanning(false); setIsRotating(false); setBaseVertices(null); setRotationAngle(0); }}
          onWheel={handleWheel}
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
            {renderFiefAreas()}
            {renderStakeDropZones()}
            {renderShapes()}
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
      </div>

      {/* Stats row below canvas */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
        <div className="bg-slate-800 px-4 py-2 rounded-lg text-sm flex items-center gap-3">
          <span className="text-slate-400">Pieces:</span>
          <span className="text-blue-400 font-medium">{squareCount}</span><span className="text-slate-500">□</span>
          <span className="text-orange-400 font-medium">{triangleCount}</span><span className="text-slate-500">△</span>
          <span className="text-green-400 font-medium">{cornerCount}</span><span className="text-slate-500">◗</span>
          <span className="text-slate-400 ml-2">Total:</span>
          <span className="text-white font-medium">{shapes.length}</span>
        </div>

        <div className="bg-slate-800 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <span className="text-slate-400">Cost:</span>
          <span className="text-amber-400 font-bold">{totalCost.toLocaleString()}</span>
          <span className="text-slate-500">{currentBuilding.material}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 text-center">
        <p className="text-slate-500 text-sm">
          Dune: Awakening Base Planner • A <a href="https://www.holidyspice.com" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-400 underline">Holidy Spice</a> Community Tool
        </p>
      </div>
    </div>
  );
}
