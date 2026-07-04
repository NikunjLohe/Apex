import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { RANKS as DEFAULT_RANKS } from '../data/ranks'


const RanksContext = createContext(null)

// Function to construct arrays from raw Firestore data
function buildConfigFromRanksList(ranksList) {
  // Sort by rank number ascending
  const sorted = [...ranksList].sort((a, b) => a.rank - b.rank)

  const RANKS = sorted.map(r => ({
    rank: r.rank,
    code: r.code,
    name: r.name,
    recruitPermission: r.recruitPermission !== undefined ? Boolean(r.recruitPermission) : (Number(r.rank) > 1),
    promoDesc: r.promoDesc || '',
    status: r.status || 'active',
  }))

  return {
    RANKS,
  }
}

export function RanksProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [ranksList, setRanksList] = useState([])

  useEffect(() => {
    const ref = doc(db, 'config', 'ranks')
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setRanksList(snap.data().ranks || [])
        } else {
          setRanksList([])
        }
        setLoading(false)
      },
      () => {
        setLoading(false)
      }
    )
  }, [])

  const config = useMemo(() => {
    if (ranksList.length === 0) {
      // Fallback configuration
      return {
        RANKS: DEFAULT_RANKS.map(r => ({
          ...r,
          recruitPermission: Number(r.rank) > 1,
          promoDesc: '',
          status: 'active',
        })),
      }
    }
    return buildConfigFromRanksList(ranksList)
  }, [ranksList])

  const getRank = (rankNum) => {
    const list = config.RANKS
    const idx = (Number(rankNum) || 1) - 1
    return list[idx] || list[list.length - 1] || { rank: rankNum, code: 'R' + rankNum, name: 'Rank ' + rankNum }
  }

  const rankCode = (rankNum) => getRank(rankNum).code
  const rankName = (rankNum) => getRank(rankNum).name
  const nextRank = (rankNum) => config.RANKS[Number(rankNum)] || null

  const saveRanks = async (updatedList) => {
    const ref = doc(db, 'config', 'ranks')
    await setDoc(ref, {
      ranks: updatedList.map(r => ({
        rank: Number(r.rank),
        code: r.code || '',
        name: r.name || '',
        mfa: Number(r.mfa) || 0,
        mfaTarget: Number(r.mfaTarget) || 0,
        ta: Number(r.ta) || 0,
        pbTarget: Number(r.pbTarget) || 0,
        pbAmount: Number(r.pbAmount) || 0,
        promoTarget: Number(r.promoTarget) || 0,
        cmdTarget: Number(r.cmdTarget) || 0,
        cmdAmount: Number(r.cmdAmount) || 0,
        mdaY1: r.mdaY1.map(val => Number(val) || 0),
        mdaY2: r.mdaY2.map(val => val === null ? null : Number(val) || 0),
        fdPension: r.fdPension.map(val => Number(val) || 0),
        recruitPermission: r.recruitPermission !== undefined ? Boolean(r.recruitPermission) : (Number(r.rank) > 1),
        promoDesc: r.promoDesc || '',
        status: r.status || 'active',
      })),
      updatedAt: serverTimestamp(),
    })
  }

  const value = useMemo(() => ({
    ranksList,
    config,
    getRank,
    rankCode,
    rankName,
    nextRank,
    loading,
    saveRanks,
  }), [ranksList, config, loading])

  return (
    <RanksContext.Provider value={value}>
      {children}
    </RanksContext.Provider>
  )
}

export function useRanks() {
  const context = useContext(RanksContext)
  if (!context) {
    throw new Error('useRanks must be used within a RanksProvider')
  }
  return context
}
