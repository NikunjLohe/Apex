import { useAuth } from '../../contexts/AuthContext'
import { useRanks } from '../../contexts/RanksContext'
import { formatINR, formatCompactINR } from '../../utils/format'

export default function CmdAwards() {
  const { profile } = useAuth()
  const { config } = useRanks()
  const RANKS = config.RANKS
  const CMD_AWARD_TARGET = config.CMD_AWARD_TARGET
  const CMD_AWARD_AMOUNT = config.CMD_AWARD_AMOUNT
  const myRank = profile?.rank || 1

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="card p-5">
        <h3 className="font-semibold text-ink-1">CMD Award Slabs</h3>
        <p className="mt-1 text-sm text-ink-2">
          Awards are based on <span className="text-gold">weighted business volume</span>. RD plans count only
          after 12 installments — weighted 25% (1Y), 50% (2Y) or 100% (3Y+). FD counts at full value.
          Qualification requires 80% from your main leg and at least 20% from other legs.
        </p>
      </div>

      <div className="table-wrap">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Rank</th><th>Weighted BV Target</th><th>Award Amount</th></tr></thead>
            <tbody>
              {RANKS.map((r, i) => (
                <tr key={r.rank} className={r.rank === myRank ? 'bg-gold-1/5' : ''}>
                  <td>
                    <span className="font-semibold text-ink-1">{r.code}</span>
                    <span className="ml-2 text-xs text-ink-2">{r.name}</span>
                    {r.rank === myRank && <span className="ml-2 rounded-full bg-gold-1/15 px-2 py-0.5 text-[10px] font-bold text-gold">YOU</span>}
                  </td>
                  <td className="text-ink-2">{formatCompactINR(CMD_AWARD_TARGET[i])}</td>
                  <td className="font-semibold text-gold">{formatINR(CMD_AWARD_AMOUNT[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
