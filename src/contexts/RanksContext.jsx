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

  // Build legacy flat arrays expected by Settings.jsx, CmdAwards.jsx, earnings.js, etc.
  const MFA               = sorted.map(r => Number(r.mfa) || 0)
  const MFA_TARGET        = sorted.map(r => Number(r.mfaTarget) || 0)
  const TA                = sorted.map(r => Number(r.ta) || 0)
  const PB_TARGET         = sorted.map(r => Number(r.pbTarget) || 0)
  const PB_AMOUNT         = sorted.map(r => Number(r.pbAmount) || 0)
  const PROMO_TARGET      = sorted.map(r => Number(r.promoTarget) || 0)
  const CMD_AWARD_TARGET  = sorted.map(r => Number(r.cmdTarget) || 0)
  const CMD_AWARD_AMOUNT  = sorted.map(r => Number(r.cmdAmount) || 0)
  const MDA               = sorted.map(r => ({
    y1: Array.isArray(r.mdaY1) ? r.mdaY1.map(v => Number(v) / 100) : [0, 0, 0, 0, 0],
    y2: Array.isArray(r.mdaY2) ? r.mdaY2.map(v => v === null ? null : Number(v) / 100) : [null, 0, 0, 0, 0],
  }))
  const FD_PENSION        = sorted.map(r =>
    Array.isArray(r.fdPension) ? r.fdPension.map(v => Number(v) / 100) : [0, 0, 0, 0, 0]
  )

  return {
    RANKS,
    MFA,
    MFA_TARGET,
    TA,
    PB_TARGET,
    PB_AMOUNT,
    PROMO_TARGET,
    CMD_AWARD_TARGET,
    CMD_AWARD_AMOUNT,
    MDA,
    FD_PENSION,
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
    const EMPTY_ARR = DEFAULT_RANKS.map(() => 0)
    const EMPTY_MDA = DEFAULT_RANKS.map(() => ({ y1: [0,0,0,0,0], y2: [null,0,0,0,0] }))
    const EMPTY_FD  = DEFAULT_RANKS.map(() => [0,0,0,0,0])

    if (ranksList.length === 0) {
      // Fallback configuration — safe empty arrays prevent crashes before Firestore loads
      return {
        RANKS: DEFAULT_RANKS.map(r => ({
          ...r,
          recruitPermission: Number(r.rank) > 1,
          promoDesc: '',
          status: 'active',
        })),
        MFA: EMPTY_ARR,
        MFA_TARGET: EMPTY_ARR,
        TA: EMPTY_ARR,
        PB_TARGET: EMPTY_ARR,
        PB_AMOUNT: EMPTY_ARR,
        PROMO_TARGET: EMPTY_ARR,
        CMD_AWARD_TARGET: EMPTY_ARR,
        CMD_AWARD_AMOUNT: EMPTY_ARR,
        MDA: EMPTY_MDA,
        FD_PENSION: EMPTY_FD,
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
    ranksList: ranksList.length > 0 ? ranksList : DEFAULT_RANKS,
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
