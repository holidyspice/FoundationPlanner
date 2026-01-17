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

// Foundation piece component
function Foundation({ vertices, building = 'atreides', onClick }) {
  const color = BUILDING_COLORS[building]?.foundation || BUILDING_COLORS.atreides.foundation;

  // Create shape from vertices
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    if (vertices.length > 0) {
      s.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        s.lineTo(vertices[i].x, vertices[i].y);
      }
      s.closePath();
    }
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

// Wall piece component
function Wall({ start, end, height = WALL_HEIGHT, building = 'atreides', floor = 0 }) {
  const color = BUILDING_COLORS[building]?.wall || BUILDING_COLORS.atreides.wall;

  // Calculate wall position and dimensions
  const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const baseHeight = floor * WALL_HEIGHT + FOUNDATION_HEIGHT;

  return (
    <mesh
      position={[midX, baseHeight + height / 2, midY]}
      rotation={[0, -angle, 0]}
    >
      <boxGeometry args={[length, height, 5]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// Triangle wall (gable) component
function TriangleWall({ start, end, building = 'atreides', floor = 0 }) {
  const color = BUILDING_COLORS[building]?.wall || BUILDING_COLORS.atreides.wall;

  const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const baseHeight = floor * WALL_HEIGHT + FOUNDATION_HEIGHT;

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
      position={[midX, baseHeight, midY]}
      rotation={[0, -angle, Math.PI / 2]}
    >
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// Flat roof component
function FlatRoof({ vertices, building = 'atreides', floor = 1 }) {
  const color = BUILDING_COLORS[building]?.foundation || BUILDING_COLORS.atreides.foundation;

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    if (vertices.length > 0) {
      s.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        s.lineTo(vertices[i].x, vertices[i].y);
      }
      s.closePath();
    }
    return s;
  }, [vertices]);

  const extrudeSettings = {
    depth: 3,
    bevelEnabled: false,
  };

  const baseHeight = floor * WALL_HEIGHT + FOUNDATION_HEIGHT;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, baseHeight, 0]}
    >
      <extrudeGeometry args={[shape, extrudeSettings]} />
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

// Main 3D Viewer component
export default function Viewer3D({ shapes, buildingType, onBack }) {
  const [walls, setWalls] = useState([]);
  const [roofs, setRoofs] = useState([]);
  const [selectedWallType, setSelectedWallType] = useState('wall'); // 'wall', 'halfWall', 'triangleWall'
  const [currentFloor, setCurrentFloor] = useState(0);
  const [hoveredEdge, setHoveredEdge] = useState(null);

  // Extract edges from foundation shapes for wall placement
  const foundationEdges = useMemo(() => {
    const edges = [];
    shapes.forEach((shape, shapeIndex) => {
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
  }, [shapes]);

  // Handle edge click for wall placement
  const handleEdgeClick = useCallback((edge) => {
    const wallHeight = selectedWallType === 'halfWall' ? HALF_WALL_HEIGHT : WALL_HEIGHT;

    const newWall = {
      id: Date.now(),
      type: selectedWallType,
      start: edge.start,
      end: edge.end,
      height: wallHeight,
      building: edge.building,
      floor: currentFloor,
    };

    setWalls(prev => [...prev, newWall]);
  }, [selectedWallType, currentFloor]);

  // Handle roof placement
  const handleAddRoof = useCallback(() => {
    // For simplicity, add roofs based on all foundations
    shapes.forEach((shape, index) => {
      const verts = shape._verts || [];
      if (verts.length > 0) {
        setRoofs(prev => [...prev, {
          id: `roof-${Date.now()}-${index}`,
          vertices: verts,
          building: shape.building || 'atreides',
          floor: currentFloor + 1,
        }]);
      }
    });
  }, [shapes, currentFloor]);

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
          {shapes.length} foundations | {walls.length} walls | {roofs.length} roofs
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1">
        <Canvas shadows>
          <PerspectiveCamera makeDefault position={cameraPosition} />
          <OrbitControls target={cameraTarget} />

          {/* Lighting */}
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[100, 200, 100]}
            intensity={1}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />

          {/* Ground plane */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
            <planeGeometry args={[2000, 2000]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>

          {/* Grid helper */}
          <gridHelper args={[2000, 40, '#334155', '#1e293b']} position={[0, 0, 0]} />

          {/* Foundations */}
          {shapes.map((shape, index) => (
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
              onClick={() => handleEdgeClick(edge)}
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
              />
            );
          })}

          {/* Roofs */}
          {roofs.map((roof) => (
            <FlatRoof
              key={roof.id}
              vertices={roof.vertices}
              building={roof.building}
              floor={roof.floor}
            />
          ))}
        </Canvas>
      </div>

      {/* Instructions */}
      <div className="bg-slate-800/50 px-4 py-2 text-center text-slate-400 text-sm">
        <span className="text-green-400">Click green edges</span> to place walls |
        <span className="ml-2">Drag</span> to rotate view |
        <span className="ml-2">Scroll</span> to zoom |
        <span className="ml-2">Right-drag</span> to pan
      </div>
    </div>
  );
}
