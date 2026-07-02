import { useState, useMemo, useRef, useEffect } from 'react'
import { formatINR } from '../../utils/format'
import RankBadge from './RankBadge'
import StatusBadge from './StatusBadge'
import { ISearch, IChevronDown, IChevron } from './icons'

// Build hierarchy helper
const buildTreeData = (users, rootId) => {
  const map = {}
  users.forEach(u => {
    map[u.id] = { ...u, children: [], expanded: true }
  })

  let root = null
  const nodes = Object.values(map)

  nodes.forEach(node => {
    const parentId = node.referredBy
    if (parentId && map[parentId]) {
      map[parentId].children.push(node)
    }
  })

  // Find root
  if (rootId && map[rootId]) {
    root = map[rootId]
  } else {
    // If no root specified, find nodes that don't have parents inside the current list
    const candidates = nodes.filter(n => !n.referredBy || !map[n.referredBy])
    // Choose the highest rank or fallback
    root = candidates.sort((a, b) => (Number(b.rank) || 0) - (Number(a.rank) || 0))[0] || null
  }

  // Calculate downline and team stats recursively
  const calculateSubtree = (node) => {
    let count = 0
    let volume = node.businessVolume || 0
    node.children.forEach(child => {
      const stats = calculateSubtree(child)
      count += 1 + stats.count
      volume += stats.volume
    })
    node.teamSize = count
    node.teamVolume = volume
    return { count, volume }
  }

  if (root) {
    calculateSubtree(root)
  }

  return { root, map }
}

export default function GenealogyTree({ users = [], rootId = null }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const containerRef = useRef(null)

  // Internal node expansion state
  const [collapsedNodes, setCollapsedNodes] = useState(new Set())

  // Parse and build hierarchical tree data
  const { root, map } = useMemo(() => {
    return buildTreeData(users, rootId)
  }, [users, rootId])

  // Toggle node collapse
  const toggleNode = (nodeId, e) => {
    e.stopPropagation()
    setCollapsedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  // Handle Drag Panning
  const handleMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return
    setIsDragging(true)
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Zoom helpers
  const zoomIn = () => setZoom(z => Math.min(2, z + 0.1))
  const zoomOut = () => setZoom(z => Math.max(0.5, z - 0.1))
  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // Auto-expand searched nodes ancestors
  const matchedNodeIds = useMemo(() => {
    if (!searchQuery.trim() || !map) return new Set()
    const query = searchQuery.toLowerCase()
    const matched = new Set()
    
    Object.values(map).forEach(node => {
      if (
        node.name.toLowerCase().includes(query) || 
        (node.sponsorCode && node.sponsorCode.toLowerCase().includes(query))
      ) {
        matched.add(node.id)
        // Automatically expand its ancestors
        let parentId = node.referredBy
        while (parentId && map[parentId]) {
          collapsedNodes.delete(parentId)
          parentId = map[parentId].referredBy
        }
      }
    })
    return matched
  }, [searchQuery, map])

  // Center tree initially or when root changes
  useEffect(() => {
    resetView()
  }, [rootId])

  // Render node recursively
  const renderNode = (node) => {
    if (!node) return null
    const isCollapsed = collapsedNodes.has(node.id)
    const hasChildren = node.children && node.children.length > 0
    const isMatched = matchedNodeIds.has(node.id)

    // Initials for avatar fallback
    const initials = node.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

    return (
      <div className="flex flex-col items-center relative" key={node.id}>
        {/* Node Card */}
        <div 
          className={`relative z-10 card p-4 w-52 bg-navy-3 border transition-all ${
            isMatched 
              ? 'border-gold-1 ring-2 ring-gold-1/30 shadow-[0_0_15px_rgba(163,144,107,0.25)]' 
              : 'border-navy-4 hover:border-gold-1/30'
          }`}
        >
          {/* Avatar & Rank */}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-1/10 text-xs font-serif font-extrabold text-gold border border-gold-1/25">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-ink-1 truncate">{node.name}</span>
              <span className="block text-[10px] text-ink-2 font-mono truncate">{node.sponsorCode || '—'}</span>
            </div>
          </div>

          <div className="mt-2.5 border-t border-navy-4/50 pt-2 flex flex-col gap-1 text-[10px] text-ink-2">
            <div className="flex justify-between items-center">
              <span>Rank:</span>
              <RankBadge rank={node.rank} size="sm" />
            </div>
            <div className="flex justify-between items-center">
              <span>Status:</span>
              <StatusBadge status={node.status || 'active'} />
            </div>
            <div className="flex justify-between">
              <span>Personal BV:</span>
              <span className="font-bold text-ink-1">{formatINR(node.businessVolume || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Team Size:</span>
              <span className="font-semibold text-gold-tan">{node.teamSize || 0} agents</span>
            </div>
          </div>

          {/* Toggle Expand/Collapse Button */}
          {hasChildren && (
            <button 
              onClick={(e) => toggleNode(node.id, e)}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-navy-4 bg-navy-3 text-ink-2 hover:text-gold hover:border-gold-1/50 shadow-md transition-all z-20"
            >
              {isCollapsed ? <IChevron size={10} className="rotate-90" /> : <IChevronDown size={10} />}
            </button>
          )}
        </div>

        {/* Children Render */}
        {hasChildren && !isCollapsed && (
          <div className="flex gap-6 mt-10 relative pt-4">
            {/* Top vertical connector line coming from parent */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-navy-4/80" />

            {/* Horizontal line connector connecting all siblings */}
            <div 
              className="absolute top-4 bg-navy-4/80 h-0.5" 
              style={{
                left: `calc((100% / ${node.children.length}) / 2)`,
                right: `calc((100% / ${node.children.length}) / 2)`
              }}
            />

            {node.children.map((child, idx) => (
              <div className="relative" key={child.id}>
                {/* Child vertical connector line up to the horizontal connector */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-navy-4/80" />
                {renderNode(child)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative card overflow-hidden bg-navy-2 border border-navy-4 h-[600px] flex flex-col">
      {/* Controls & Search header */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap gap-2.5 items-center w-[calc(100%-2rem)]">
        {/* Search */}
        <div className="relative w-72 shrink-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2">
            <ISearch size={16} />
          </span>
          <input 
            type="text" 
            placeholder="Search Agent Name or Code..." 
            className="field pl-9 py-2 text-xs font-semibold bg-navy-3/95" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5 bg-navy-3/95 border border-navy-4 rounded-card px-2 py-1 shadow-md">
          <button onClick={zoomOut} className="btn-ghost p-1 text-ink-2 hover:text-gold" title="Zoom Out">-</button>
          <span className="text-[10px] font-mono font-bold text-ink-2 px-1 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="btn-ghost p-1 text-ink-2 hover:text-gold" title="Zoom In">+</button>
          <div className="h-4 w-px bg-navy-4 mx-1" />
          <button onClick={resetView} className="text-[10px] font-bold uppercase tracking-wider text-gold hover:underline px-1.5">Reset</button>
        </div>
      </div>

      {/* Interactive Visualizer Canvas */}
      <div 
        ref={containerRef}
        className={`flex-1 overflow-hidden relative cursor-grab select-none ${isDragging ? 'cursor-grabbing' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {root ? (
          <div 
            className="absolute origin-top-left transition-transform duration-75 flex justify-center p-20"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              minWidth: 'max-content'
            }}
          >
            {renderNode(root)}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <EmptyState title="No tree nodes found" message="Add members to build the genealogy network tree." />
          </div>
        )}
      </div>
    </div>
  )
}
