import { RANKS as DEFAULT_RANKS } from './src/data/ranks.js';

function getRank(rankNum) {
    const list = DEFAULT_RANKS.map(r => ({
        ...r,
        recruitPermission: Number(r.rank) > 1,
        promoDesc: '',
        status: 'active',
    }));
    const idx = (Number(rankNum) || 1) - 1;
    return list[idx] || list[list.length - 1] || { rank: rankNum, code: 'R' + rankNum, name: 'Rank ' + rankNum };
}

console.log(getRank(99).code);
