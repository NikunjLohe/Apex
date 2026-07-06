import { useState, useCallback, useRef, useEffect } from 'react'
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore'
import { db } from '../../firebase'
import { formatINR } from '../../utils/format'
import RankBadge from './RankBadge'
import StatusBadge from './StatusBadge'
import EmptyState from './EmptyState'
import { ISearch, IChevronDown, IChevron } from './icons'

// ─────────────────────────────────────────────────────────────────────────────
// Firestore helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch a single user document */
async function fetchUser(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/** Fetch direct children of a given parent uid */
async function fetchChildren(parentUid) {
  const q = query(collection(db, 'users'), where('referredBy', '==', parentUid))
  const snaps = await getDocs(q)
  return snaps.docs.map(d => ({ id: d.id, ...d.data() }))
}

/** Search users by name fragment (client-side filtered from a limited query) */
async function searchUsers(term) {
  // Firestore has no native full-text search. We load a small amount matching
  // the start of the name or sponsorCode. For a deep org, recommend Algolia/Typesense
  // as future improvement. Here we query where name >= term and name <= term + '\uf8ff'
  // which covers prefix searches on the indexed 'name' field.
  const upper = term[0].toUpperCase() + term.slice(1)
  const lower = term[0].toLowerCase() + term.slice(1)

  const [snapsUpper, snapsCode] = await Promise.all([
    getDocs(query(
      collection(db, 'users'),
      where('name', '>=', upper),
      where('name', '<=', upper + '\uf8ff')
    )),
    getDocs(query(
      collection(db, 'users'),
      where('sponsorCode', '>=', term.toUpperCase()),
      where('sponsorCode', '<=', term.toUpperCase() + '\uf8ff')
    )),
  ])

  const results = new Map()
  ;[...snapsUpper.docs, ...snapsCode.docs].forEach(d => {
    if (!results.has(d.id)) results.set(d.id, { id: d.id, ...d.data() })
  })
  return [...results.values()].slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// GenealogyTree Component
// ─────────────────────────────────────────────────────────────────────────────

export default function GenealogyTree({ rootId = null }) {
  // ── Lazy node cache: id → { ...userData, childrenIds?: string[], childrenLoaded: bool } ──
  const [nodeCache, setNodeCache] = useState({})

  // ── Expanded nodes set ──
  const [expandedNodes, setExpandedNodes] = useState(new Set())

  // ── Loading state per node (to show spinners) ──
  const [loadingNodes, setLoadingNodes] = useState(new Set())

  // ── Root ID in tree ──
  const [treeRootId, setTreeRootId] = useState(null)

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchDebounce = useRef(null)

  // ── Zoom / Pan ──
  const [zoom, setZoom] = useState(0.7)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const containerRef = useRef(null)
  const canvasRef = useRef(null)

  // ── Merge nodes into cache ──
  const mergeNodes = useCallback((nodes) => {
    setNodeCache(prev => {
      const next = { ...prev }
      nodes.forEach(n => {
        next[n.id] = { ...next[n.id], ...n }
      })
      return next
    })
  }, [])

  // ── Initialize root node ──
  useEffect(() => {
    if (!rootId) return
    setTreeRootId(rootId)
    setNodeCache({})
    setExpandedNodes(new Set())

    ;(async () => {
      const rootNode = await fetchUser(rootId)
      if (!rootNode) return
      setNodeCache({ [rootId]: { ...rootNode, childrenLoaded: false } })

      // Pre-load the immediate children count so we know if there's a toggle
      const children = await fetchChildren(rootId)
      setNodeCache(prev => ({
        ...prev,
        [rootId]: {
          ...prev[rootId],
          childrenLoaded: true,
          childrenIds: children.map(c => c.id),
        }
      }))
      mergeNodes(children.map(c => ({ ...c, childrenLoaded: false })))
      setExpandedNodes(new Set([rootId]))

      // Auto-fit: centre the tree in the canvas after a short paint delay
      setTimeout(() => {
        const canvas = containerRef.current
        const content = canvasRef.current
        if (!canvas || !content) return
        const cw = canvas.clientWidth
        const ch = canvas.clientHeight
        const tw = content.scrollWidth
        const th = content.scrollHeight
        const fitZoom = Math.min(0.9, Math.min(cw / (tw + 80), ch / (th + 80)))
        const centeredZoom = Math.max(0.3, fitZoom)
        setZoom(centeredZoom)
        setPan({ x: (cw - tw * centeredZoom) / 2, y: 20 })
      }, 120)
    })()
  }, [rootId])

  // ── Expand a node: load its children on demand ──
  const expandNode = useCallback(async (nodeId, e) => {
    e?.stopPropagation()
    const cached = nodeCache[nodeId]
    if (!cached) return

    // If already expanded, collapse
    if (expandedNodes.has(nodeId)) {
      setExpandedNodes(prev => { const n = new Set(prev); n.delete(nodeId); return n })
      return
    }

    // If children already loaded, just expand
    if (cached.childrenLoaded) {
      setExpandedNodes(prev => new Set([...prev, nodeId]))
      return
    }

    // Fetch children from Firestore
    setLoadingNodes(prev => new Set([...prev, nodeId]))
    try {
      const children = await fetchChildren(nodeId)
      setNodeCache(prev => ({
        ...prev,
        [nodeId]: {
          ...prev[nodeId],
          childrenLoaded: true,
          childrenIds: children.map(c => c.id),
        }
      }))
      mergeNodes(children.map(c => ({ ...c, childrenLoaded: false })))
      setExpandedNodes(prev => new Set([...prev, nodeId]))
    } catch (err) {
      console.error('Failed to load children for', nodeId, err)
    } finally {
      setLoadingNodes(prev => { const n = new Set(prev); n.delete(nodeId); return n })
    }
  }, [nodeCache, expandedNodes, mergeNodes])

  // ── Search: debounced Firestore query ──
  useEffect(() => {
    const term = searchQuery.trim()
    if (!term || term.length < 2) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }

    clearTimeout(searchDebounce.current)
    setSearching(true)
    searchDebounce.current = setTimeout(async () => {
      try {
        const results = await searchUsers(term)
        setSearchResults(results)
        setSearchOpen(results.length > 0)
      } catch (err) {
        console.error('Search failed:', err)
      } finally {
        setSearching(false)
      }
    }, 350)

    return () => clearTimeout(searchDebounce.current)
  }, [searchQuery])

  // ── Select search result: traverse ancestors to root and expand the path ──
  const selectSearchResult = useCallback(async (targetNode) => {
    setSearchQuery(targetNode.name)
    setSearchOpen(false)
    setSearchResults([])

    // Build ancestor chain: walk referredBy up to the tree root
    const chain = [targetNode]
    let current = targetNode

    while (current.referredBy && current.referredBy !== treeRootId) {
      let parent = nodeCache[current.referredBy]
      if (!parent) {
        parent = await fetchUser(current.referredBy)
        if (!parent) break
      }
      chain.unshift(parent)
      current = parent
    }

    // Merge all ancestor nodes into cache and expand them
    const newCache = { ...nodeCache }
    const toExpand = new Set(expandedNodes)

    for (let i = 0; i < chain.length; i++) {
      const n = chain[i]
      const nextNode = chain[i + 1]

      if (!newCache[n.id]) newCache[n.id] = { ...n, childrenLoaded: false }

      // Load children if not already cached, ensuring this link exists
      if (!newCache[n.id].childrenLoaded) {
        const children = await fetchChildren(n.id)
        newCache[n.id] = {
          ...newCache[n.id],
          childrenLoaded: true,
          childrenIds: children.map(c => c.id),
        }
        children.forEach(c => {
          if (!newCache[c.id]) newCache[c.id] = { ...c, childrenLoaded: false }
        })
      }

      toExpand.add(n.id)
    }

    // Make sure the target node itself is merged
    if (!newCache[targetNode.id]) {
      newCache[targetNode.id] = { ...targetNode, childrenLoaded: false }
    }

    setNodeCache(newCache)
    setExpandedNodes(toExpand)
  }, [nodeCache, expandedNodes, treeRootId])

  // ── Zoom / Pan handlers ──
  const zoomIn  = () => setZoom(z => Math.min(2,   parseFloat((z + 0.1).toFixed(1))))
  const zoomOut = () => setZoom(z => Math.max(0.2, parseFloat((z - 0.1).toFixed(1))))
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }) }
  const fitView = () => {
    const canvas  = containerRef.current
    const content = canvasRef.current
    if (!canvas || !content) return
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    const tw = content.scrollWidth
    const th = content.scrollHeight
    const fitZoom = Math.max(0.2, Math.min(0.95, Math.min(cw / (tw + 80), ch / (th + 80))))
    setZoom(fitZoom)
    setPan({ x: (cw - tw * fitZoom) / 2, y: 20 })
  }

  const handleMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return
    setIsDragging(true)
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }
  const handleMouseMove = (e) => {
    if (!isDragging) return
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y })
  }
  const handleMouseUp = () => setIsDragging(false)

  // ── Wheel: Ctrl+scroll = zoom, plain scroll = vertical pan ──
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom(z => Math.min(2, Math.max(0.2, parseFloat((z + delta).toFixed(1)))))
    } else {
      // allow natural vertical scroll – do NOT prevent default
      setPan(p => ({ ...p, y: p.y - e.deltaY * 0.8 }))
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // passive:false only needed when we call preventDefault (Ctrl+wheel path),
    // but we need non-passive to be able to prevent it conditionally.
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        setZoom(z => Math.min(2, Math.max(0.2, parseFloat((z + delta).toFixed(1)))))
      } else {
        setPan(p => ({ ...p, y: p.y - e.deltaY * 0.8 }))
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── Render a single tree node recursively ──
  const renderNode = useCallback((nodeId) => {
    const node = nodeCache[nodeId]
    if (!node) return null

    const isExpanded = expandedNodes.has(nodeId)
    const isLoading = loadingNodes.has(nodeId)
    const childrenIds = node.childrenIds || []
    const hasChildren = childrenIds.length > 0 || !node.childrenLoaded
    const initials = (node.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

    // Highlight searched node
    const isHighlighted = searchQuery.trim().length >= 2 && (
      node.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.sponsorCode?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
      <div className="flex flex-col items-center relative" key={nodeId}>
        {/* Node Card */}
        <div
          className={`relative z-10 card p-4 w-52 bg-navy-3 border transition-all ${
            isHighlighted
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
          </div>

          {/* Expand / Collapse Button */}
          {hasChildren && (
            <button
              onClick={(e) => expandNode(nodeId, e)}
              disabled={isLoading}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-navy-4 bg-navy-3 text-ink-2 hover:text-gold hover:border-gold-1/50 shadow-md transition-all z-20 disabled:opacity-50"
            >
              {isLoading
                ? <span className="animate-spin text-gold text-[10px]">⟳</span>
                : isExpanded
                  ? <IChevronDown size={10} />
                  : <IChevron size={10} className="rotate-90" />
              }
            </button>
          )}
        </div>

        {/* Children render only when expanded and loaded */}
        {isExpanded && node.childrenLoaded && childrenIds.length > 0 && (
          <div className="flex gap-6 mt-10 relative pt-4">
            {/* Top vertical connector from parent */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-navy-4/80" />

            {/* Horizontal connector across all siblings */}
            <div
              className="absolute top-4 bg-navy-4/80 h-0.5"
              style={{
                left: `calc((100% / ${childrenIds.length}) / 2)`,
                right: `calc((100% / ${childrenIds.length}) / 2)`
              }}
            />

            {childrenIds.map(childId => (
              <div className="relative" key={childId}>
                {/* Child vertical connector up to horizontal */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-navy-4/80" />
                {renderNode(childId)}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }, [nodeCache, expandedNodes, loadingNodes, searchQuery, expandNode])

  const isInitializing = !treeRootId || !nodeCache[treeRootId]

  return (
    <div className="relative card overflow-hidden bg-navy-2 border border-navy-4 h-[700px] flex flex-col">
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
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-2 animate-pulse">
              Searching…
            </span>
          )}

          {/* Search Dropdown */}
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 left-0 w-full bg-navy-3 border border-navy-4 rounded-card shadow-xl z-30 max-h-52 overflow-y-auto">
              {searchResults.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectSearchResult(r)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-navy-2 transition-colors"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-1/10 text-[10px] font-bold text-gold">
                    {r.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold text-ink-1 truncate">{r.name}</span>
                    <span className="block text-[10px] text-ink-2 font-mono">{r.sponsorCode || '—'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5 bg-navy-3/95 border border-navy-4 rounded-card px-2 py-1 shadow-md">
          <button onClick={zoomOut} className="btn-ghost p-1 text-ink-2 hover:text-gold" title="Zoom Out (or Ctrl+Scroll)">−</button>
          <span className="text-[10px] font-mono font-bold text-ink-2 px-1 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="btn-ghost p-1 text-ink-2 hover:text-gold" title="Zoom In (or Ctrl+Scroll)">+</button>
          <div className="h-4 w-px bg-navy-4 mx-1" />
          <button onClick={fitView} className="text-[10px] font-bold uppercase tracking-wider text-gold-1 hover:text-gold hover:underline px-1.5" title="Fit all nodes in view">Fit</button>
          <div className="h-4 w-px bg-navy-4 mx-1" />
          <button onClick={resetView} className="text-[10px] font-bold uppercase tracking-wider text-ink-2 hover:text-gold hover:underline px-1.5">Reset</button>
        </div>
        <span className="hidden sm:inline text-[10px] text-ink-2/60 ml-1">Drag to pan · Ctrl+scroll to zoom</span>

        {/* Loading indicator */}
        {isInitializing && (
          <span className="text-[10px] text-ink-2 animate-pulse">Loading tree…</span>
        )}
      </div>

      {/* Interactive Visualizer Canvas */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden relative select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {!isInitializing ? (
          <div
            ref={canvasRef}
            className="absolute origin-top-left flex justify-center p-16"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              minWidth: 'max-content',
              transition: isDragging ? 'none' : 'transform 0.08s ease-out',
            }}
          >
            {renderNode(treeRootId)}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <EmptyState title="No tree data" message="Add members to build the genealogy network tree." />
          </div>
        )}
      </div>
    </div>
  )
}
