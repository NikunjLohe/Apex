import { createContext, useCallback, useContext, useEffect, useState, useMemo } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { RANKS as DEFAULT_RANKS } from '../data/ranks'
import { DEFAULT_PROMOTION_RULES } from '../data/compensation'
import { getPromotionRules } from '../lib/supabase/masterData'


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
    requiredPromotedRank: r.requiredPromotedRank || '',
    requiredPromotedCount: Number(r.requiredPromotedCount) || 0,
    altRequiredPromotedRank: r.altRequiredPromotedRank || '',
    altRequiredPromotedCount: Number(r.altRequiredPromotedCount) || 0,
    mfa: Number(r.mfa) || 0,
    mfaTarget: Number(r.mfaTarget) || 0,
    promoTarget: Number(r.promoTarget) || 0,
  }))

  // Build legacy flat arrays expected by Settings.jsx, CmdAwards.jsx, earnings.js, etc.
  const MFA = sorted.map(r => Number(r.mfa) || 0)
  const MFA_TARGET = sorted.map(r => Number(r.mfaTarget) || 0)
  const PB_TARGET = sorted.map(r => Number(r.pbTarget) || 0)
  const PB_AMOUNT = sorted.map(r => Number(r.pbAmount) || 0)
  const PROMO_TARGET = sorted.map(r => Number(r.promoTarget) || 0)
  const CMD_AWARD_TARGET = sorted.map(r => Number(r.cmdTarget) || 0)
  const CMD_AWARD_AMOUNT = sorted.map(r => Number(r.cmdAmount) || 0)
  const MDA = sorted.map(r => ({
    y1: Array.isArray(r.mdaY1) ? r.mdaY1.map(v => Number(v) / 100) : [0, 0, 0, 0, 0],
    y2: Array.isArray(r.mdaY2) ? r.mdaY2.map(v => v === null ? null : Number(v) / 100) : [null, 0, 0, 0, 0],
  }))
  const FD_PENSION = sorted.map(r =>
    Array.isArray(r.fdPension) ? r.fdPension.map(v => Number(v) / 100) : [0, 0, 0, 0, 0]
  )

  return {
    RANKS,
    MFA,
    MFA_TARGET,
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
  const [promotionRules, setPromotionRules] = useState(DEFAULT_PROMOTION_RULES)

  const refreshPromotionRules = useCallback(async () => {
    try {
      const rules = await getPromotionRules()
      if (rules && Object.keys(rules).length > 0) {
        setPromotionRules(rules)
      }
    } catch {
      // Fallback to DEFAULT_PROMOTION_RULES
    }
  }, [])

  useEffect(() => {
    refreshPromotionRules()
  }, [refreshPromotionRules])

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
    const baseSource = ranksList.length > 0 ? ranksList : DEFAULT_RANKS
    const sorted = [...baseSource].sort((a, b) => a.rank - b.rank)

    const enrichedRanks = sorted.map((r) => {
      const rule = promotionRules?.[r.code] || DEFAULT_PROMOTION_RULES[r.code] || {}
      return {
        ...r,
        recruitPermission: r.recruitPermission !== undefined ? Boolean(r.recruitPermission) : (Number(r.rank) > 1),
        promoDesc: r.promoDesc || '',
        status: r.status || 'active',
        mfa: Number(r.rank) <= 10 ? (rule.mfa ?? Number(r.mfa || 0)) : 0,
        mfaTarget: Number(r.rank) <= 10 ? (rule.mfaTarget ?? Number(r.mfaTarget || 0)) : 0,
        pbTarget: rule.pbTarget ?? Number(r.pbTarget || 0),
        pbAmount: rule.pb ?? Number(r.pbAmount || 0),
        promoTarget: rule.businessTarget ?? Number(r.promoTarget || 0),
        cmdTarget: rule.cmdTarget ?? Number(r.cmdTarget || 0),
        cmdAmount: rule.cmd ?? Number(r.cmdAmount || 0),
        requiredPromotedRank: rule.requiredPromotedRank || '',
        requiredPromotedCount: Number(rule.requiredPromotedCount || 0),
        altRequiredPromotedRank: rule.altRequiredPromotedRank || '',
        altRequiredPromotedCount: Number(rule.altRequiredPromotedCount || 0),
      }
    })

    return buildConfigFromRanksList(enrichedRanks)
  }, [ranksList, promotionRules])


  const getRank = (rankNum) => {
    const list = config.RANKS
    const idx = (Number(rankNum) || 1) - 1
    return list[idx] || list[list.length - 1] || { rank: rankNum, code: 'R' + rankNum, name: 'Rank ' + rankNum }
  }

  const rankCode = (rankNum) => getRank(rankNum).code
  const rankName = (rankNum) => getRank(rankNum).name
  const nextRank = (rankNum) => {
    const nextNum = Number(rankNum) + 1
    return config.RANKS.find((r) => Number(r.rank) === nextNum) || config.RANKS[Number(rankNum)] || null
  }

  const saveRanks = async (updatedList) => {
    const ref = doc(db, 'config', 'ranks')
    await setDoc(ref, {
      ranks: updatedList.map(r => ({
        rank: Number(r.rank),
        code: r.code || '',
        name: r.name || '',
        mfa: Number(r.mfa) || 0,
        mfaTarget: Number(r.mfaTarget) || 0,
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
    promotionRules,
    refreshPromotionRules,
    getRank,
    rankCode,
    rankName,
    nextRank,
    loading,
    saveRanks,
  }), [ranksList, config, promotionRules, refreshPromotionRules, loading])

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
