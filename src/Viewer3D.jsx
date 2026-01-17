import React, { useMemo, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import * as THREE from 'three';

// Constants matching the 2D planner
const SHAPE_SIZE = 50;
const FOUNDATION_HEIGHT = 5;
const WALL_HEIGHT = SHAPE_SIZE;
const HALF_WALL_HEIGHT = SHAPE_SIZE / 2;

// Colors for building types
const BUILDING_COLORS = {
  atreides: { foundation: '#22c55e', wall: '#16a34a' },
  harkonnen: { foundation: '#ef4444', wall: '#dc2626' },
  choamShelter: { foundation: '#d4a574', wall: '#c4956a' },
  choamFacility: { foundation: '#6b7280', wall: '#4b5563' },
};

// Foundation piece component - uses ExtrudeGeometry with corrected coordinates
function Foundation({ vertices, building = 'atreides', onClick }) {
  const color = BUILDING_COLORS[building]?.foundation || BUILDING_COLORS.atreides.foundation;

  // Don't render if no valid vertices
  if (!vertices || vertices.length < 3) {
    return null;
  }

  // Create shape from vertices
  // Negate Y to match the wall coordinate system (2D Y → 3D +Z after rotation)
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(vertices[0].x, -vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      s.lineTo(vertices[i].x, -vertices[i].y);
    }
    s.closePath();
    return s;
  }, [vertices]);

  const extrudeSettings = {
    depth: FOUNDATION_HEIGHT,
    bevelEnabled: false,
  };

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onClick={onClick}
    >
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// Wall piece component with side offset support
function Wall({ start, end, height = WALL_HEIGHT, building = 'atreides', floor = 0, side = 0 }) {
  const color = BUILDING_COLORS[building]?.wall || BUILDING_COLORS.atreides.wall;

  // Calculate wall position and dimensions
  const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const baseHeight = floor * WALL_HEIGHT + FOUNDATION_HEIGHT;

  // Calculate perpendicular offset for wall side
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / len;
  const perpY = dx / len;
  const offsetAmount = side * 2.5; // Half of wall thickness (5/2)

  return (
    <mesh
      position={[midX + perpX * offsetAmount, baseHeight + height / 2, midY + perpY * offsetAmount]}
      rotation={[0, -angle, 0]}
    >
      <boxGeometry args={[length, height, 5]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// Triangle wall (gable) component - sits ON TOP of wall at given floor
function TriangleWall({ start, end, building = 'atreides', floor = 0, side = 0 }) {
  const color = BUILDING_COLORS[building]?.wall || BUILDING_COLORS.atreides.wall;

  const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Triangle sits ON TOP of the wall at this floor, so add WALL_HEIGHT
  const baseHeight = (floor + 1) * WALL_HEIGHT + FOUNDATION_HEIGHT;

  // Calculate perpendicular offset for wall side
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / len;
  const perpY = dx / len;
  const offsetAmount = side * 2.5; // Half of wall thickness (5/2)

  // Create triangle shape
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-length / 2, 0);
    s.lineTo(length / 2, 0);
    s.lineTo(0, WALL_HEIGHT);
    s.closePath();
    return s;
  }, [length]);

  const extrudeSettings = {
    depth: 5,
    bevelEnabled: false,
  };

  return (
    <mesh
      position={[midX + perpX * offsetAmount, baseHeight, midY + perpY * offsetAmount]}
      rotation={[0, -angle, Math.PI / 2]}
    >
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// Flat roof component - looks up vertices from shapes at render time
function FlatRoof({ shapes, shapeId, shapeIndex, building = 'atreides', floor = 1 }) {
  const color = BUILDING_COLORS[building]?.foundation || BUILDING_COLORS.atreides.foundation;

  // Find the shape by ID or index
  const shape = shapes.find(s => s.id === shapeId) || shapes[shapeIndex];
  const vertices = shape?._verts;

  // Don't render if no valid vertices
  if (!vertices || vertices.length < 3) {
    return null;
  }

  // Calculate bounding box of vertices
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  vertices.forEach(v => {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  });

  const centerX = (minX + maxX) / 2;
  const centerZ = (minY + maxY) / 2; // Y in 2D becomes Z in 3D
  const width = maxX - minX;
  const depth = maxY - minY;

  const baseHeight = floor * WALL_HEIGHT + FOUNDATION_HEIGHT;

  // Use simple box geometry positioned at the center of the foundation
  return (
    <mesh position={[centerX, baseHeight + 1.5, centerZ]}>
      <boxGeometry args={[width, 3, depth]} />
      <meshStandardMaterial color={color} opacity={0.8} transparent />
    </mesh>
  );
}

// Edge highlight for wall placement
function EdgeHighlight({ start, end, isHovered }) {
  if (!isHovered) return null;

  const points = [
    new THREE.Vector3(start.x, FOUNDATION_HEIGHT + 1, start.y),
    new THREE.Vector3(end.x, FOUNDATION_HEIGHT + 1, end.y),
  ];

  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color="#fbbf24" linewidth={3} />
    </line>
  );
}

// Wall preview component for showing placement before confirming
function WallPreview({ start, end, height, floor, side, type }) {
  const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Calculate perpendicular offset
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / len;
  const perpY = dx / len;
  const offsetAmount = side * 2.5;

  if (type === 'triangleWall') {
    const baseHeight = (floor + 1) * WALL_HEIGHT + FOUNDATION_HEIGHT;
    return (
      <mesh
        position={[midX + perpX * offsetAmount, baseHeight + WALL_HEIGHT / 2, midY + perpY * offsetAmount]}
        rotation={[0, -angle, Math.PI / 2]}
      >
        <coneGeometry args={[length / 2, WALL_HEIGHT, 3]} />
        <meshStandardMaterial color="#fbbf24" transparent opacity={0.6} />
      </mesh>
    );
  }

  const baseHeight = floor * WALL_HEIGHT + FOUNDATION_HEIGHT;
  return (
    <mesh
      position={[midX + perpX * offsetAmount, baseHeight + height / 2, midY + perpY * offsetAmount]}
      rotation={[0, -angle, 0]}
    >
      <boxGeometry args={[length, height, 5]} />
      <meshStandardMaterial color="#fbbf24" transparent opacity={0.6} />
    </mesh>
  );
}

// Main 3D Viewer component
export default function Viewer3D({ shapes, buildingType, onBack, walls, setWalls, roofs, setRoofs }) {
  const [selectedWallType, setSelectedWallType] = useState('wall'); // 'wall', 'halfWall', 'triangleWall'
  const [currentFloor, setCurrentFloor] = useState(0);
  const [hoveredEdge, setHoveredEdge] = useState(null);

  // Wall placement state - for drag-to-orient
  const [placingWall, setPlacingWall] = useState(null); // { edge, startX, startY }
  const [wallSide, setWallSide] = useState(0); // -1, 0, or 1

  // Filter to only valid shapes (those with at least 3 vertices)
  const validShapes = useMemo(() => {
    return shapes.filter(shape => shape._verts && shape._verts.length >= 3);
  }, [shapes]);

  // Extract edges from foundation shapes for wall placement
  const foundationEdges = useMemo(() => {
    const edges = [];
    validShapes.forEach((shape, shapeIndex) => {
      const verts = shape._verts || [];
      for (let i = 0; i < verts.length; i++) {
        const start = verts[i];
        const end = verts[(i + 1) % verts.length];
        edges.push({
          id: `${shapeIndex}-${i}`,
          start,
          end,
          shapeIndex,
          building: shape.building || 'atreides',
        });
      }
    });
    return edges;
  }, [validShapes]);

  // Check if a wall already exists at this edge and floor
  const wallExistsAt = useCallback((edgeStart, edgeEnd, floor) => {
    return walls.some(w =>
      w.floor === floor &&
      ((w.start.x === edgeStart.x && w.start.y === edgeStart.y &&
        w.end.x === edgeEnd.x && w.end.y === edgeEnd.y) ||
       (w.start.x === edgeEnd.x && w.start.y === edgeEnd.y &&
        w.end.x === edgeStart.x && w.end.y === edgeStart.y))
    );
  }, [walls]);

  // Handle pointer down on edge - start wall placement
  const handleEdgePointerDown = useCallback((edge, event) => {
    event.stopPropagation();
    setPlacingWall({
      edge,
      startX: event.clientX,
      startY: event.clientY,
    });
    setWallSide(0);
  }, []);

  // Handle pointer move - update wall side based on drag
  const handlePointerMove = useCallback((event) => {
    if (!placingWall) return;

    const deltaX = event.clientX - placingWall.startX;
    // Determine side based on horizontal drag direction
    if (Math.abs(deltaX) > 20) {
      setWallSide(deltaX > 0 ? 1 : -1);
    } else {
      setWallSide(0);
    }
  }, [placingWall]);

  // Handle pointer up - place the wall
  const handlePointerUp = useCallback(() => {
    if (!placingWall) return;

    const edge = placingWall.edge;
    const wallHeight = selectedWallType === 'halfWall' ? HALF_WALL_HEIGHT : WALL_HEIGHT;
    const newWalls = [];

    // Auto-fill: add full walls for all floors below current floor
    for (let f = 0; f < currentFloor; f++) {
      if (!wallExistsAt(edge.start, edge.end, f)) {
        newWalls.push({
          id: Date.now() + f,
          type: 'wall',
          start: edge.start,
          end: edge.end,
          height: WALL_HEIGHT,
          building: edge.building,
          floor: f,
          side: wallSide,
        });
      }
    }

    // Add the wall at current floor
    if (!wallExistsAt(edge.start, edge.end, currentFloor)) {
      newWalls.push({
        id: Date.now() + currentFloor,
        type: selectedWallType,
        start: edge.start,
        end: edge.end,
        height: wallHeight,
        building: edge.building,
        floor: currentFloor,
        side: wallSide,
      });
    }

    if (newWalls.length > 0) {
      setWalls(prev => [...prev, ...newWalls]);
    }

    setPlacingWall(null);
    setWallSide(0);
  }, [placingWall, selectedWallType, currentFloor, wallSide, wallExistsAt]);

  // Handle roof placement - store shape ID reference instead of copying vertices
  const handleAddRoof = useCallback(() => {
    validShapes.forEach((shape, index) => {
      if (shape._verts && shape._verts.length >= 3) {
        setRoofs(prev => [...prev, {
          id: `roof-${Date.now()}-${index}`,
          shapeId: shape.id, // Reference to shape instead of copying vertices
          shapeIndex: index,
          building: shape.building || 'atreides',
          floor: currentFloor + 1,
        }]);
      }
    });
  }, [validShapes, currentFloor, setRoofs]);

  // Calculate camera position based on scene bounds
  const cameraPosition = useMemo(() => {
    if (shapes.length === 0) return [200, 200, 200];

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    shapes.forEach(shape => {
      const verts = shape._verts || [];
      verts.forEach(v => {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      });
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const size = Math.max(maxX - minX, maxY - minY, 100);

    return [centerX + size, size * 1.5, centerY + size];
  }, [shapes]);

  const cameraTarget = useMemo(() => {
    if (shapes.length === 0) return [0, 0, 0];

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    shapes.forEach(shape => {
      const verts = shape._verts || [];
      verts.forEach(v => {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      });
    });

    return [(minX + maxX) / 2, 0, (minY + maxY) / 2];
  }, [shapes]);

  // Calculate scene center for ground plane positioning
  const sceneCenter = useMemo(() => {
    if (shapes.length === 0) return { x: 0, z: 0, size: 500 };

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    shapes.forEach(shape => {
      const verts = shape._verts || [];
      verts.forEach(v => {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      });
    });

    const size = Math.max(maxX - minX, maxY - minY, 200) * 2;
    return {
      x: (minX + maxX) / 2,
      z: (minY + maxY) / 2,
      size: size
    };
  }, [shapes]);

  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col">
      {/* Toolbar */}
      <div className="bg-slate-800 p-4 flex items-center gap-4 border-b border-slate-700">
        <button
          onClick={onBack}
          className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to 2D
        </button>

        <div className="h-8 w-px bg-slate-600" />

        <span className="text-slate-400 text-sm">Wall Type:</span>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedWallType('wall')}
            className={`px-3 py-1.5 rounded-lg text-sm ${selectedWallType === 'wall' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            Full Wall
          </button>
          <button
            onClick={() => setSelectedWallType('halfWall')}
            className={`px-3 py-1.5 rounded-lg text-sm ${selectedWallType === 'halfWall' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            Half Wall
          </button>
          <button
            onClick={() => setSelectedWallType('triangleWall')}
            className={`px-3 py-1.5 rounded-lg text-sm ${selectedWallType === 'triangleWall' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            Triangle
          </button>
        </div>

        <div className="h-8 w-px bg-slate-600" />

        <span className="text-slate-400 text-sm">Floor:</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentFloor(Math.max(0, currentFloor - 1))}
            className="bg-slate-700 hover:bg-slate-600 text-white w-8 h-8 rounded-lg"
          >
            -
          </button>
          <span className="text-white w-8 text-center">{currentFloor}</span>
          <button
            onClick={() => setCurrentFloor(currentFloor + 1)}
            className="bg-slate-700 hover:bg-slate-600 text-white w-8 h-8 rounded-lg"
          >
            +
          </button>
        </div>

        <div className="h-8 w-px bg-slate-600" />

        <button
          onClick={handleAddRoof}
          className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg"
        >
          Add Roof (Floor {currentFloor + 1})
        </button>

        <div className="h-8 w-px bg-slate-600" />

        <button
          onClick={() => setWalls([])}
          className="bg-red-600/80 hover:bg-red-500 text-white px-4 py-2 rounded-lg"
        >
          Clear Walls
        </button>

        <div className="flex-1" />

        <div className="text-slate-400 text-sm">
          {validShapes.length} foundations | {walls.length} walls | {roofs.length} roofs
        </div>
      </div>

      {/* 3D Canvas */}
      <div
        className="flex-1"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <Canvas shadows>
          <PerspectiveCamera makeDefault position={cameraPosition} />
          <OrbitControls target={cameraTarget} enabled={!placingWall} />

          {/* Lighting */}
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[100, 200, 100]}
            intensity={1}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />

          {/* Ground plane - centered on shapes */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[sceneCenter.x, -1, sceneCenter.z]} receiveShadow>
            <planeGeometry args={[sceneCenter.size, sceneCenter.size]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>

          {/* Grid helper - centered on shapes */}
          <gridHelper
            args={[sceneCenter.size, Math.floor(sceneCenter.size / 50), '#334155', '#1e293b']}
            position={[sceneCenter.x, 0.1, sceneCenter.z]}
          />

          {/* Foundations */}
          {validShapes.map((shape, index) => (
            <Foundation
              key={shape.id || index}
              vertices={shape._verts || []}
              building={shape.building}
            />
          ))}

          {/* Clickable edges for wall placement */}
          {foundationEdges.map((edge) => (
            <mesh
              key={edge.id}
              position={[
                (edge.start.x + edge.end.x) / 2,
                FOUNDATION_HEIGHT + 2,
                (edge.start.y + edge.end.y) / 2,
              ]}
              rotation={[0, -Math.atan2(edge.end.y - edge.start.y, edge.end.x - edge.start.x), 0]}
              onPointerDown={(e) => handleEdgePointerDown(edge, e)}
              onPointerOver={() => setHoveredEdge(edge.id)}
              onPointerOut={() => setHoveredEdge(null)}
            >
              <boxGeometry args={[
                Math.sqrt(Math.pow(edge.end.x - edge.start.x, 2) + Math.pow(edge.end.y - edge.start.y, 2)),
                4,
                8,
              ]} />
              <meshStandardMaterial
                color={hoveredEdge === edge.id ? '#fbbf24' : '#4ade80'}
                transparent
                opacity={hoveredEdge === edge.id ? 0.8 : 0.3}
              />
            </mesh>
          ))}

          {/* Wall placement preview */}
          {placingWall && (
            <WallPreview
              start={placingWall.edge.start}
              end={placingWall.edge.end}
              height={selectedWallType === 'halfWall' ? HALF_WALL_HEIGHT : WALL_HEIGHT}
              floor={currentFloor}
              side={wallSide}
              type={selectedWallType}
            />
          )}

          {/* Walls */}
          {walls.map((wall) => {
            if (wall.type === 'triangleWall') {
              return (
                <TriangleWall
                  key={wall.id}
                  start={wall.start}
                  end={wall.end}
                  building={wall.building}
                  floor={wall.floor}
                  side={wall.side || 0}
                />
              );
            }
            return (
              <Wall
                key={wall.id}
                start={wall.start}
                end={wall.end}
                height={wall.height}
                building={wall.building}
                floor={wall.floor}
                side={wall.side || 0}
              />
            );
          })}

          {/* Roofs */}
          {roofs.map((roof) => (
            <FlatRoof
              key={roof.id}
              shapes={validShapes}
              shapeId={roof.shapeId}
              shapeIndex={roof.shapeIndex}
              building={roof.building}
              floor={roof.floor}
            />
          ))}
        </Canvas>
      </div>

      {/* Instructions */}
      <div className="bg-slate-800/50 px-4 py-2 text-center text-slate-400 text-sm">
        <span className="text-green-400">Click & drag edges</span> to place walls (drag left/right to flip side) |
        <span className="ml-2">Higher floors auto-fill walls below</span> |
        <span className="ml-2">Scroll</span> to zoom |
        <span className="ml-2">Right-drag</span> to pan
      </div>
    </div>
  );
}
